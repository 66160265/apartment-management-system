-- ค่าปรับชำระค่าซ่อมล่าช้า (รันหลัง 20261025000000_repairs_reports_notifications.sql รันซ้ำได้ ข้อมูลเดิมไม่หาย)
-- วิธีใช้: วางทั้งไฟล์ใน Supabase SQL Editor แล้วกด Run (หรือ `npx supabase db push`) แล้วรัน `notify pgrst, 'reload schema';`
--
-- ใช้อัตราเดียวกับค่าปรับใบแจ้งหนี้ในหน้าตั้งค่า (app_settings.late_fee_per_day / late_fee_grace_days / late_fee_cap)
--   - ตอนเรื่องแจ้งซ่อมเปลี่ยนเป็น "เสร็จสิ้น" และผู้เช่าเป็นผู้ชำระ: จำวันครบกำหนดชำระ (วันที่ซ่อมเสร็จ + 1 วัน ตามเวลาไทย)
--     และค่าปรับจากหน้าตั้งค่าไว้ในเรื่องนั้น (เปลี่ยนค่าในหน้าตั้งค่าทีหลัง เรื่องเดิมไม่เปลี่ยน)
--   - ค่าปรับ = อัตรา x max(0, วันที่ส่งสลิป - วันครบกำหนด - วันผ่อนผัน) ไม่เกินเพดาน (สูตรเดียวกับ invoice_late_fee)
--   - ผู้เช่าส่งสลิป: ยอดที่ต้องชำระ = ค่าซ่อม + ค่าปรับ ณ วันที่ส่ง (repair_payments.amount) ระบบตรวจสลิปเทียบกับยอดนี้
--   - เรื่องที่เสร็จก่อนรันไฟล์นี้ไม่มีค่าปรับ (อัตรา 0) เหมือนใบแจ้งหนี้ที่ออกก่อนเปิดค่าปรับ
--
-- และลบระบบเดิมที่รวมค่าซ่อมในใบแจ้งหนี้ค่าห้อง (คอลัมน์ invoices.repair_fee และ repairs.invoice_id) ออกทั้งหมด
--   ไฟล์นี้ตรวจก่อนว่าไม่มีข้อมูลเก่าที่ยังใช้คอลัมน์เหล่านี้ ถ้ามีจะหยุดทั้งไฟล์ ไม่ลบอะไร

-- ============================================================
-- 0) ตรวจก่อนลบระบบรวมค่าซ่อมในใบแจ้งหนี้: ต้องไม่มีใบที่มีค่าซ่อม และไม่มีเรื่องซ่อมที่ผูกกับใบแจ้งหนี้
-- ============================================================

-- ใช้ execute (คำสั่งแบบข้อความ) เพราะรันซ้ำหลังลบคอลัมน์แล้ว คำสั่งที่อ้างคอลัมน์ตรง ๆ จะ error
do $$
declare
  n bigint;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoices' and column_name = 'repair_fee') then
    execute 'select count(*) from public.invoices where repair_fee <> 0' into n;
    if n > 0 then
      raise exception 'ยังมีใบแจ้งหนี้ที่รวมค่าซ่อมไว้ % ใบ (invoices.repair_fee) ลบระบบเดิมไม่ได้ ไม่ได้เปลี่ยนแปลงอะไร', n;
    end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'repairs' and column_name = 'invoice_id') then
    execute 'select count(*) from public.repairs where invoice_id is not null' into n;
    if n > 0 then
      raise exception 'ยังมีเรื่องแจ้งซ่อมที่ค่าซ่อมรวมในใบแจ้งหนี้ % เรื่อง (repairs.invoice_id) ลบระบบเดิมไม่ได้ ไม่ได้เปลี่ยนแปลงอะไร', n;
    end if;
  end if;
end $$;

-- ============================================================
-- 1) จำวันครบกำหนดและค่าปรับไว้ในเรื่องแจ้งซ่อม
-- ============================================================

alter table public.repairs
  add column if not exists pay_due_date date,
  add column if not exists late_fee_rate numeric(10, 2) not null default 0,
  add column if not exists late_fee_grace int not null default 0,
  add column if not exists late_fee_cap numeric(10, 2);

alter table public.repairs drop constraint if exists repairs_late_fee_check;
alter table public.repairs add constraint repairs_late_fee_check
  check (late_fee_rate >= 0 and late_fee_grace >= 0 and (late_fee_cap is null or late_fee_cap >= 0));

-- ตั้งค่าเองโดยระบบเท่านั้น (ผู้เช่าและแอดมินส่งค่ามาเองไม่ได้)
-- ชื่อ trigger ขึ้นต้นด้วย repairs_pay_ เพื่อให้ทำงานหลัง repairs_before_update (ที่ตั้ง completed_at) ตามลำดับตัวอักษร
create or replace function public.repairs_pay_terms()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  s public.app_settings;
begin
  if new.status = 'done' and new.cost_payer = 'tenant' and new.cost > 0
     and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    select * into s from public.app_settings where id = 1;
    new.pay_due_date := (coalesce(new.completed_at, now()) at time zone 'Asia/Bangkok')::date + 1;
    new.late_fee_rate := coalesce(s.late_fee_per_day, 0);
    new.late_fee_grace := coalesce(s.late_fee_grace_days, 0);
    new.late_fee_cap := s.late_fee_cap;
  elsif tg_op = 'UPDATE' and new.status = 'done' then
    new.pay_due_date := old.pay_due_date;
    new.late_fee_rate := old.late_fee_rate;
    new.late_fee_grace := old.late_fee_grace;
    new.late_fee_cap := old.late_fee_cap;
  else
    new.pay_due_date := null;
    new.late_fee_rate := 0;
    new.late_fee_grace := 0;
    new.late_fee_cap := null;
  end if;
  return new;
end;
$$;

drop trigger if exists repairs_pay_terms on public.repairs;
create trigger repairs_pay_terms before insert or update on public.repairs
  for each row execute function public.repairs_pay_terms();

revoke execute on function public.repairs_pay_terms() from public, anon, authenticated;

-- เรื่องที่เสร็จแล้วก่อนรันไฟล์นี้: ใส่วันครบกำหนดให้ (ใช้แสดงข้อความ) แต่ไม่คิดค่าปรับ (อัตรา 0)
alter table public.repairs disable trigger user;
update public.repairs
   set pay_due_date = (completed_at at time zone 'Asia/Bangkok')::date + 1
 where status = 'done' and cost_payer = 'tenant' and cost > 0
   and completed_at is not null and pay_due_date is null;
alter table public.repairs enable trigger user;

-- ค่าปรับของเรื่องแจ้งซ่อม ณ วันที่ p_asof
create or replace function public.repair_late_fee(r public.repairs, p_asof date)
returns numeric
language sql
stable
as $$
  select public.invoice_late_fee(r.late_fee_rate, r.late_fee_grace, r.late_fee_cap, r.pay_due_date, p_asof);
$$;

-- ============================================================
-- 2) ยอดที่ผู้เช่าโอน = ค่าซ่อม + ค่าปรับ ณ วันที่ส่งสลิป
-- ============================================================

alter table public.repair_payments add column if not exists late_fee numeric(12, 2) not null default 0;
alter table public.repair_payments drop constraint if exists repair_payments_late_fee_check;
alter table public.repair_payments add constraint repair_payments_late_fee_check check (late_fee >= 0);

-- submit_repair_slip: ผู้เช่าส่งสลิปค่าซ่อมของเรื่องตัวเอง (หน้าเว็บอัปโหลดรูปลงถัง slips โฟลเดอร์ <user id>/ ก่อนแล้วเรียกฟังก์ชันนี้)
-- เดิมยอดเท่ากับค่าซ่อม ตอนนี้รวมค่าปรับ ณ วันที่ส่ง (เก็บแยกไว้ใน late_fee)
create or replace function public.submit_repair_slip(p_repair uuid, p_path text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  r public.repairs;
  fee numeric;
  new_id uuid;
begin
  select * into r from public.repairs where id = p_repair and user_id = auth.uid() for update;
  if not found then
    raise exception 'ไม่พบรายการแจ้งซ่อม';
  end if;
  if r.status <> 'done' or r.cost_payer <> 'tenant' or r.cost <= 0 then
    raise exception 'รายการนี้ไม่มีค่าซ่อมที่ต้องชำระ';
  end if;
  if p_path is null or p_path not like auth.uid()::text || '/%' then
    raise exception 'ที่อยู่ไฟล์สลิปไม่ถูกต้อง';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'slips' and name = p_path) then
    raise exception 'ไม่พบไฟล์สลิป กรุณาอัปโหลดใหม่';
  end if;

  fee := public.repair_late_fee(r, public.today_th());

  begin
    insert into public.repair_payments (repair_id, user_id, amount, late_fee, slip_path)
    values (r.id, r.user_id, r.cost + fee, fee, p_path)
    returning id into new_id;
  exception when unique_violation then
    raise exception 'ค่าซ่อมรายการนี้ส่งสลิปแล้วหรือชำระเรียบร้อยแล้ว';
  end;

  perform public.notify_admins(
    'repair', 'มีสลิปค่าซ่อมรอตรวจสอบ',
    'ห้อง ' || r.room || ' · ' || r.problem,
    'ผู้เช่าห้อง ' || r.room || ' แนบสลิปค่าซ่อม "' || r.problem || '" ยอด ' || public.fmt_baht(r.cost + fee)
      || case when fee > 0 then ' (รวมค่าปรับล่าช้า ' || public.fmt_baht(fee) || ')' else '' end || ' รอตรวจสอบ',
    '/repairs', 'ไปที่ระบบแจ้งซ่อม');
  return new_id;
end;
$$;

revoke all on function public.submit_repair_slip(uuid, text) from public, anon;
grant execute on function public.submit_repair_slip(uuid, text) to authenticated;
revoke all on function public.repair_late_fee(public.repairs, date) from public, anon;
grant execute on function public.repair_late_fee(public.repairs, date) to authenticated;

-- ============================================================
-- 3) เตือนค่าซ่อมค้าง (เรียกทุกเช้าโดย pg_cron): บอกยอดรวมค่าปรับ และไม่อ้างถึง repairs.invoice_id แล้ว
-- ============================================================

create or replace function public.repairs_send_reminders()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  fee numeric;
begin
  for r in
    select * from public.repairs
    where status = 'in_progress' and appointment_state = 'confirmed' and appointment_date = public.today_th()
  loop
    perform public.notify(
      r.user_id, 'repair', 'วันนี้มีนัดเข้าซ่อม ' || public.repair_period_label(r.appointment_period),
      'ห้อง ' || r.room || ' · ' || r.problem,
      'ช่างจะเข้าซ่อม "' || r.problem || '" ' || public.repair_appointment_text(r.appointment_date, r.appointment_period)
        || case when r.technician <> '' then E'\nช่าง: ' || r.technician else '' end
        || case when r.allow_entry then E'\nคุณอนุญาตให้เข้าห้องได้แม้ไม่อยู่' else E'\nกรุณาอยู่ห้องตามเวลานัด' end,
      '/repairs', 'ดูรายการแจ้งซ่อม');
    perform public.notify_admins(
      'repair', 'วันนี้มีนัดซ่อมห้อง ' || r.room,
      public.repair_period_label(r.appointment_period) || ' · ' || r.problem,
      'นัดซ่อมห้อง ' || r.room || ' ' || public.repair_appointment_text(r.appointment_date, r.appointment_period)
        || E'\nรายการ: ' || r.problem
        || case when r.technician <> '' then E'\nช่าง: ' || r.technician else '' end
        || case when r.contact_phone <> '' then E'\nเบอร์ผู้เช่า: ' || r.contact_phone else '' end,
      '/repairs', 'ไปที่ระบบแจ้งซ่อม');
  end loop;

  -- ค่าซ่อมที่ผู้เช่ายังไม่ชำระ: เตือนทุก 3 วันนับจากวันที่ซ่อมเสร็จ (วันที่ 3, 6, 9, ...) ไม่เตือนเรื่องที่ส่งสลิปแล้วหรือชำระแล้ว
  -- ยอดที่บอกรวมค่าปรับล่าช้าของวันนี้
  for r in
    select rp.* from public.repairs rp
    where rp.status = 'done' and rp.cost_payer = 'tenant' and rp.cost > 0
      and rp.user_id is not null and rp.completed_at is not null
      and (public.today_th() - (rp.completed_at at time zone 'Asia/Bangkok')::date) >= 3
      and (public.today_th() - (rp.completed_at at time zone 'Asia/Bangkok')::date) % 3 = 0
      and not exists (select 1 from public.repair_payments p where p.repair_id = rp.id and p.status in ('review', 'paid'))
  loop
    fee := public.invoice_late_fee(r.late_fee_rate, r.late_fee_grace, r.late_fee_cap, r.pay_due_date, public.today_th());
    perform public.notify(
      r.user_id, 'repair', 'ค่าซ่อมยังไม่ได้ชำระ ' || public.fmt_baht(r.cost + fee),
      'ห้อง ' || r.room || ' · ' || r.problem,
      'ค่าซ่อม "' || r.problem || '" ยอด ' || public.fmt_baht(r.cost + fee)
        || case when fee > 0 then ' (รวมค่าปรับล่าช้า ' || public.fmt_baht(fee) || ' และเพิ่มขึ้นทุกวันจนกว่าจะชำระ)' else '' end
        || E' ยังไม่ได้ชำระ\nชำระและแนบสลิปได้ที่หน้าแจ้งซ่อม',
      '/repairs', 'ชำระค่าซ่อม');
  end loop;
end;
$$;

revoke all on function public.repairs_send_reminders() from public, anon, authenticated;

-- ============================================================
-- 4) ลบคอลัมน์ของระบบเดิมที่รวมค่าซ่อมในใบแจ้งหนี้ (ตรวจแล้วในข้อ 0 ว่าไม่มีข้อมูลค้าง)
-- ============================================================

alter table public.invoices drop column if exists repair_fee;
alter table public.repairs drop column if exists invoice_id;
