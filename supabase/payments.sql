-- การชำระเงินหลายครั้งต่อใบแจ้งหนี้ (โอนไม่ครบแล้วโอนส่วนที่เหลือเพิ่ม) และยอดที่ต้องโอนคืนเมื่อโอนเกิน
-- รันใน Supabase SQL Editor หลังรัน invoices.sql และ notifications.sql (รันซ้ำได้) ต้องรัน notifications.sql ใหม่อีกครั้งด้วย
-- เพราะ trigger แจ้งเตือนใบแจ้งหนี้อ่านคอลัมน์ที่ไฟล์นี้เพิ่ม
--
-- แนวคิด: ผู้เช่าส่งสลิปได้ทีละใบเหมือนเดิม (submit_slip) แต่แอดมินยืนยันสลิปพร้อม "ยอดที่ได้รับจริง"
--   ยอดสะสมยังไม่ถึงยอดบิล -> บิลกลับเป็น pending พร้อมยอดคงเหลือ ผู้เช่าโอนเพิ่มได้
--   ยอดสะสมถึงหรือเกินยอดบิล -> paid ถ้าเกิน เก็บยอดเกินไว้ให้แอดมินโอนคืน
-- สลิปที่ยืนยันแล้วทุกใบเก็บในตาราง invoice_payments (ประวัติการรับเงิน)

alter table public.invoices
  -- ยอดที่ได้รับแล้วทั้งหมด (รวมสลิปที่ยืนยันแล้วทุกใบ) คงเหลือ = total - paid_amount
  add column if not exists paid_amount numeric(12, 2) not null default 0,
  -- ยอดที่ผู้เช่าโอนเกินและต้องโอนคืน (0 = ไม่มี)
  add column if not exists refund_amount numeric(12, 2) not null default 0,
  -- สถานะโอนคืน: pending = รอโอนคืน, done = โอนคืนแล้ว (ว่างเมื่อไม่มียอดคืน)
  add column if not exists refund_status text,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_note text not null default '';

alter table public.invoices drop constraint if exists invoices_paid_amount_check;
alter table public.invoices add constraint invoices_paid_amount_check check (paid_amount >= 0);
alter table public.invoices drop constraint if exists invoices_refund_check;
alter table public.invoices add constraint invoices_refund_check
  check (refund_amount >= 0 and ((refund_amount > 0) = (refund_status is not null)) and (refund_status is null or refund_status in ('pending', 'done')));
alter table public.invoices drop constraint if exists invoices_refund_note_check;
alter table public.invoices add constraint invoices_refund_note_check check (char_length(refund_note) <= 500);

-- ประวัติการรับเงิน: 1 แถวต่อ 1 สลิปที่แอดมินยืนยันแล้ว
create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  -- เจ้าของบิล ณ ตอนรับเงิน (ใช้ให้ผู้เช่าอ่านประวัติของตัวเองได้)
  user_id uuid references auth.users (id) on delete set null,
  -- ยอดที่ได้รับจากสลิปใบนี้ (แอดมินเป็นคนระบุตอนยืนยัน)
  amount numeric(12, 2) not null check (amount > 0),
  slip_path text,
  slip_uploaded_at timestamptz,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references auth.users (id) on delete set null
);

-- เลขอ้างอิงของสลิปจากธนาคาร (ได้จากระบบตรวจสลิป ดู slip-verify.sql) ว่างได้เมื่อแอดมินยืนยันโดยไม่ผ่านการตรวจ
alter table public.invoice_payments add column if not exists trans_ref text;
-- สลิปหนึ่งใบ (เลขอ้างอิงเดียวกัน) ยืนยันรับเงินได้ครั้งเดียวทั้งระบบ กันเอาสลิปเดียวไปจ่ายหลายบิล
create unique index if not exists invoice_payments_trans_ref_key on public.invoice_payments (trans_ref) where trans_ref is not null;

create index if not exists invoice_payments_invoice_idx on public.invoice_payments (invoice_id, confirmed_at);

alter table public.invoice_payments enable row level security;

-- อ่านได้: แอดมิน และเจ้าของบิล เขียนตรง ๆ ไม่ได้ทุกกรณี ต้องผ่าน approve_slip
drop policy if exists "payments read" on public.invoice_payments;
create policy "payments read" on public.invoice_payments for select to authenticated
  using (public.is_admin() or user_id = auth.uid());
revoke insert, update, delete on table public.invoice_payments from anon, authenticated;

-- ย้ายข้อมูลเดิม: ใบที่ชำระแล้วถือว่าได้รับเต็มยอดบิล และเก็บสลิปเดิมเป็นประวัติ (ทำครั้งเดียว ไม่ซ้ำเมื่อรันอีก)
insert into public.invoice_payments (invoice_id, user_id, amount, slip_path, slip_uploaded_at, confirmed_at)
select i.id, i.user_id, i.total, i.slip_path, i.slip_uploaded_at, coalesce(i.reviewed_at, i.created_at)
from public.invoices i
where i.status = 'paid' and i.total > 0
  and not exists (select 1 from public.invoice_payments p where p.invoice_id = i.id);

update public.invoices set paid_amount = total where status = 'paid' and paid_amount = 0;

-- ใบที่มีการรับเงินแล้วห้ามแก้ยอดรวม (ไม่งั้นยอดคงเหลือกับยอดที่ได้รับจะขัดกัน)
create or replace function public.invoices_lock_total()
returns trigger
language plpgsql
as $$
begin
  if new.total is distinct from old.total and old.paid_amount > 0 then
    raise exception 'ใบแจ้งหนี้นี้มีการรับชำระเงินแล้ว แก้ไขยอดไม่ได้';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_lock_total on public.invoices;
create trigger invoices_lock_total before update of total on public.invoices
  for each row execute function public.invoices_lock_total();

-- approve_slip: แอดมินยืนยันสลิปที่รอตรวจพร้อมยอดที่ได้รับจริง คืน 'paid' หรือ 'partial'
create or replace function public.approve_slip(p_invoice uuid, p_amount numeric)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  inv public.invoices;
  new_paid numeric(12, 2);
  ref text;
begin
  if not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 then
    raise exception 'ยอดที่ได้รับต้องมากกว่า 0';
  end if;

  select * into inv from public.invoices where id = p_invoice and status = 'review' for update;
  if not found then
    raise exception 'ใบแจ้งหนี้นี้ไม่ได้อยู่ในสถานะรอตรวจสอบ';
  end if;

  -- เลขอ้างอิงสลิปที่ระบบตรวจสลิปอ่านได้ (ถ้ามี) อ่านผ่าน to_jsonb เพื่อให้ไฟล์นี้รันได้แม้ยังไม่ได้รัน slip-verify.sql
  ref := nullif(to_jsonb(inv) -> 'verify_detail' ->> 'transRef', '');

  begin
    insert into public.invoice_payments (invoice_id, user_id, amount, slip_path, slip_uploaded_at, confirmed_by, trans_ref)
    values (inv.id, inv.user_id, round(p_amount, 2), inv.slip_path, inv.slip_uploaded_at, auth.uid(), ref);
  exception when unique_violation then
    raise exception 'สลิปนี้ถูกใช้ยืนยันรับเงินกับใบแจ้งหนี้อื่นแล้ว';
  end;

  new_paid := inv.paid_amount + round(p_amount, 2);

  if new_paid >= inv.total then
    -- ครบ (หรือเกิน): สลิปใบสุดท้ายยังอยู่ที่ slip_path และในประวัติ ยอดเกินเก็บไว้รอโอนคืน
    update public.invoices
       set status = 'paid', paid_amount = new_paid, reviewed_at = now(), reject_reason = null,
           refund_amount = new_paid - inv.total,
           refund_status = case when new_paid > inv.total then 'pending' end
     where id = inv.id;
    return 'paid';
  end if;

  -- ยังไม่ครบ: กลับเป็นรอชำระ ล้างสลิป (ย้ายไปอยู่ในประวัติแล้ว) ให้ผู้เช่าโอนส่วนที่เหลือเพิ่ม
  update public.invoices
     set status = 'pending', paid_amount = new_paid, slip_path = null, slip_uploaded_at = null, reject_reason = null
   where id = inv.id;
  return 'partial';
end;
$$;

-- mark_refunded: แอดมินบันทึกว่าโอนยอดเกินคืนผู้เช่าแล้ว (หมายเหตุไม่บังคับ)
create or replace function public.mark_refunded(p_invoice uuid, p_note text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  inv public.invoices;
begin
  if not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  update public.invoices
     set refund_status = 'done', refunded_at = now(), refund_note = left(btrim(coalesce(p_note, '')), 500)
   where id = p_invoice and refund_status = 'pending'
   returning * into inv;
  if not found then
    raise exception 'ไม่มียอดที่รอโอนคืนในใบแจ้งหนี้นี้';
  end if;
  perform public.notify(
    inv.user_id, 'invoice', 'โอนยอดคืนแล้ว',
    'ใบแจ้งหนี้เดือน ' || public.thai_month(inv.month) || ' · ' || public.fmt_baht(inv.refund_amount),
    'หอพักโอนยอดที่ชำระเกิน ' || public.fmt_baht(inv.refund_amount) || ' คืนให้แล้ว'
      || case when inv.refund_note <> '' then E'\nหมายเหตุ: ' || inv.refund_note else '' end,
    '/invoices', 'ดูใบแจ้งหนี้');
end;
$$;

revoke all on function public.approve_slip(uuid, numeric) from public, anon;
revoke all on function public.mark_refunded(uuid, text) from public, anon;
grant execute on function public.approve_slip(uuid, numeric) to authenticated;
grant execute on function public.mark_refunded(uuid, text) to authenticated;
