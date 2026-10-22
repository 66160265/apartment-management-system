-- ระบบแจ้งซ่อม: รันใน Supabase SQL Editor หลังรัน schema.sql (ต้องมีฟังก์ชัน is_admin())
-- รันซ้ำได้ ไม่ทำให้ข้อมูลเดิมหาย

create table if not exists public.repairs (
  id uuid primary key default gen_random_uuid(),
  room text not null references public.rooms (number) on update cascade,
  user_id uuid references auth.users (id) on delete set null,
  tenant_name text not null default '',
  problem text not null check (char_length(btrim(problem)) between 1 and 200),
  detail text not null default '' check (char_length(detail) <= 2000),
  status text not null default 'pending',
  image_path text,
  admin_note text not null default '' check (char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- ข้อมูลเพิ่มเติมสำหรับนัดวันเวลาเข้าซ่อม (ใช้ alter เพื่อให้ฐานข้อมูลเดิมที่มีตารางอยู่แล้วได้คอลัมน์ใหม่ด้วย)
-- ---------------------------------------------------------------------------

-- สถานะ: pending รอดำเนินการ -> in_progress กำลังดำเนินการ (มีวันนัดเข้าซ่อม) -> done เสร็จสิ้น, cancelled ยกเลิก/ไม่รับเรื่อง
-- (scheduled นัดหมายแล้ว = สถานะเดิม เลิกใช้แล้ว รายการเก่าถูกย้ายเป็น in_progress ท้ายไฟล์)
alter table public.repairs drop constraint if exists repairs_status_check;
alter table public.repairs add constraint repairs_status_check
  check (status in ('pending', 'scheduled', 'in_progress', 'done', 'cancelled'));

alter table public.repairs
  -- ประเภทงาน และความเร่งด่วน (ฉุกเฉิน = ช่างเข้าได้ทันทีโดยไม่ต้องรอนัด เช่น น้ำรั่วหนัก ไฟช็อต)
  add column if not exists category text not null default 'other',
  add column if not exists urgency text not null default 'normal',
  -- เบอร์ที่ช่างโทรหาได้ และอนุญาตให้เข้าห้องตอนผู้เช่าไม่อยู่หรือไม่
  add column if not exists contact_phone text not null default '',
  add column if not exists allow_entry boolean not null default false,
  -- ช่วงเวลาที่ผู้เช่าสะดวก: [{"date": "2026-10-20", "period": "13:00-15:30"}, ...] ไม่เกิน 3 ช่วง
  add column if not exists available_slots jsonb not null default '[]'::jsonb,
  add column if not exists availability_note text not null default '',
  -- นัดหมาย: วัน + ช่วงเวลา, proposed = แอดมินเสนอ รอผู้เช่ายืนยัน, confirmed = ยืนยันแล้ว
  add column if not exists appointment_date date,
  add column if not exists appointment_period text,
  add column if not exists appointment_state text,
  add column if not exists technician text not null default '',
  -- ข้อความล่าสุดจากผู้เช่า (เหตุผลที่ขอเปลี่ยนเวลา / แจ้งว่ายังซ่อมไม่หาย)
  add column if not exists tenant_message text not null default '',
  -- ค่าใช้จ่ายและผู้รับผิดชอบ (owner = เจ้าของหอ, tenant = ผู้เช่า เช่น ทำของเสียหายเอง)
  add column if not exists cost numeric(10, 2) not null default 0,
  add column if not exists cost_payer text not null default 'owner',
  -- ผู้เช่ายืนยันว่าซ่อมเรียบร้อยจริง และจำนวนครั้งที่ถูกแจ้งซ้ำเพราะยังไม่หาย
  add column if not exists tenant_confirmed_at timestamptz,
  add column if not exists reopen_count int not null default 0;

alter table public.repairs drop constraint if exists repairs_category_check;
alter table public.repairs add constraint repairs_category_check
  check (category in ('electric', 'plumbing', 'aircon', 'appliance', 'furniture', 'door', 'other'));
alter table public.repairs drop constraint if exists repairs_urgency_check;
alter table public.repairs add constraint repairs_urgency_check check (urgency in ('normal', 'urgent', 'emergency'));
alter table public.repairs drop constraint if exists repairs_contact_phone_check;
alter table public.repairs add constraint repairs_contact_phone_check check (char_length(contact_phone) <= 20);
alter table public.repairs drop constraint if exists repairs_slots_check;
alter table public.repairs add constraint repairs_slots_check
  check (jsonb_typeof(available_slots) = 'array' and jsonb_array_length(available_slots) <= 3);
alter table public.repairs drop constraint if exists repairs_availability_note_check;
alter table public.repairs add constraint repairs_availability_note_check check (char_length(availability_note) <= 500);
-- ช่วงเวลาเข้าซ่อม "HH:MM-HH:MM" ระหว่าง 09:00-20:00 (เริ่มก่อนสิ้นสุด) หรือค่าแบบเดิม morning/afternoon/evening
create or replace function public.repair_valid_period(p text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    p in ('morning', 'afternoon', 'evening')
    or (p ~ '^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$'
        and split_part(p, '-', 1) >= '09:00'
        and split_part(p, '-', 2) <= '20:00'
        and split_part(p, '-', 1) < split_part(p, '-', 2)),
    false);
$$;

alter table public.repairs drop constraint if exists repairs_period_check;
alter table public.repairs add constraint repairs_period_check
  check (appointment_period is null or public.repair_valid_period(appointment_period));
alter table public.repairs drop constraint if exists repairs_appointment_state_check;
alter table public.repairs add constraint repairs_appointment_state_check
  check (appointment_state is null or appointment_state in ('proposed', 'confirmed'));
-- นัดหมายแล้วต้องมีวันและช่วงเวลาเสมอ
alter table public.repairs drop constraint if exists repairs_scheduled_check;
alter table public.repairs add constraint repairs_scheduled_check
  check (status <> 'scheduled' or (appointment_date is not null and appointment_period is not null and appointment_state is not null));
alter table public.repairs drop constraint if exists repairs_technician_check;
alter table public.repairs add constraint repairs_technician_check check (char_length(technician) <= 100);
alter table public.repairs drop constraint if exists repairs_tenant_message_check;
alter table public.repairs add constraint repairs_tenant_message_check check (char_length(tenant_message) <= 500);
alter table public.repairs drop constraint if exists repairs_cost_check;
alter table public.repairs add constraint repairs_cost_check check (cost >= 0);
alter table public.repairs drop constraint if exists repairs_cost_payer_check;
alter table public.repairs add constraint repairs_cost_payer_check check (cost_payer in ('owner', 'tenant'));

create index if not exists repairs_appointment_idx on public.repairs (appointment_date) where appointment_date is not null;

create index if not exists repairs_room_idx on public.repairs (room);
create index if not exists repairs_user_idx on public.repairs (user_id);
create index if not exists repairs_status_idx on public.repairs (status);
create index if not exists repairs_created_idx on public.repairs (created_at desc);

alter table public.repairs enable row level security;

-- แอดมินทำได้ทุกอย่าง
drop policy if exists "repairs admin all" on public.repairs;
create policy "repairs admin all" on public.repairs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ผู้เช่าอ่านได้เฉพาะรายการของตัวเอง
drop policy if exists "repairs read own" on public.repairs;
create policy "repairs read own" on public.repairs for select to authenticated
  using (user_id = auth.uid());

-- ผู้เช่าแจ้งซ่อมได้เฉพาะห้องของตัวเอง และเริ่มที่สถานะ "รอดำเนินการ" เท่านั้น
drop policy if exists "repairs insert own" on public.repairs;
create policy "repairs insert own" on public.repairs for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and admin_note = ''
    and completed_at is null
    and room = (select t.room from public.tenants t where t.user_id = auth.uid())
  );

-- ผู้เช่าแก้ไขได้เฉพาะรายการของตัวเองที่ยัง "รอดำเนินการ" (คอลัมน์อื่นถูก trigger ล็อกไว้ด้านล่าง)
drop policy if exists "repairs update own pending" on public.repairs;
create policy "repairs update own pending" on public.repairs for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'pending');

-- ผู้เช่ายกเลิก (ลบ) ได้เฉพาะรายการที่ยังไม่มีใครรับเรื่อง
drop policy if exists "repairs delete own pending" on public.repairs;
create policy "repairs delete own pending" on public.repairs for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- ตั้งค่าเริ่มต้นตอนเพิ่ม: ผู้เช่าไม่สามารถปลอมชื่อผู้แจ้งได้
create or replace function public.repairs_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    select t.name into new.tenant_name from public.tenants t where t.user_id = auth.uid();
    new.tenant_name := coalesce(new.tenant_name, '');
    -- ช่องที่แอดมินเป็นคนกำหนด ผู้เช่าตั้งค่าเองไม่ได้
    new.appointment_date := null;
    new.appointment_period := null;
    new.appointment_state := null;
    new.technician := '';
    new.tenant_message := '';
    new.cost := 0;
    new.cost_payer := 'owner';
    new.tenant_confirmed_at := null;
    new.reopen_count := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists repairs_before_insert on public.repairs;
create trigger repairs_before_insert before insert on public.repairs
  for each row execute function public.repairs_before_insert();

-- ตอนแก้ไข: อัปเดตเวลา/เวลาเสร็จงานอัตโนมัติ และล็อกคอลัมน์ที่ผู้เช่าห้ามแก้
create or replace function public.repairs_before_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- การแก้ผ่านฟังก์ชันของผู้เช่าด้านล่าง (repair_accept_appointment ฯลฯ) ตรวจสิทธิ์ไว้แล้ว จึงไม่ต้องล็อก
  if current_setting('app.repair_tenant_action', true) = 'on' then
    null;
  elsif not public.is_admin() then
    new.room := old.room;
    new.user_id := old.user_id;
    new.tenant_name := old.tenant_name;
    new.status := old.status;
    new.admin_note := old.admin_note;
    new.completed_at := old.completed_at;
    new.created_at := old.created_at;
    new.appointment_date := old.appointment_date;
    new.appointment_period := old.appointment_period;
    new.appointment_state := old.appointment_state;
    new.technician := old.technician;
    new.tenant_message := old.tenant_message;
    new.cost := old.cost;
    new.cost_payer := old.cost_payer;
    new.tenant_confirmed_at := old.tenant_confirmed_at;
    new.reopen_count := old.reopen_count;
  else
    if new.status is distinct from old.status then
      new.completed_at := case when new.status = 'done' then now() else null end;
      -- ปิดงานใหม่ ต้องให้ผู้เช่ายืนยันใหม่
      if new.status = 'done' then new.tenant_confirmed_at := null; end if;
    end if;
    -- กลับไปรอนัดหมาย / ยกเลิก: ล้างนัดเดิม
    if new.status in ('pending', 'cancelled') then
      new.appointment_date := null;
      new.appointment_period := null;
      new.appointment_state := null;
    end if;
    -- ห้องว่าง (ไม่มีผู้เช่า) ไม่มีใครต้องยืนยันนัด
    if new.status = 'in_progress' and new.appointment_date is not null and new.user_id is null then
      new.appointment_state := 'confirmed';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists repairs_before_update on public.repairs;
create trigger repairs_before_update before update on public.repairs
  for each row execute function public.repairs_before_update();

-- ที่เก็บรูปปัญหา (private, ไม่เกิน 5MB, เฉพาะรูปภาพ) โฟลเดอร์แรกของ path คือ user id ของเจ้าของรายการ
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('repairs', 'repairs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "repairs upload own or admin" on storage.objects;
create policy "repairs upload own or admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'repairs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "repairs read own or admin" on storage.objects;
create policy "repairs read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'repairs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "repairs delete own or admin" on storage.objects;
create policy "repairs delete own or admin" on storage.objects for delete to authenticated
  using (bucket_id = 'repairs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------------
-- การกระทำของผู้เช่าหลังผู้ดูแลรับเรื่องแล้ว (ผู้เช่าแก้ตารางตรง ๆ ไม่ได้ จึงต้องผ่านฟังก์ชันเหล่านี้)
-- แต่ละฟังก์ชันตรวจว่าเป็นรายการของตัวเอง และอยู่ในสถานะที่ทำได้จริง
-- ---------------------------------------------------------------------------

-- วันที่ปัจจุบันตามเวลาไทย (current_date ของเซิร์ฟเวอร์เป็นเวลา UTC)
create or replace function public.today_th()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Bangkok')::date;
$$;

-- ตรวจรูปแบบช่วงเวลาที่ผู้เช่าส่งมา: array ไม่เกิน 3 รายการ, วันที่ไม่ย้อนหลัง, ช่วงเวลาถูกต้อง
create or replace function public.repair_valid_slots(p_slots jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p_slots) = 'array'
     and jsonb_array_length(p_slots) <= 3
     and not exists (
       select 1 from jsonb_array_elements(p_slots) e
       where not public.repair_valid_period(e->>'period')
          or (e->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
     );
$$;

-- ผู้เช่ายืนยันวันนัดที่ผู้ดูแลเสนอมา
create or replace function public.repair_accept_appointment(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform set_config('app.repair_tenant_action', 'on', true);
  update public.repairs set appointment_state = 'confirmed', tenant_message = ''
  where id = p_id and user_id = auth.uid() and status = 'in_progress' and appointment_state = 'proposed';
  if not found then raise exception 'ไม่พบนัดหมายที่รอการยืนยัน'; end if;
  perform set_config('app.repair_tenant_action', 'off', true);
end;
$$;

-- ผู้เช่าไม่สะดวกตามนัด: ส่งช่วงเวลาที่สะดวกใหม่ + เหตุผล แล้วรายการกลับไปรอนัดหมาย
-- ทำได้เฉพาะตอนผู้ดูแลเสนอนัด (รอยืนยัน) ยืนยันนัดแล้วเปลี่ยนเวลาไม่ได้
create or replace function public.repair_request_new_time(p_id uuid, p_slots jsonb, p_note text, p_allow_entry boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.repair_valid_slots(p_slots) then raise exception 'ช่วงเวลาไม่ถูกต้อง'; end if;
  if jsonb_array_length(p_slots) = 0 and not p_allow_entry then
    raise exception 'กรุณาเลือกช่วงเวลาที่สะดวกอย่างน้อย 1 ช่วง';
  end if;
  perform set_config('app.repair_tenant_action', 'on', true);
  update public.repairs
  set status = 'pending', appointment_date = null, appointment_period = null, appointment_state = null,
      available_slots = p_slots, allow_entry = p_allow_entry, tenant_message = left(coalesce(p_note, ''), 500)
  where id = p_id and user_id = auth.uid() and status = 'in_progress' and appointment_state = 'proposed';
  if not found then raise exception 'ยืนยันนัดหมายแล้ว ไม่สามารถเปลี่ยนเวลาได้ กรุณาติดต่อผู้ดูแล'; end if;
  perform set_config('app.repair_tenant_action', 'off', true);
end;
$$;

-- ผู้เช่าตรวจงานหลังซ่อมเสร็จ: เรียบร้อย = ปิดงาน, ยังไม่หาย = กลับไปรอนัดหมายพร้อมเหตุผล
create or replace function public.repair_confirm_done(p_id uuid, p_fixed boolean, p_note text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not p_fixed and btrim(coalesce(p_note, '')) = '' then raise exception 'กรุณาอธิบายว่ายังมีปัญหาอะไร'; end if;
  perform set_config('app.repair_tenant_action', 'on', true);
  if p_fixed then
    update public.repairs set tenant_confirmed_at = now()
    where id = p_id and user_id = auth.uid() and status = 'done' and tenant_confirmed_at is null;
  else
    update public.repairs
    set status = 'pending', completed_at = null, appointment_date = null, appointment_period = null,
        appointment_state = null, tenant_message = left(p_note, 500), reopen_count = reopen_count + 1
    where id = p_id and user_id = auth.uid() and status = 'done' and tenant_confirmed_at is null;
  end if;
  if not found then raise exception 'รายการนี้ยืนยันไปแล้ว หรือยังซ่อมไม่เสร็จ'; end if;
  perform set_config('app.repair_tenant_action', 'off', true);
end;
$$;

revoke all on function public.repair_accept_appointment(uuid) from public, anon;
revoke all on function public.repair_request_new_time(uuid, jsonb, text, boolean) from public, anon;
revoke all on function public.repair_confirm_done(uuid, boolean, text) from public, anon;
grant execute on function public.repair_accept_appointment(uuid) to authenticated;
grant execute on function public.repair_request_new_time(uuid, jsonb, text, boolean) to authenticated;
grant execute on function public.repair_confirm_done(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- กันนัดซ่อมชนกัน: เวลาที่เป็นนัดของห้องหนึ่งแล้ว ห้องอื่นนัดซ้อนไม่ได้
-- (เวลานัด 1 ครั้ง = "09:00-10:00" ค่าแบบเดิมอาจเป็นช่วงยาวกว่า หรือ morning/afternoon/evening)
-- ---------------------------------------------------------------------------

-- "09:00-10:00" / morning -> array['09:00', '10:00'] (เวลาเริ่ม, เวลาสิ้นสุด)
create or replace function public.repair_period_range(p text)
returns text[]
language sql
immutable
as $$
  select case p
    when 'morning' then array['09:00', '12:00']
    when 'afternoon' then array['13:00', '17:00']
    when 'evening' then array['17:00', '20:00']
    else array[split_part(p, '-', 1), split_part(p, '-', 2)] end;
$$;

-- สองช่วงเวลาซ้อนกันไหม
create or replace function public.repair_periods_overlap(a text, b text)
returns boolean
language sql
immutable
as $$
  select (public.repair_period_range(a))[1] < (public.repair_period_range(b))[2]
     and (public.repair_period_range(b))[1] < (public.repair_period_range(a))[2];
$$;

-- เวลาที่ไม่ว่างของทุกห้อง ให้หน้าเว็บปิดเวลานั้น (คืนแค่วันและเวลา ไม่มีข้อมูลห้อง/ผู้เช่า)
-- นับ: นัดที่แอดมินกำหนดแล้ว + วันเวลาที่ผู้เช่าห้องอื่นเลือกไว้ในเรื่องที่ยังรอดำเนินการ
-- p_exclude = รายการที่กำลังแก้ไขอยู่ (ไม่นับเวลาของตัวเอง)
create or replace function public.repair_booked_times(p_exclude uuid default null)
returns table (appointment_date date, appointment_period text)
language sql
stable
security definer set search_path = public
as $$
  select r.appointment_date, r.appointment_period
  from public.repairs r
  where r.status = 'in_progress'
    and r.appointment_date >= public.today_th()
    and r.id is distinct from p_exclude
  union
  select (s ->> 'date')::date, s ->> 'period'
  from public.repairs r, jsonb_array_elements(r.available_slots) s
  where r.status = 'pending'
    and (s ->> 'date') >= public.today_th()::text
    and r.id is distinct from p_exclude;
$$;

revoke all on function public.repair_booked_times(uuid) from public, anon;
grant execute on function public.repair_booked_times(uuid) to authenticated;

-- วัน + เวลานี้ไม่ว่างไหม (นัดที่กำหนดแล้ว หรือเวลาที่ผู้เช่าห้องอื่นเลือกไว้) ไม่นับรายการ p_self
create or replace function public.repair_time_taken(p_self uuid, p_date date, p_period text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.repairs r
    where r.id <> p_self and r.status = 'in_progress'
      and r.appointment_date = p_date
      and public.repair_periods_overlap(r.appointment_period, p_period)
  ) or exists (
    select 1 from public.repairs r, jsonb_array_elements(r.available_slots) s
    where r.id <> p_self and r.status = 'pending'
      and s ->> 'date' = p_date::text
      and public.repair_periods_overlap(s ->> 'period', p_period)
  );
$$;

revoke all on function public.repair_time_taken(uuid, date, text) from public, anon, authenticated;

-- กันเวลาซ้ำกับห้องอื่น (ล็อกตามวัน กันสองคนบันทึกเวลาเดียวกันพร้อมกัน)
--   แอดมินตั้ง/เปลี่ยนนัด: ห้ามชนกับนัดที่กำหนดแล้ว
--   ผู้เช่าเลือก/เปลี่ยนวันเวลาที่สะดวก: ห้ามชนกับนัดที่กำหนดแล้ว และเวลาที่ผู้เช่าห้องอื่นเลือกไว้
create or replace function public.repairs_no_double_booking()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  s jsonb;
  d text;
begin
  if new.status = 'in_progress' and new.appointment_date is not null
     and (tg_op = 'INSERT'
          or old.status is distinct from 'in_progress'
          or new.appointment_date is distinct from old.appointment_date
          or new.appointment_period is distinct from old.appointment_period) then
    perform pg_advisory_xact_lock(hashtext('repair-appointment-' || new.appointment_date::text));
    if exists (
      select 1 from public.repairs r
      where r.id <> new.id
        and r.status = 'in_progress'
        and r.appointment_date = new.appointment_date
        and public.repair_periods_overlap(r.appointment_period, new.appointment_period)
    ) then
      raise exception 'เวลานี้มีนัดซ่อมของห้องอื่นแล้ว กรุณาเลือกเวลาอื่น';
    end if;
  end if;

  if new.status = 'pending' and jsonb_array_length(new.available_slots) > 0
     and (tg_op = 'INSERT' or old.status is distinct from 'pending' or new.available_slots is distinct from old.available_slots) then
    -- ล็อกทุกวันที่เลือก (เรียงวันก่อน กันล็อกค้างกันเอง)
    for d in select distinct x ->> 'date' from jsonb_array_elements(new.available_slots) x order by 1 loop
      perform pg_advisory_xact_lock(hashtext('repair-appointment-' || d));
    end loop;
    for s in select * from jsonb_array_elements(new.available_slots) loop
      if (s ->> 'date') >= public.today_th()::text
         and public.repair_time_taken(new.id, (s ->> 'date')::date, s ->> 'period') then
        raise exception 'เวลานี้มีห้องอื่นเลือกไว้แล้ว กรุณาเลือกเวลาอื่น';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists repairs_no_double_booking on public.repairs;
create trigger repairs_no_double_booking before insert or update on public.repairs
  for each row execute function public.repairs_no_double_booking();

-- ---------------------------------------------------------------------------
-- เลิกใช้สถานะ "นัดหมายแล้ว" (scheduled): ย้ายรายการเดิมเป็น "กำลังดำเนินการ" (in_progress) โดยเก็บวันนัดไว้
-- (เปิด app.repair_tenant_action ชั่วคราวเพื่อข้ามการล็อกคอลัมน์ใน trigger, ไม่มีผู้ใช้จึงไม่ส่งแจ้งเตือน)
-- ---------------------------------------------------------------------------
select set_config('app.repair_tenant_action', 'on', false);
update public.repairs set status = 'in_progress' where status = 'scheduled';
select set_config('app.repair_tenant_action', 'off', false);
