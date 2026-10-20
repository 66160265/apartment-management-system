-- การชำระเงินหลายครั้งต่อใบแจ้งหนี้ (โอนไม่ครบแล้วโอนส่วนที่เหลือเพิ่ม) และยอดที่ต้องโอนคืนเมื่อโอนเกิน
-- รันใน Supabase SQL Editor หลังรัน invoices.sql และ notifications.sql (รันซ้ำได้) ต้องรัน notifications.sql ใหม่อีกครั้งด้วย
-- เพราะ trigger แจ้งเตือนใบแจ้งหนี้อ่านคอลัมน์ที่ไฟล์นี้เพิ่ม
--
-- แนวคิด: ผู้เช่าส่งสลิปได้ทีละใบเหมือนเดิม (submit_slip) แต่แอดมินยืนยันสลิปพร้อม "ยอดที่ได้รับจริง"
--   ยอดสะสมยังไม่ถึงยอดบิล -> บิลกลับเป็น pending พร้อมยอดคงเหลือ ผู้เช่าโอนเพิ่มได้
--   ยอดสะสมถึงหรือเกินยอดบิล -> paid ถ้าเกิน เก็บยอดเกินไว้ให้แอดมินโอนคืน
-- สลิปที่ยืนยันแล้วทุกใบเก็บในตาราง invoice_payments (ประวัติการรับเงิน)
-- ค่าปรับชำระล่าช้า (รายวัน): ตั้งอัตรา/วันผ่อนผัน/เพดานในหน้าตั้งค่า ใบแจ้งหนี้ใหม่จะจำค่าเหล่านี้ไว้ในใบ (แก้ตั้งค่าภายหลังใบเก่าไม่เปลี่ยน)
--   ค่าปรับ = อัตรา x (จำนวนวันที่เกินวันครบกำหนด - วันผ่อนผัน) ไม่เกินเพดาน คิดถึงวันที่ผู้เช่าโอน (ไม่ใช่วันที่แอดมินตรวจ)
--   ยอดที่ต้องชำระ = ยอดบิล + ค่าปรับ ณ วันนั้น - ที่ได้รับแล้ว (ฟังก์ชัน invoice_late_fee / invoice_balance_at ด้านล่าง)

alter table public.invoices
  -- ยอดที่ได้รับแล้วทั้งหมด (รวมสลิปที่ยืนยันแล้วทุกใบ) คงเหลือ = total - paid_amount
  add column if not exists paid_amount numeric(12, 2) not null default 0,
  -- ยอดที่ผู้เช่าโอนเกินและต้องโอนคืน (0 = ไม่มี)
  add column if not exists refund_amount numeric(12, 2) not null default 0,
  -- สถานะโอนคืน: pending = รอโอนคืน, done = โอนคืนแล้ว (ว่างเมื่อไม่มียอดคืน)
  add column if not exists refund_status text,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_note text not null default '';

-- ค่าปรับล่าช้า: สแน็ปช็อตค่าตั้งค่า ณ วันออกใบ (อัตรา 0 = ไม่คิดค่าปรับ)
alter table public.invoices
  add column if not exists due_date date,
  add column if not exists late_fee_rate numeric(10, 2) not null default 0,
  add column if not exists late_fee_grace int not null default 0,
  add column if not exists late_fee_cap numeric(10, 2),
  -- ค่าปรับที่คิดจริงตอนชำระครบ (ใบที่ยังไม่ชำระครบเป็น 0 ค่าปรับที่เห็นเป็นค่าที่คำนวณสดตามวันนี้)
  add column if not exists late_fee numeric(12, 2) not null default 0;

alter table public.invoices drop constraint if exists invoices_late_fee_check;
alter table public.invoices add constraint invoices_late_fee_check
  check (late_fee_rate >= 0 and late_fee_grace >= 0 and (late_fee_cap is null or late_fee_cap >= 0) and late_fee >= 0);

-- ค่าตั้งต้นในหน้าตั้งค่า (ตารางนี้ผู้เช่าอ่านได้ ไม่มีข้อมูลลับ)
alter table public.app_settings
  add column if not exists late_fee_per_day numeric not null default 0,
  add column if not exists late_fee_grace_days int not null default 0,
  add column if not exists late_fee_cap numeric;
alter table public.app_settings drop constraint if exists app_settings_late_fee_check;
alter table public.app_settings add constraint app_settings_late_fee_check
  check (late_fee_per_day >= 0 and late_fee_grace_days >= 0 and (late_fee_cap is null or late_fee_cap >= 0));

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

-- true = ระบบตรวจสลิปอนุมัติเอง (ไม่ใช่แอดมินกด) แสดงในประวัติการรับชำระ
alter table public.invoice_payments add column if not exists auto_approved boolean not null default false;

create index if not exists invoice_payments_invoice_idx on public.invoice_payments (invoice_id, confirmed_at);

alter table public.invoice_payments enable row level security;

-- อ่านได้: แอดมิน และเจ้าของบิล เขียนตรง ๆ ไม่ได้ทุกกรณี ต้องผ่าน approve_slip
drop policy if exists "payments read" on public.invoice_payments;
create policy "payments read" on public.invoice_payments for select to authenticated
  using (public.is_admin() or user_id = auth.uid());
revoke insert, update, delete on table public.invoice_payments from anon, authenticated;

-- ตารางกลางเก็บเลขอ้างอิงสลิปที่ "ใช้ยืนยันรับเงินแล้ว" ทั้งค่าห้อง (ใบแจ้งหนี้) และค่าซ่อม (repair-payments.sql)
-- สลิปหนึ่งใบใช้ได้ครั้งเดียวทั้งระบบ ผู้ใช้เว็บเข้าถึงตารางนี้ไม่ได้ (เปิด RLS และไม่มีนโยบาย) ใช้ผ่านฟังก์ชันเท่านั้น
create table if not exists public.slip_refs (
  trans_ref text primary key,
  source text not null,
  created_at timestamptz not null default now()
);
alter table public.slip_refs enable row level security;
revoke all on table public.slip_refs from anon, authenticated;

insert into public.slip_refs (trans_ref, source)
select trans_ref, 'invoice' from public.invoice_payments where trans_ref is not null
on conflict do nothing;

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

-- invoice_late_fee: ค่าปรับล่าช้า ณ วันที่ p_asof  = อัตรา x max(0, (p_asof - วันครบกำหนด) - วันผ่อนผัน) ไม่เกินเพดาน (เพดานว่าง = ไม่จำกัด)
-- ค่าปรับเริ่มวันถัดจากวันครบกำหนด (ผ่อนผัน 0 วัน: เกินกำหนด 1 วัน = ค่าปรับ 1 วัน)
create or replace function public.invoice_late_fee(p_rate numeric, p_grace int, p_cap numeric, p_due date, p_asof date)
returns numeric
language sql
immutable
as $$
  select round(
    case
      when coalesce(p_rate, 0) <= 0 or p_due is null or p_asof is null then 0
      when p_cap is null then p_rate * greatest(0, (p_asof - p_due) - coalesce(p_grace, 0))
      else least(p_cap, p_rate * greatest(0, (p_asof - p_due) - coalesce(p_grace, 0)))
    end, 2);
$$;

-- asof_date: วันที่ใช้คิดค่าปรับของสลิป = วันที่ผู้เช่าส่งสลิป หรือวันที่โอนในสลิป (ถ้ารู้) อย่างใดอย่างหนึ่งที่ "เร็วกว่า" (เวลาไทย)
-- ผู้เช่าโอนก่อนเที่ยงคืนแต่ส่งสลิปหลังเที่ยงคืน จึงไม่ถูกปรับเพิ่ม
create or replace function public.asof_date(p_uploaded timestamptz, p_transfer timestamptz)
returns date
language sql
stable
as $$
  select least(
    (coalesce(p_uploaded, now()) at time zone 'Asia/Bangkok')::date,
    coalesce((p_transfer at time zone 'Asia/Bangkok')::date, (coalesce(p_uploaded, now()) at time zone 'Asia/Bangkok')::date));
$$;

-- invoice_balance_at: ยอดที่ต้องชำระของใบแจ้งหนี้ (ยอดบิล + ค่าปรับ - ที่ได้รับแล้ว ไม่ติดลบ) สำหรับสลิปที่โอนเมื่อ p_transfer
-- ใช้โดย Edge Function ตรวจสลิป (service role) ผู้ใช้เว็บเรียกไม่ได้
create or replace function public.invoice_balance_at(p_invoice uuid, p_transfer timestamptz)
returns numeric
language plpgsql
security definer set search_path = public
as $$
declare
  inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice;
  if not found then return null; end if;
  return greatest(0,
    inv.total
    + public.invoice_late_fee(inv.late_fee_rate, inv.late_fee_grace, inv.late_fee_cap, inv.due_date, public.asof_date(inv.slip_uploaded_at, p_transfer))
    - inv.paid_amount);
end;
$$;

-- record_payment: ตรรกะบันทึกรับเงิน 1 สลิป (ใช้ร่วมกันระหว่างแอดมินกดยืนยัน approve_slip กับระบบอนุมัติอัตโนมัติ auto_approve_slip ใน slip-verify.sql)
-- ไม่ตรวจสิทธิ์ในตัวเอง ผู้เรียกต้องตรวจก่อน และห้ามให้ผู้ใช้เว็บเรียกตรง ๆ (ถอนสิทธิ์ไว้ด้านล่าง) คืน 'paid' หรือ 'partial'
-- p_by = แอดมินที่ยืนยัน (ว่าง = ระบบอนุมัติอัตโนมัติ)
-- ยอดที่ต้องชำระ = ยอดบิล + ค่าปรับล่าช้า ณ วันที่โอน (ดู asof_date) ได้รับสะสมถึงยอดนี้ = ชำระครบ ค่าปรับที่คิดจริงเก็บไว้ใน invoices.late_fee
create or replace function public.record_payment(p_invoice uuid, p_amount numeric, p_by uuid, p_auto boolean)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  inv public.invoices;
  new_paid numeric(12, 2);
  ref text;
  transfer timestamptz;
  fee numeric(12, 2);
  due_total numeric(12, 2);
begin
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 then
    raise exception 'ยอดที่ได้รับต้องมากกว่า 0';
  end if;

  select * into inv from public.invoices where id = p_invoice and status = 'review' for update;
  if not found then
    raise exception 'ใบแจ้งหนี้นี้ไม่ได้อยู่ในสถานะรอตรวจสอบ';
  end if;

  -- เลขอ้างอิงและวันที่โอนที่ระบบตรวจสลิปอ่านได้ (ถ้ามี) อ่านผ่าน to_jsonb เพื่อให้ไฟล์นี้รันได้แม้ยังไม่ได้รัน slip-verify.sql
  ref := nullif(to_jsonb(inv) -> 'verify_detail' ->> 'transRef', '');
  begin
    transfer := nullif(to_jsonb(inv) -> 'verify_detail' ->> 'date', '')::timestamptz;
  exception when others then
    transfer := null;
  end;

  begin
    insert into public.invoice_payments (invoice_id, user_id, amount, slip_path, slip_uploaded_at, confirmed_by, trans_ref, auto_approved)
    values (inv.id, inv.user_id, round(p_amount, 2), inv.slip_path, inv.slip_uploaded_at, p_by, ref, coalesce(p_auto, false));
    -- สลิปนี้อาจเคยถูกใช้จ่ายค่าซ่อมไปแล้ว (ตารางกลางกันซ้ำข้ามประเภท)
    if ref is not null then
      insert into public.slip_refs (trans_ref, source) values (ref, 'invoice');
    end if;
  exception when unique_violation then
    raise exception 'สลิปนี้ถูกใช้ยืนยันรับเงินกับใบแจ้งหนี้อื่นแล้ว';
  end;

  new_paid := inv.paid_amount + round(p_amount, 2);
  fee := public.invoice_late_fee(inv.late_fee_rate, inv.late_fee_grace, inv.late_fee_cap, inv.due_date, public.asof_date(inv.slip_uploaded_at, transfer));
  due_total := inv.total + fee;

  if new_paid >= due_total then
    -- ครบ (หรือเกิน): สลิปใบสุดท้ายยังอยู่ที่ slip_path และในประวัติ ยอดเกินเก็บไว้รอโอนคืน
    update public.invoices
       set status = 'paid', paid_amount = new_paid, reviewed_at = now(), reject_reason = null,
           late_fee = fee,
           refund_amount = new_paid - due_total,
           refund_status = case when new_paid > due_total then 'pending' end
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

-- approve_slip: แอดมินยืนยันสลิปที่รอตรวจพร้อมยอดที่ได้รับจริง คืน 'paid' หรือ 'partial'
create or replace function public.approve_slip(p_invoice uuid, p_amount numeric)
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  return public.record_payment(p_invoice, p_amount, auth.uid(), false);
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

revoke all on function public.record_payment(uuid, numeric, uuid, boolean) from public, anon, authenticated;
revoke all on function public.invoice_balance_at(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.invoice_balance_at(uuid, timestamptz) to service_role;
revoke all on function public.approve_slip(uuid, numeric) from public, anon;
revoke all on function public.mark_refunded(uuid, text) from public, anon;
grant execute on function public.approve_slip(uuid, numeric) to authenticated;
grant execute on function public.mark_refunded(uuid, text) to authenticated;

-- invoices_send_reminders: เตือนผู้เช่าที่ใบแจ้งหนี้เกินกำหนดชำระและยังไม่ชำระครบ (ไม่นับใบที่ส่งสลิปรอตรวจอยู่)
-- เตือนวันแรกที่เกินกำหนด และซ้ำทุก 7 วัน ใบที่มีค่าปรับบอกยอดที่ต้องชำระรวมค่าปรับของวันนี้
-- เรียกวันละครั้งโดย pg_cron (เปิด extension ที่ Database > Extensions) ถ้าไม่เปิด ระบบส่วนอื่นใช้งานได้ตามปกติ ไม่มีเตือนเกินกำหนด
create or replace function public.invoices_send_reminders()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  late int;
  fee numeric;
begin
  for r in
    select * from public.invoices
    where status = 'pending' and due_date is not null and user_id is not null and due_date < public.today_th()
  loop
    late := public.today_th() - r.due_date;
    if late = 1 or (late > 1 and (late - 1) % 7 = 0) then
      fee := public.invoice_late_fee(r.late_fee_rate, r.late_fee_grace, r.late_fee_cap, r.due_date, public.today_th());
      perform public.notify(
        r.user_id, 'invoice', 'ใบแจ้งหนี้เกินกำหนดชำระ เดือน ' || public.thai_month(r.month),
        'ยอดที่ต้องชำระ ' || public.fmt_baht(greatest(0, r.total + fee - r.paid_amount)),
        'ใบแจ้งหนี้เดือน ' || public.thai_month(r.month) || ' เกินกำหนดชำระมา ' || late || ' วันแล้ว'
          || case when r.late_fee_rate > 0
               then E'\nมีค่าปรับล่าช้า ' || public.fmt_baht(fee) || ' (วันละ ' || public.fmt_baht(r.late_fee_rate) || ') และจะเพิ่มขึ้นทุกวันจนกว่าจะชำระ'
               else '' end
          || E'\nกรุณาชำระเงินและแนบสลิปในระบบ',
        '/invoices', 'ชำระเงิน');
    end if;
  end loop;
end;
$$;

revoke all on function public.invoices_send_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('invoice-overdue-reminders', '5 0 * * *', 'select public.invoices_send_reminders()');
  end if;
end $$;
