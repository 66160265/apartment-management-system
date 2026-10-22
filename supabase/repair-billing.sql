-- ค่าซ่อมรวมในใบแจ้งหนี้ค่าห้อง: รันใน Supabase SQL Editor หลังรัน invoices.sql, repairs.sql, payments.sql และ repair-payments.sql (รันซ้ำได้)
--
-- แนวคิด: ค่าซ่อมที่ผู้เช่าต้องชำระ (ซ่อมเสร็จแล้ว, cost_payer = tenant, cost > 0) ไม่ต้องจ่ายแยก
--   ตอนสร้างใบแจ้งหนี้ใหม่ของห้องนั้น (ทีละใบหรือทั้งเดือน) ระบบรวมค่าซ่อมที่ยังไม่ได้เรียกเก็บเข้าไปในใบอัตโนมัติ
--   เก็บยอดไว้ใน invoices.repair_fee (รวมอยู่ใน total แล้ว) และจำว่าเรื่องซ่อมไหนอยู่ในใบไหนที่ repairs.invoice_id
--   ลบใบแจ้งหนี้ = เรื่องซ่อมกลับไปรอเรียกเก็บในใบถัดไป (on delete set null)
-- เรื่องเก่าที่ผู้เช่าส่งสลิปค่าซ่อมแยกไปแล้ว (รอตรวจ/ชำระแล้ว ใน repair_payments) ไม่ถูกนำมาเรียกเก็บซ้ำ

alter table public.invoices add column if not exists repair_fee numeric(12, 2) not null default 0;
alter table public.invoices drop constraint if exists invoices_repair_fee_check;
alter table public.invoices add constraint invoices_repair_fee_check check (repair_fee >= 0);

alter table public.repairs add column if not exists invoice_id uuid references public.invoices (id) on delete set null;
create index if not exists repairs_invoice_idx on public.repairs (invoice_id) where invoice_id is not null;

-- เรื่องซ่อมของห้อง/ผู้เช่านี้ที่ต้องเรียกเก็บในใบแจ้งหนี้ใบถัดไป
create or replace function public.repair_unbilled(p_room text, p_user uuid)
returns setof public.repairs
language sql
stable
security definer set search_path = public
as $$
  select r.* from public.repairs r
  where r.room = p_room
    and r.user_id is not distinct from p_user
    and r.status = 'done' and r.cost_payer = 'tenant' and r.cost > 0
    and r.invoice_id is null
    and not exists (select 1 from public.repair_payments p where p.repair_id = r.id and p.status in ('review', 'paid'));
$$;

revoke all on function public.repair_unbilled(text, uuid) from public, anon, authenticated;

-- ก่อนเพิ่มใบแจ้งหนี้: บวกค่าซ่อมที่ยังไม่ได้เรียกเก็บเข้ายอดรวม (ล็อกแถวไว้ กันสองใบดึงค่าซ่อมเดียวกัน)
create or replace function public.invoices_add_repair_fee()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_fee numeric;
begin
  perform 1 from public.repairs r where r.id in (select id from public.repair_unbilled(new.room, new.user_id)) for update;
  select coalesce(sum(cost), 0) into v_fee from public.repair_unbilled(new.room, new.user_id);
  new.repair_fee := v_fee;
  new.total := new.total + v_fee;
  return new;
end;
$$;

drop trigger if exists invoices_add_repair_fee on public.invoices;
create trigger invoices_add_repair_fee before insert on public.invoices
  for each row execute function public.invoices_add_repair_fee();

-- หลังเพิ่มใบแจ้งหนี้: ผูกเรื่องซ่อมที่ถูกรวมไว้กับใบนี้
create or replace function public.invoices_link_repairs()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.repair_fee > 0 then
    update public.repairs set invoice_id = new.id
    where id in (select id from public.repair_unbilled(new.room, new.user_id));
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_link_repairs on public.invoices;
create trigger invoices_link_repairs after insert on public.invoices
  for each row execute function public.invoices_link_repairs();

-- เรื่องที่รวมในใบแจ้งหนี้แล้ว ห้ามแก้ยอดค่าใช้จ่ายหรือผู้ชำระ (ไม่งั้นยอดในใบกับเรื่องซ่อมไม่ตรงกัน)
create or replace function public.repairs_lock_billed_cost()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.invoice_id is not null and new.invoice_id is not distinct from old.invoice_id
     and (new.cost is distinct from old.cost or new.cost_payer is distinct from old.cost_payer) then
    raise exception 'ค่าซ่อมนี้รวมในใบแจ้งหนี้แล้ว แก้ไขค่าใช้จ่ายไม่ได้ (ลบใบแจ้งหนี้นั้นก่อนถ้าต้องการแก้)';
  end if;
  return new;
end;
$$;

drop trigger if exists repairs_lock_billed_cost on public.repairs;
create trigger repairs_lock_billed_cost before update of cost, cost_payer on public.repairs
  for each row execute function public.repairs_lock_billed_cost();
