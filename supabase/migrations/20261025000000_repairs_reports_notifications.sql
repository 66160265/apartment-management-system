-- ช่างและปักหมุดในระบบแจ้งซ่อม, ค่าใช้จ่ายของหอพัก และแจ้งเตือนรายวัน (รันหลัง 20261022000000_initial_schema.sql รันซ้ำได้ ข้อมูลเดิมไม่หาย)
-- วิธีใช้: วางทั้งไฟล์ใน Supabase SQL Editor แล้วกด Run (หรือ `npx supabase db push`) แล้วรัน `notify pgrst, 'reload schema';`
--   1) แจ้งซ่อม: เปลี่ยนเป็น "กำลังดำเนินการ" ต้องมีชื่อช่างและเบอร์โทรช่าง, แอดมินปักหมุดเรื่องเร่งด่วนได้
--   2) ค่าใช้จ่ายของหอพักรายเดือน (ตาราง expenses เฉพาะแอดมิน) ใช้ในหน้ารายงาน
--   1.1) เวลาที่ผู้เช่าเลือกให้ช่างเข้าเป็นช่วงที่กำหนดเอง ไม่เริ่มในเวลาพัก 12:00-13:00 และนัดซ่อมซ้อนเวลากันได้
--        แอดมินบันทึกเป็น "กำลังดำเนินการ" แล้ว เปลี่ยนวันนัดและย้อนกลับเป็น "รอดำเนินการ" ไม่ได้
--   1.2) ประเภทงานซ่อมใหม่: อินเทอร์เน็ต (internet) และผนัง / เพดาน / พื้น (structure)
--   3) แจ้งเตือนรายวัน (pg_cron): เตือนผู้เช่าก่อนครบกำหนดชำระ 3 วัน, เตือนแอดมินเมื่อสัญญาเหลือ 60 และ 30 วัน,
--      ลบแจ้งเตือนที่อ่านแล้วเกิน 90 วัน
--   4) ย้ายออก: ไม่คืนเงินประกันถ้าย้ายออกก่อนวันสิ้นสุดสัญญา (เดิม = ก่อนครบ 1 ปี)

-- ============================================================
-- 1) แจ้งซ่อม: เบอร์โทรช่าง และปักหมุด
-- ============================================================

alter table public.repairs
  -- เบอร์โทรช่าง (ชื่อช่างอยู่ในคอลัมน์ technician เดิม) ผู้เช่าเห็นทั้งสองอย่าง
  add column if not exists technician_phone text not null default '',
  -- แอดมินปักหมุดเรื่องเร่งด่วนไว้บนสุดของรายการ (ผู้เช่าแก้ไม่ได้) pinned_at = เวลาที่ปัก ใช้เรียงเรื่องที่ปักด้วยกัน
  add column if not exists pinned boolean not null default false,
  add column if not exists pinned_at timestamptz;

alter table public.repairs drop constraint if exists repairs_technician_phone_check;
alter table public.repairs add constraint repairs_technician_phone_check check (char_length(technician_phone) <= 20);

create index if not exists repairs_pinned_idx on public.repairs (pinned_at desc) where pinned;

-- ประเภทงานซ่อม: เพิ่มอินเทอร์เน็ต และผนัง / เพดาน / พื้น (ตรงกับ repairCategories ใน src/data/repairs.js) เรื่องเดิมใช้ค่าเดิมได้ทั้งหมด
alter table public.repairs drop constraint if exists repairs_category_check;
alter table public.repairs add constraint repairs_category_check
  check (category in ('electric', 'plumbing', 'aircon', 'internet', 'appliance', 'furniture', 'door', 'structure', 'other'));

-- ช่องของแอดมิน (เบอร์ช่าง ปักหมุด) ผู้เช่าตั้ง/แก้เองไม่ได้ และแอดมินเปลี่ยนเป็น "กำลังดำเนินการ" ต้องมีชื่อและเบอร์ช่าง
-- แยกเป็น trigger ของตัวเอง ไม่แก้ repairs_before_insert / repairs_before_update ในไฟล์เดิม
create or replace function public.repairs_technician_pin()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- การกระทำของผู้เช่าผ่านฟังก์ชัน (repair_accept_appointment ฯลฯ) ไม่แตะช่องเหล่านี้
  if current_setting('app.repair_tenant_action', true) = 'on' then
    return new;
  end if;

  if not public.is_admin() then
    if tg_op = 'INSERT' then
      new.technician_phone := '';
      new.pinned := false;
      new.pinned_at := null;
    else
      new.technician_phone := old.technician_phone;
      new.pinned := old.pinned;
      new.pinned_at := old.pinned_at;
    end if;
    return new;
  end if;

  new.technician := btrim(new.technician);
  new.technician_phone := btrim(new.technician_phone);

  -- กำลังดำเนินการแล้ว: แอดมินย้อนกลับเป็นรอดำเนินการ หรือเปลี่ยนวันนัดไม่ได้ (ผู้เช่าขอเปลี่ยนเวลาผ่านฟังก์ชันได้ตามเดิม)
  if tg_op = 'UPDATE' and old.status = 'in_progress' then
    if new.status = 'pending' then
      raise exception 'เรื่องที่กำลังดำเนินการแล้ว เปลี่ยนกลับเป็นรอดำเนินการไม่ได้';
    end if;
    if new.status = 'in_progress'
       and (new.appointment_date is distinct from old.appointment_date
            or new.appointment_period is distinct from old.appointment_period) then
      raise exception 'เรื่องที่กำลังดำเนินการแล้ว เปลี่ยนวันนัดไม่ได้';
    end if;
  end if;

  -- เรื่องที่เสร็จสิ้นหรือยกเลิก ไม่ต้องปักหมุดอีก
  if new.status in ('done', 'cancelled') then
    new.pinned := false;
  end if;
  if not new.pinned then
    new.pinned_at := null;
  elsif tg_op = 'INSERT' or not old.pinned then
    new.pinned_at := now();
  end if;

  -- กำลังดำเนินการ: ต้องรู้ว่าช่างคือใครและโทรหาได้ (ตรวจตอนเปลี่ยนเป็นสถานะนี้ หรือแก้ข้อมูลช่างระหว่างสถานะนี้)
  if new.status = 'in_progress'
     and (tg_op = 'INSERT'
          or old.status is distinct from 'in_progress'
          or new.technician is distinct from old.technician
          or new.technician_phone is distinct from old.technician_phone)
     and (new.technician = '' or new.technician_phone = '') then
    raise exception 'กรุณาใส่ชื่อช่างและเบอร์โทรช่างก่อนเปลี่ยนเป็น "กำลังดำเนินการ"';
  end if;
  return new;
end;
$$;

drop trigger if exists repairs_technician_pin on public.repairs;
create trigger repairs_technician_pin before insert or update on public.repairs
  for each row execute function public.repairs_technician_pin();

revoke execute on function public.repairs_technician_pin() from public, anon, authenticated;

-- เวลาเข้าซ่อมเป็นช่วงที่ผู้เช่ากำหนดเอง (เช่น 09:00-16:00) และเลิกห้ามนัดซ่อมซ้อนเวลากัน (ช่วงยาวช่างทำได้หลายห้อง และเคสด่วนต้องแทรกคิวได้)
-- ลบ trigger กันนัดซ้อนและฟังก์ชันที่ใช้เฉพาะ trigger นี้ (จากไฟล์ 20261022000000) แล้วใช้ trigger ตรวจช่วงเวลาตัวใหม่แทน
drop trigger if exists repairs_no_double_booking on public.repairs;
drop function if exists public.repairs_no_double_booking();
drop function if exists public.repair_time_taken(uuid, date, text);
drop function if exists public.repair_booked_times(uuid);

-- ตรวจช่วงเวลาที่ผู้เช่าเพิ่งเลือก (ช่วงที่เลือกไว้ก่อนแล้วไม่ตรวจซ้ำ) ให้ตรงกับ src/data/repairs.js
--   รูปแบบ: เต็มชั่วโมง "HH:00-HH:00" ภายใน 09:00-18:00 และเวลาสิ้นสุดหลังเวลาเริ่ม (REPAIR_HOURS)
--   ห้ามเริ่มในเวลาพักของช่าง 12:00-13:00 (REPAIR_BREAK)
--   เวลาเริ่มต้องยังไม่ผ่านไป ตามเวลาไทย
create or replace function public.repairs_validate_slots()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  s jsonb;
  p text;
begin
  if new.status = 'pending' and jsonb_array_length(new.available_slots) > 0
     and (tg_op = 'INSERT' or old.status is distinct from 'pending' or new.available_slots is distinct from old.available_slots) then
    for s in select * from jsonb_array_elements(new.available_slots) loop
      continue when tg_op = 'UPDATE' and coalesce(old.available_slots, '[]'::jsonb) @> jsonb_build_array(s);
      p := s ->> 'period';
      if coalesce(p, '') !~ '^\d\d:00-\d\d:00$'
         or split_part(p, '-', 1) < '09:00' or split_part(p, '-', 2) > '18:00'
         or split_part(p, '-', 1) >= split_part(p, '-', 2) then
        raise exception 'กรุณาเลือกช่วงเวลาระหว่าง 09:00-18:00 น. โดยเวลาสิ้นสุดต้องหลังเวลาเริ่ม';
      end if;
      if split_part(p, '-', 1) >= '12:00' and split_part(p, '-', 1) < '13:00' then
        raise exception 'เวลา 12:00-13:00 น. เป็นเวลาพักของช่าง กรุณาเลือกช่วงเวลาอื่น';
      end if;
      if ((s ->> 'date')::date + split_part(p, '-', 1)::time) <= (now() at time zone 'Asia/Bangkok') then
        raise exception 'เวลานี้ผ่านไปแล้ว กรุณาเลือกเวลาอื่น';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists repairs_validate_slots on public.repairs;
create trigger repairs_validate_slots before insert or update on public.repairs
  for each row execute function public.repairs_validate_slots();

revoke execute on function public.repairs_validate_slots() from public, anon, authenticated;

-- ข้อความช่วงเวลาในแจ้งเตือน: แสดงทั้งช่วงเสมอ เช่น "09:00-16:00 น." (เดิมนัด 1 ชั่วโมงแสดงแค่เวลาเริ่ม)
create or replace function public.repair_period_label(p text)
returns text
language sql
immutable
as $$
  select case p
    when 'morning' then '09:00-12:00 น.'
    when 'afternoon' then '13:00-17:00 น.'
    when 'evening' then '17:00-20:00 น.'
    else coalesce(p || ' น.', '') end;
$$;

-- ============================================================
-- 2) ค่าใช้จ่ายของหอพัก (ค่าไฟ/ค่าน้ำที่หอจ่ายจริง ค่าแม่บ้าน อินเทอร์เน็ต ฯลฯ) แอดมินเท่านั้น
-- ============================================================

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  -- เดือนของค่าใช้จ่าย YYYY-MM
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  category text not null check (category in ('electric', 'water', 'staff', 'internet', 'maintenance', 'other')),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  -- ชื่อค่าใช้จ่ายที่พิมพ์เอง (ใช้กับประเภท "อื่น ๆ" ต้องมีเสมอ)
  label text not null default '' check (char_length(label) <= 100),
  note text not null default '' check (char_length(note) <= 200),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- กรณีสร้างตารางไปแล้วก่อนมีคอลัมน์ label
alter table public.expenses add column if not exists label text not null default '';
alter table public.expenses drop constraint if exists expenses_label_check;
alter table public.expenses add constraint expenses_label_check
  check (char_length(label) <= 100 and (category <> 'other' or btrim(label) <> ''));

create index if not exists expenses_month_idx on public.expenses (month);
create index if not exists expenses_created_by_idx on public.expenses (created_by);

alter table public.expenses enable row level security;
drop policy if exists "expenses admin all" on public.expenses;
create policy "expenses admin all" on public.expenses for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on table public.expenses from anon;

-- ประวัติการแก้ไข: เพิ่ม/ลบค่าใช้จ่าย
create or replace function public.audit_expenses()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_write('expense.create', 'expenses', new.id::text, null,
      'เพิ่มค่าใช้จ่ายของหอพัก เดือน ' || public.thai_month(new.month) || ' ' || public.fmt_baht(new.amount)
        || case when new.label <> '' then ' ' || new.label else '' end
        || case when new.note <> '' then ' (' || new.note || ')' else '' end,
      jsonb_build_object('month', new.month, 'category', new.category, 'label', new.label, 'amount', new.amount, 'note', new.note));
    return new;
  end if;
  perform public.audit_write('expense.delete', 'expenses', old.id::text, null,
    'ลบค่าใช้จ่ายของหอพัก เดือน ' || public.thai_month(old.month) || ' ' || public.fmt_baht(old.amount)
      || case when old.label <> '' then ' ' || old.label else '' end,
    jsonb_build_object('month', old.month, 'category', old.category, 'label', old.label, 'amount', old.amount, 'note', old.note));
  return old;
end;
$$;

drop trigger if exists audit_expenses on public.expenses;
create trigger audit_expenses after insert or delete on public.expenses
  for each row execute function public.audit_expenses();

revoke execute on function public.audit_expenses() from public, anon, authenticated;

-- หน้ารายงานโหลดใหม่เองเมื่อมีการเพิ่ม/ลบค่าใช้จ่าย
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;
end $$;

-- ============================================================
-- 3) แจ้งเตือนรายวัน (เรียกทุกเช้าโดย pg_cron ถ้าไม่ได้เปิด extension ระบบส่วนอื่นใช้งานได้ตามปกติ แค่ไม่มีแจ้งเตือนเหล่านี้)
-- ============================================================

create or replace function public.send_daily_notices()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  left_days int;
begin
  -- ก) ใบแจ้งหนี้ที่จะครบกำหนดชำระในอีก 3 วัน และยังไม่ได้ชำระ (ส่งสลิปแล้วรอตรวจไม่ต้องเตือน)
  for r in
    select * from public.invoices
    where status = 'pending' and user_id is not null and due_date = public.today_th() + 3
      and total > paid_amount
  loop
    perform public.notify(
      r.user_id, 'invoice', 'ใบแจ้งหนี้เดือน ' || public.thai_month(r.month) || ' จะครบกำหนดใน 3 วัน',
      'ยอดที่ต้องชำระ ' || public.fmt_baht(r.total - r.paid_amount),
      'ใบแจ้งหนี้เดือน ' || public.thai_month(r.month) || ' ครบกำหนดชำระวันที่ ' || public.thai_date(r.due_date)
        || E'\nยอดที่ต้องชำระ ' || public.fmt_baht(r.total - r.paid_amount)
        || case when r.late_fee_rate > 0
             then E'\nหากเกินกำหนด มีค่าปรับวันละ ' || public.fmt_baht(r.late_fee_rate)
             else '' end
        || E'\nกรุณาชำระเงินและแนบสลิปในระบบ',
      '/invoices', 'ชำระเงิน');
  end loop;

  -- ข) สัญญาเช่าที่เหลือ 60 และ 30 วัน: เตือนแอดมินให้คุยต่อสัญญาหรือเตรียมหาผู้เช่าใหม่
  for r in
    select * from public.tenants
    where end_date - public.today_th() in (60, 30)
  loop
    left_days := r.end_date - public.today_th();
    perform public.notify_admins(
      'system', 'สัญญาเช่าห้อง ' || r.room || ' จะหมดใน ' || left_days || ' วัน',
      r.name || ' · สิ้นสุด ' || public.thai_date(r.end_date),
      'สัญญาเช่าของ ' || r.name || ' ห้อง ' || r.room || ' สิ้นสุดวันที่ ' || public.thai_date(r.end_date)
        || ' (อีก ' || left_days || E' วัน)\nควรคุยกับผู้เช่าเรื่องต่อสัญญา หรือเตรียมหาผู้เช่าใหม่ ต่อสัญญาได้ที่หน้าผู้เช่า',
      '/tenants', 'ไปที่หน้าผู้เช่า');
  end loop;

  -- ค) ลบแจ้งเตือนที่อ่านแล้วเกิน 90 วัน (ที่ยังไม่อ่านเก็บไว้)
  delete from public.notifications where read_at is not null and read_at < now() - interval '90 days';
end;
$$;

revoke all on function public.send_daily_notices() from public, anon, authenticated;

-- ทุกวัน 07:10 เวลาไทย (00:10 UTC) ต้องเปิด extension pg_cron ก่อน (Database > Extensions > pg_cron)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('daily-notices', '10 0 * * *', 'select public.send_daily_notices()');
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- ย้ายออก: ไม่คืนเงินประกันถ้าย้ายออกก่อนวันสิ้นสุดสัญญา (เดิม = ก่อนครบ 1 ปีนับจากวันเริ่มสัญญา)
-- ย้ายออกตั้งแต่วันสิ้นสุดสัญญาเป็นต้นไป คืนตามปกติ (ต่อสัญญาแล้วนับวันสิ้นสุดใหม่)
-- ---------------------------------------------------------------------------
-- record_move_out: บันทึกย้ายออกและหักเงินประกัน (ทั้งหมดสำเร็จหรือไม่สำเร็จพร้อมกัน)
create or replace function public.record_move_out(p_room text, p_date date, p_deductions jsonb, p_note text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  t public.tenants;
  item jsonb;
  lbl text;
  amt numeric;
  inv_id uuid;
  inv public.invoices;
  fee numeric;
  due numeric;
  total_ded numeric := 0;
  clean jsonb := '[]'::jsonb;
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  if p_date is null then
    raise exception 'กรุณาระบุวันที่ย้ายออก';
  end if;
  if p_deductions is null then
    p_deductions := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_deductions) <> 'array' or jsonb_array_length(p_deductions) > 30 then
    raise exception 'รายการหักไม่ถูกต้อง (ไม่เกิน 30 รายการ)';
  end if;

  select * into t from public.tenants where room = p_room for update;
  if not found then
    raise exception 'ไม่พบผู้เช่าห้องนี้';
  end if;
  if exists (
    select 1 from public.move_outs
     where room = t.room and start_date is not distinct from t.start_date and tenant_user_id is not distinct from t.user_id
  ) then
    raise exception 'ห้องนี้บันทึกการย้ายออกของสัญญานี้แล้ว';
  end if;

  for item in select * from jsonb_array_elements(p_deductions) loop
    lbl := btrim(coalesce(item ->> 'label', ''));
    begin
      amt := (item ->> 'amount')::numeric;
    exception when others then
      raise exception 'ยอดหักไม่ถูกต้อง';
    end;
    if lbl = '' or char_length(lbl) > 100 then
      raise exception 'ชื่อรายการหักต้องมี 1-100 ตัวอักษร';
    end if;
    if amt is null or amt <= 0 or amt > 10000000 then
      raise exception 'ยอดหักของรายการ "%" ต้องมากกว่า 0', lbl;
    end if;
    amt := round(amt, 2);
    total_ded := total_ded + amt;

    inv_id := null;
    if nullif(item ->> 'invoice_id', '') is not null then
      begin
        inv_id := (item ->> 'invoice_id')::uuid;
      exception when others then
        raise exception 'รหัสใบแจ้งหนี้ไม่ถูกต้อง';
      end;
      -- ต้องเป็นใบของผู้เช่าคนนี้ (ใบค้างของผู้เช่าคนก่อนในห้องเดียวกันหักจากเงินประกันคนนี้ไม่ได้)
      select * into inv from public.invoices where id = inv_id and room = t.room and user_id = t.user_id for update;
      if not found then
        raise exception 'ไม่พบใบแจ้งหนี้ของผู้เช่าคนนี้';
      end if;
      if inv.status <> 'pending' then
        raise exception 'ใบแจ้งหนี้เดือน % ไม่ได้อยู่ในสถานะรอชำระ (ชำระแล้วหรือรอตรวจสลิปอยู่ กรุณาจัดการก่อน)', public.thai_month(inv.month);
      end if;
      fee := public.invoice_late_fee(inv.late_fee_rate, inv.late_fee_grace, inv.late_fee_cap, inv.due_date, public.today_th());
      due := inv.total + fee - inv.paid_amount;
      if amt > due then
        raise exception 'ยอดหักเกินยอดค้างของใบแจ้งหนี้เดือน % (ค้าง %)', public.thai_month(inv.month), public.fmt_baht(due);
      end if;

      insert into public.invoice_payments (invoice_id, user_id, amount, slip_path, slip_uploaded_at, confirmed_by, auto_approved, source)
      values (inv.id, inv.user_id, amt, null, null, auth.uid(), false, 'deposit');

      if inv.paid_amount + amt >= inv.total + fee then
        update public.invoices
           set status = 'paid', paid_amount = paid_amount + amt, reviewed_at = now(), reject_reason = null, late_fee = fee
         where id = inv.id;
      else
        update public.invoices set paid_amount = paid_amount + amt where id = inv.id;
      end if;
    end if;

    clean := clean || jsonb_build_array(
      case when inv_id is null then jsonb_build_object('label', lbl, 'amount', amt)
           else jsonb_build_object('label', lbl, 'amount', amt, 'invoice_id', inv_id) end);
  end loop;

  -- ย้ายออกก่อนวันสิ้นสุดสัญญา: ไม่คืนเงินประกัน (หักส่วนที่เหลือหลังหักรายการอื่น ถ้าหน้าเว็บใส่มาแล้วก็ไม่เหลือให้หักซ้ำ)
  if t.end_date is not null and p_date < t.end_date and t.deposit - total_ded > 0 then
    clean := clean || jsonb_build_array(jsonb_build_object('label', 'ไม่คืนเงินประกัน (ย้ายออกก่อนวันสิ้นสุดสัญญา)', 'amount', t.deposit - total_ded));
    total_ded := t.deposit;
  end if;

  insert into public.move_outs (
    room, tenant_name, tenant_phone, tenant_user_id, start_date, end_date, move_out_date, deposit,
    deductions, deductions_total, refund_amount, owed_amount, refund_status, note, created_by)
  values (
    t.room, t.name, t.phone, t.user_id, t.start_date, t.end_date, p_date, t.deposit,
    clean, total_ded, greatest(0, t.deposit - total_ded), greatest(0, total_ded - t.deposit),
    case when t.deposit - total_ded > 0 then 'pending' else 'none' end,
    left(btrim(coalesce(p_note, '')), 500), auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;
