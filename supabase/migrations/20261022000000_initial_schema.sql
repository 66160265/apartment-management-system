-- โครงสร้างฐานข้อมูลทั้งหมดของระบบจัดการหอพัก ไฟล์เดียวครบ (รวมจากไฟล์ SQL เดิมเรียงตามลำดับที่ต้องรัน)
-- ส่วนในไฟล์: profiles, schema, invoices, repairs, tenant-documents, settings, payments, slip-verify, repair-payments, move-out, audit, chat,
--             notifications, performance, slip-quota, hardening, rls-performance
-- รันได้ทั้งฐานข้อมูลใหม่และฐานข้อมูลที่เคยรันไฟล์เดิมมาแล้ว (รันซ้ำได้ ข้อมูลเดิมไม่หาย)
-- วิธีใช้: วางทั้งไฟล์ใน Supabase SQL Editor แล้วกด Run หรือใช้ Supabase CLI `npx supabase db push`
-- ส่วนที่ไม่บังคับ: เปิด extension pg_cron (Database > Extensions) ก่อนรัน เพื่อให้ระบบเตือนนัดซ่อมและใกล้ครบกำหนดทำงานทุกเช้า
-- ข้อควรระวัง: ถ้าฐานข้อมูลมีฟังก์ชัน/ตารางที่เพิ่มนอกไฟล์นี้ (เช่น ระบบกันนัดซ่อมซ้อนเวลา) การรันทั้งไฟล์ซ้ำจะเขียนทับฟังก์ชันที่ชื่อซ้ำกัน (repairs_before_insert ฯลฯ) ตรวจก่อนรัน
-- ส่วน hardening และ rls-performance อยู่ท้ายสุดเสมอ (ไล่แก้ทุกฟังก์ชัน trigger และทุก policy ที่มี ณ ตอนนั้น)

-- ============================================================
-- profiles (ตารางสิทธิ์ผู้ใช้ ต้องมีก่อนส่วนอื่นเพราะ is_admin() อ่านตารางนี้)
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles for select to authenticated
  using (auth.uid() = id);

-- สร้างแถวใน profiles (role = user) ให้ผู้ใช้ใหม่ทุกคนที่สมัครใน Authentication
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- schema
-- ============================================================

-- รันใน Supabase SQL Editor (ถ้ามีตาราง rooms/tenants อยู่แล้ว ให้ปรับชื่อคอลัมน์ให้ตรงก่อน)

create table if not exists public.rooms (
  number text primary key,
  floor int not null,
  status text not null default 'vacant' check (status in ('occupied', 'vacant', 'maintenance')),
  rent numeric not null default 0,
  note text not null default ''
);

create table if not exists public.tenants (
  room text primary key references public.rooms (number) on update cascade,
  name text not null,
  phone text not null,
  username text not null unique,
  start_date date not null,
  end_date date not null,
  user_id uuid references auth.users (id) on delete set null
);

create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.rooms enable row level security;
alter table public.tenants enable row level security;

-- ทุกคนที่ login แล้วอ่านห้องได้ แต่แก้ไขได้เฉพาะแอดมิน
drop policy if exists "rooms read" on public.rooms;
create policy "rooms read" on public.rooms for select to authenticated using (true);
drop policy if exists "rooms admin write" on public.rooms;
create policy "rooms admin write" on public.rooms for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ผู้เช่าอ่านได้เฉพาะข้อมูลตัวเอง แอดมินอ่าน/แก้ได้ทั้งหมด
drop policy if exists "tenants admin all" on public.tenants;
create policy "tenants admin all" on public.tenants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "tenants read own" on public.tenants;
create policy "tenants read own" on public.tenants for select to authenticated
  using (user_id = auth.uid());

-- ข้อมูลห้องเริ่มต้น 20 ห้อง (ชั้น 1-4 ชั้นละ 5 ห้อง) ลบส่วนนี้ได้ถ้าไม่ต้องการ
insert into public.rooms (number, floor, status, rent)
select f || '0' || n, f, 'vacant', 4500
from generate_series(1, 4) f, generate_series(1, 5) n
on conflict (number) do nothing;

-- ============================================================
-- invoices
-- ============================================================

-- ระบบใบแจ้งหนี้-ชำระเงิน: รันใน Supabase SQL Editor หลังรัน schema.sql (ต้องมีฟังก์ชัน is_admin())

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  room text not null references public.rooms (number) on update cascade,
  user_id uuid references auth.users (id) on delete set null,
  tenant_name text not null,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  rent numeric not null default 0,
  water_prev int not null default 0,
  water_curr int not null default 0,
  water_rate numeric not null default 0,
  elec_prev int not null default 0,
  elec_curr int not null default 0,
  elec_rate numeric not null default 0,
  common_fee numeric not null default 0,
  total numeric not null,
  status text not null default 'pending' check (status in ('pending', 'review', 'paid')),
  slip_path text,
  slip_uploaded_at timestamptz,
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  unique (room, month),
  check (water_curr >= water_prev and elec_curr >= elec_prev)
);

alter table public.invoices enable row level security;

drop policy if exists "invoices admin all" on public.invoices;
create policy "invoices admin all" on public.invoices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ผู้เช่าอ่านได้เฉพาะใบแจ้งหนี้ของตัวเอง (แก้ไขตรง ๆ ไม่ได้ ต้องผ่าน submit_slip)
drop policy if exists "invoices read own" on public.invoices;
create policy "invoices read own" on public.invoices for select to authenticated
  using (user_id = auth.uid());

-- ผู้เช่าแนบสลิป: เปลี่ยนสถานะเป็น "รอตรวจสอบ" ได้เฉพาะใบแจ้งหนี้ของตัวเองที่ยังรอชำระ
create or replace function public.submit_slip(p_invoice uuid, p_path text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.invoices
     set slip_path = p_path,
         slip_uploaded_at = now(),
         status = 'review',
         reject_reason = null
   where id = p_invoice
     and user_id = auth.uid()
     and status = 'pending'
     and p_path like auth.uid()::text || '/%';
  if not found then
    raise exception 'ไม่สามารถแนบสลิปให้ใบแจ้งหนี้นี้ได้';
  end if;
end;
$$;

-- ที่เก็บรูปสลิป (private, ไม่เกิน 5MB, เฉพาะรูปภาพ) โฟลเดอร์แรกของ path คือ user id ของเจ้าของ
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slips', 'slips', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "slips upload own" on storage.objects;
create policy "slips upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'slips' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "slips read own or admin" on storage.objects;
create policy "slips read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'slips' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- แอดมินลบรูปสลิปได้ (ใช้ตอนลบใบแจ้งหนี้)
drop policy if exists "slips admin delete" on storage.objects;
create policy "slips admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'slips' and public.is_admin());

-- ============================================================
-- repairs
-- ============================================================

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

-- สถานะ: pending รอนัดหมาย -> scheduled นัดหมายแล้ว -> in_progress กำลังซ่อม -> done เสร็จสิ้น, cancelled ยกเลิก/ไม่รับเรื่อง
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
    if new.status = 'scheduled' and new.user_id is null then
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
  where id = p_id and user_id = auth.uid() and status = 'scheduled' and appointment_state = 'proposed';
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
  where id = p_id and user_id = auth.uid() and status = 'scheduled' and appointment_state = 'proposed';
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

-- ============================================================
-- tenant-documents
-- ============================================================

-- เอกสารของผู้เช่า: รันใน Supabase SQL Editor หลังรัน schema.sql (ต้องมีฟังก์ชัน is_admin())

create table if not exists public.tenant_documents (
  id uuid primary key default gen_random_uuid(),
  room text not null references public.tenants (room) on update cascade on delete cascade,
  type text not null check (type in ('id_card', 'contract', 'deposit_slip', 'other')),
  title text not null,
  file_path text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now()
);

-- เอกสารหลัก 3 ประเภทมีได้ประเภทละ 1 ไฟล์ต่อห้อง ส่วน "other" เพิ่มได้ไม่จำกัด
create unique index if not exists tenant_documents_one_per_type
  on public.tenant_documents (room, type) where type <> 'other';

alter table public.tenant_documents enable row level security;

drop policy if exists "tenant documents admin all" on public.tenant_documents;
create policy "tenant documents admin all" on public.tenant_documents for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ที่เก็บไฟล์ (private, ไม่เกิน 10MB, PDF หรือรูปภาพ) เฉพาะแอดมินเข้าถึงได้
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenant-docs', 'tenant-docs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "tenant docs admin all" on storage.objects;
create policy "tenant docs admin all" on storage.objects for all to authenticated
  using (bucket_id = 'tenant-docs' and public.is_admin())
  with check (bucket_id = 'tenant-docs' and public.is_admin());

-- ============================================================
-- settings
-- ============================================================

-- ตั้งค่าหอพัก (ข้อมูลหอพัก บัญชีรับชำระ/พร้อมเพย์ อัตราค่าบริการ วันครบกำหนด)
-- รันใน Supabase SQL Editor หลังรัน schema.sql (ต้องมีฟังก์ชัน is_admin()) รันซ้ำได้

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  apartment_name text not null default 'หอพักสุขสันต์',
  apartment_name_en text not null default 'Suksan Apartment',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  bank_name text not null default '',
  bank_account text not null default '',
  bank_holder text not null default '',
  promptpay_id text not null default '',
  due_day int not null default 5 check (due_day between 1 and 28),
  rate_water numeric not null default 18 check (rate_water >= 0),
  rate_electric numeric not null default 7 check (rate_electric >= 0),
  common_fee numeric not null default 0 check (common_fee >= 0),
  updated_at timestamptz not null default now()
);

-- แถวเดียวของระบบ
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- ทุกคนที่ login อ่านได้ (ผู้เช่าต้องเห็นบัญชีรับโอนและพร้อมเพย์) แต่แก้ได้เฉพาะแอดมิน
drop policy if exists "settings read" on public.app_settings;
create policy "settings read" on public.app_settings for select to authenticated using (true);

drop policy if exists "settings admin write" on public.app_settings;
create policy "settings admin write" on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- payments
-- ============================================================

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

-- เลขที่ใบเสร็จ: ออกให้ตอนยืนยันรับเงินเท่านั้น (สลิปที่ถูกปฏิเสธไม่กินเลข) ใช้ตัวนับกลางตัวเดียวทั้งค่าห้องและค่าซ่อม เลขไม่ซ้ำและเรียงตามเวลารับเงิน
-- แสดงเป็น RC-<ปี>-<เลข 6 หลัก> ฝั่งเว็บ (lib/receipts.js) ผู้ใช้เว็บแก้เลขไม่ได้ (ไม่มีสิทธิ์แก้ตาราง)
create sequence if not exists public.receipt_no_seq;
alter table public.invoice_payments add column if not exists receipt_no bigint;
-- ย้ายข้อมูลเดิม: ให้เลขตามลำดับเวลารับเงิน (ทำเฉพาะแถวที่ยังไม่มีเลข รันซ้ำไม่เปลี่ยนเลขเดิม)
do $$
declare
  r record;
begin
  for r in select id from public.invoice_payments where receipt_no is null order by confirmed_at, id loop
    update public.invoice_payments set receipt_no = nextval('public.receipt_no_seq') where id = r.id;
  end loop;
end $$;
alter table public.invoice_payments alter column receipt_no set default nextval('public.receipt_no_seq');
create unique index if not exists invoice_payments_receipt_key on public.invoice_payments (receipt_no);

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
  and not exists (select 1 from public.invoice_payments p where p.invoice_id = i.id)
-- เรียงตามเวลารับเงิน เพื่อให้เลขที่ใบเสร็จของข้อมูลเดิมเรียงตามลำดับที่รับเงินจริง (ตัวนับเลขทำงานตามลำดับแถวที่ออก)
order by coalesce(i.reviewed_at, i.created_at), i.id;

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

-- ============================================================
-- slip-verify
-- ============================================================

-- ตรวจสลิปด้วย EasySlip: รันใน Supabase SQL Editor หลังรัน invoices.sql, notifications.sql, settings.sql และ payments.sql (รันซ้ำได้)
--
-- ไฟล์นี้คืออะไร: ช่องเก็บผลตรวจสลิปใน invoices, โหมดตรวจใน app_settings และฟังก์ชันที่ Edge Function verify-slip เรียก
-- Edge Function: supabase/functions/verify-slip (ต้อง deploy และตั้ง secret EASYSLIP_API_KEY)
-- โหมด slip_verify_mode: off = ไม่ตรวจ, suggest = ตรวจแล้วแสดงผลให้แอดมินดู แอดมินยังกดยืนยันรับเงินเองทุกครั้ง
--   auto = ตรวจแล้ว "ถ้าผ่านครบทุกเงื่อนไข" ระบบยืนยันรับเงินให้เอง (เงื่อนไขอยู่ที่ auto_approve_slip ด้านล่าง ตรวจซ้ำในฐานข้อมูลเสมอ)
-- ระบบไม่ปฏิเสธสลิปเอง สลิปที่ไม่ผ่านเงื่อนไขจะรอแอดมินตรวจเหมือนเดิม

alter table public.invoices
  -- สถานะการตรวจ: checking กำลังตรวจ, ok สลิปจริงและยอดตรงกับยอดคงเหลือ, warn สลิปจริงแต่มีข้อสังเกต (ยอดไม่ตรง วันที่แปลก ผู้รับตรวจไม่ได้)
  -- failed ไม่ผ่าน (ไม่พบ QR / ไม่ใช่สลิปจริง / สลิปซ้ำ), error ติดต่อบริการไม่ได้, skipped ข้ามการตรวจ (เช่น รูปใหญ่เกิน 4MB)
  add column if not exists verify_status text,
  -- รายละเอียดผลตรวจ: ยอด วันที่โอน ผู้โอน ผู้รับ เลขอ้างอิง (transRef) และ notes ข้อสังเกต ผู้เช่าเจ้าของบิลอ่านได้ด้วย (ไม่มีข้อมูลลับ)
  add column if not exists verify_detail jsonb,
  -- จำนวนครั้งที่ส่งตรวจ จำกัด 3 ครั้งต่อบิล กันเสียโควตาของบริการ
  add column if not exists verify_attempts int not null default 0;

alter table public.invoices drop constraint if exists invoices_verify_status_check;
alter table public.invoices add constraint invoices_verify_status_check
  check (verify_status is null or verify_status in ('checking', 'ok', 'warn', 'failed', 'error', 'skipped'));

-- โหมดตรวจสลิป ค่าเริ่มต้น off (ตารางนี้ผู้เช่าอ่านได้ จึงห้ามเก็บ API key ที่นี่ ให้เก็บเป็น secret ของ Edge Function)
alter table public.app_settings
  add column if not exists slip_verify_mode text not null default 'off';
alter table public.app_settings drop constraint if exists app_settings_slip_verify_mode_check;
alter table public.app_settings add constraint app_settings_slip_verify_mode_check check (slip_verify_mode in ('off', 'suggest', 'auto'));

-- เปลี่ยนสลิป (ผู้เช่าแนบใหม่ หรือแอดมินปฏิเสธ/ยืนยันแล้วล้างสลิป) ให้ล้างผลตรวจเก่าทิ้ง
-- ใช้ trigger แทนการแก้ submit_slip เพื่อไม่ให้การรัน invoices.sql ซ้ำมาทับพฤติกรรมนี้
create or replace function public.invoices_reset_verify()
returns trigger
language plpgsql
as $$
begin
  if new.slip_path is distinct from old.slip_path then
    new.verify_status := null;
    new.verify_detail := null;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_reset_verify on public.invoices;
create trigger invoices_reset_verify before update of slip_path on public.invoices
  for each row execute function public.invoices_reset_verify();

-- claim_slip_verify: Edge Function เรียกก่อนส่งสลิปไปตรวจ เพื่อ "จองสิทธิ์" ตรวจ 1 ครั้งต่อสลิป
-- คืนข้อมูลบิลเมื่อจองได้ คืนว่างเมื่อไม่ควรตรวจ (ไม่ได้รอตรวจ ตรวจไปแล้ว หรือครบ 3 ครั้ง)
-- ตรวจซ้ำได้เฉพาะเมื่อครั้งก่อน error (เช่น บริการล่ม) การจองเป็นคำสั่งเดียว กดซ้ำหรือเรียกพร้อมกันไม่เสียโควตาซ้ำ
create or replace function public.claim_slip_verify(p_invoice uuid)
returns table (id uuid, user_id uuid, slip_path text, total numeric, paid_amount numeric, created_at timestamptz)
language sql
security definer set search_path = public
as $$
  update public.invoices i
     set verify_status = 'checking', verify_attempts = i.verify_attempts + 1
   where i.id = p_invoice
     and i.status = 'review'
     and i.slip_path is not null
     and (i.verify_status is null or i.verify_status = 'error')
     and i.verify_attempts < 3
  returning i.id, i.user_id, i.slip_path, i.total, i.paid_amount, i.created_at;
$$;

-- apply_slip_result: บันทึกผลตรวจ และตรวจสลิปซ้ำจากเลขอ้างอิง (transRef) ใน detail
create or replace function public.apply_slip_result(p_invoice uuid, p_status text, p_detail jsonb)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  result text := p_status;
  detail jsonb := coalesce(p_detail, '{}'::jsonb);
  ref text := nullif(detail ->> 'transRef', '');
begin
  perform 1 from public.invoices where id = p_invoice and verify_status = 'checking' for update;
  if not found then return 'ignored'; end if;

  if result in ('ok', 'warn') and ref is not null and (
       exists (select 1 from public.slip_refs where trans_ref = ref)
       or exists (select 1 from public.invoices
                   where id <> p_invoice and status = 'review' and verify_status in ('ok', 'warn') and verify_detail ->> 'transRef' = ref)
     ) then
    result := 'failed';
    detail := jsonb_set(detail, '{notes}', coalesce(detail -> 'notes', '[]'::jsonb) || to_jsonb('สลิปนี้ถูกใช้กับใบแจ้งหนี้อื่นแล้ว'::text));
  end if;

  update public.invoices set verify_status = result, verify_detail = detail where id = p_invoice;
  return result;
end;
$$;

-- mark_slip_error: Edge Function ล้มกลางทาง ให้สถานะ checking ไม่ค้าง
create or replace function public.mark_slip_error(p_invoice uuid, p_message text)
returns void
language sql
security definer set search_path = public
as $$
  update public.invoices
     set verify_status = 'error', verify_detail = jsonb_build_object('notes', jsonb_build_array(p_message))
   where id = p_invoice and verify_status = 'checking';
$$;

-- auto_approve_slip: ยืนยันรับเงินให้เองเมื่อ "ผ่านครบทุกเงื่อนไข" คืน 'paid' เมื่ออนุมัติ หรือ 'not_eligible' เมื่อไม่เข้าเงื่อนไข (ไม่ทำอะไร)
-- เงื่อนไขทั้งหมด (ตรวจในฐานข้อมูลเองทุกครั้ง ไม่เชื่อ Edge Function อย่างเดียว):
--   1) โหมดตั้งเป็น auto  2) บิลรอตรวจและผลตรวจเป็น ok  3) ยอดในสลิปเท่ากับยอดที่ต้องชำระพอดี (รวมค่าปรับล่าช้า ณ วันที่โอน) ไม่ครบ/เกินให้แอดมินตัดสิน
--   4) EasySlip ยืนยันว่าผู้รับคือบัญชีของหอพัก (accountMatched = true)  5) มีเลขอ้างอิงสลิป และไม่เคยถูกใช้
create or replace function public.auto_approve_slip(p_invoice uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  inv public.invoices;
  detail jsonb;
  amt numeric;
  due numeric;
  transfer timestamptz;
  result text;
begin
  if coalesce((select slip_verify_mode from public.app_settings where id = 1), 'off') <> 'auto' then
    return 'not_eligible';
  end if;

  select * into inv from public.invoices where id = p_invoice and status = 'review' and verify_status = 'ok' for update;
  if not found then return 'not_eligible'; end if;

  detail := coalesce(inv.verify_detail, '{}'::jsonb);
  begin
    amt := (detail ->> 'amount')::numeric;
  exception when others then
    return 'not_eligible';
  end;

  begin
    transfer := nullif(detail ->> 'date', '')::timestamptz;
  exception when others then
    transfer := null;
  end;
  due := public.invoice_balance_at(inv.id, transfer);
  if amt is null or due is null or round(amt, 2) <> round(due, 2) then return 'not_eligible'; end if;
  if (detail -> 'accountMatched') is distinct from 'true'::jsonb then return 'not_eligible'; end if;
  if nullif(detail ->> 'transRef', '') is null then return 'not_eligible'; end if;

  begin
    result := public.record_payment(inv.id, amt, null, true);
  exception when raise_exception then
    -- เช่น สลิปถูกใช้กับบิลอื่นไปแล้ว: ปล่อยให้แอดมินตรวจเอง
    return 'not_eligible';
  end;

  -- ผู้ใช้ที่ไม่ได้ล็อกอิน (service role) ทำให้ trigger แจ้งเตือนข้าม จึงแจ้งเองตรงนี้
  perform public.notify(
    inv.user_id, 'invoice', 'ชำระเงินเรียบร้อย',
    'ใบแจ้งหนี้เดือน ' || public.thai_month(inv.month) || ' · ' || public.fmt_baht(inv.total),
    'ระบบตรวจสอบสลิปและยืนยันการชำระเงินใบแจ้งหนี้เดือน ' || public.thai_month(inv.month) || ' อัตโนมัติแล้ว',
    '/invoices', 'ดูใบแจ้งหนี้');
  perform public.notify_admins(
    'invoice', 'ระบบอนุมัติสลิปอัตโนมัติ',
    'ห้อง ' || inv.room || ' · ' || public.thai_month(inv.month),
    'ระบบตรวจสลิปของห้อง ' || inv.room || ' (' || inv.tenant_name || ') ยอด ' || public.fmt_baht(amt) || ' ผ่านครบทุกเงื่อนไขและยืนยันรับเงินแล้ว',
    '/invoices', 'ไปที่ใบแจ้งหนี้');
  return result;
end;
$$;

-- ให้เฉพาะ Edge Function (service role) เรียกได้ ผู้ใช้เว็บเรียกไม่ได้ ไม่งั้นปลอมผลตรวจได้
revoke all on function public.claim_slip_verify(uuid) from public, anon, authenticated;
revoke all on function public.apply_slip_result(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.mark_slip_error(uuid, text) from public, anon, authenticated;
revoke all on function public.auto_approve_slip(uuid) from public, anon, authenticated;
grant execute on function public.claim_slip_verify(uuid) to service_role;
grant execute on function public.apply_slip_result(uuid, text, jsonb) to service_role;
grant execute on function public.mark_slip_error(uuid, text) to service_role;
grant execute on function public.auto_approve_slip(uuid) to service_role;

-- ============================================================
-- repair-payments
-- ============================================================

-- จ่ายค่าซ่อมในระบบ: รันใน Supabase SQL Editor หลังรัน repairs.sql, notifications.sql, payments.sql และ slip-verify.sql (รันซ้ำได้)
--
-- แนวคิด: เรื่องแจ้งซ่อมที่ซ่อมเสร็จแล้ว (status = done) และผู้ดูแลระบุว่าผู้เช่าเป็นผู้ชำระ (cost_payer = tenant, cost > 0)
--   ผู้เช่าโอนเงินตามยอด cost แล้วแนบสลิป -> ผู้ดูแล (หรือระบบตรวจสลิปโหมดอัตโนมัติ) ยืนยัน -> ชำระแล้ว
-- จ่ายครั้งเดียวเต็มยอด ไม่มีโอนไม่ครบ/โอนเกินแบบใบแจ้งหนี้ ถ้ายอดไม่ตรงให้ผู้ดูแลปฏิเสธพร้อมเหตุผล ผู้เช่าโอนใหม่
-- เก็บแยกในตาราง repair_payments (ไม่เพิ่มคอลัมน์ในตาราง repairs) เพราะ trigger ของ repairs ล็อกเฉพาะคอลัมน์ที่ระบุชื่อไว้
-- ผู้เช่าเขียนตารางนี้ตรง ๆ ไม่ได้ ต้องผ่าน submit_repair_slip เท่านั้น จึงปลอมสถานะ "ชำระแล้ว" ไม่ได้

create table if not exists public.repair_payments (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.repairs (id) on delete cascade,
  -- ผู้เช่าเจ้าของเรื่อง (ใช้ให้ผู้เช่าอ่านของตัวเองได้)
  user_id uuid references auth.users (id) on delete set null,
  -- ยอดค่าซ่อมที่ต้องชำระ ณ ตอนส่งสลิป (จำไว้ ใช้เทียบกับยอดในสลิป)
  amount numeric(12, 2) not null check (amount > 0),
  slip_path text not null,
  slip_uploaded_at timestamptz not null default now(),
  -- review รอตรวจ, paid ชำระแล้ว, rejected ถูกปฏิเสธ (ผู้เช่าส่งสลิปใหม่ได้)
  status text not null default 'review' check (status in ('review', 'paid', 'rejected')),
  reject_reason text,
  reviewed_at timestamptz,
  -- ผู้ดูแลที่ยืนยัน/ปฏิเสธ (ว่าง = ระบบอนุมัติอัตโนมัติ หรือยังไม่ตรวจ)
  reviewed_by uuid references auth.users (id) on delete set null,
  auto_approved boolean not null default false,
  -- เลขอ้างอิงสลิป และผลตรวจสลิปด้วย EasySlip (ความหมายเหมือน invoices ใน slip-verify.sql)
  trans_ref text,
  verify_status text check (verify_status is null or verify_status in ('checking', 'ok', 'warn', 'failed', 'error', 'skipped')),
  verify_detail jsonb,
  verify_attempts int not null default 0,
  created_at timestamptz not null default now()
);

-- เลขที่ใบเสร็จ (ใช้ตัวนับ receipt_no_seq ร่วมกับค่าห้อง ดู payments.sql) ออกตอนยืนยันรับเงินเท่านั้น
alter table public.repair_payments add column if not exists receipt_no bigint;
do $$
declare
  x record;
begin
  for x in select id from public.repair_payments where status = 'paid' and receipt_no is null order by reviewed_at, id loop
    update public.repair_payments set receipt_no = nextval('public.receipt_no_seq') where id = x.id;
  end loop;
end $$;
create unique index if not exists repair_payments_receipt_key on public.repair_payments (receipt_no);

-- ค่าซ่อมหนึ่งเรื่องมีรายการที่ "รอตรวจหรือชำระแล้ว" ได้ไม่เกิน 1 รายการ (ส่งสลิปซ้อนไม่ได้ ส่งใหม่ได้เมื่อถูกปฏิเสธ)
create unique index if not exists repair_payments_active_key on public.repair_payments (repair_id) where status in ('review', 'paid');
create index if not exists repair_payments_repair_idx on public.repair_payments (repair_id, created_at);

alter table public.repair_payments enable row level security;

drop policy if exists "repair payments read" on public.repair_payments;
create policy "repair payments read" on public.repair_payments for select to authenticated
  using (public.is_admin() or user_id = auth.uid());
revoke insert, update, delete on table public.repair_payments from anon, authenticated;

-- มีสลิปรอตรวจหรือชำระแล้ว ห้ามแก้ยอดค่าใช้จ่ายหรือผู้ชำระของเรื่องนั้น (ไม่งั้นยอดที่ผู้เช่าโอนกับยอดในระบบขัดกัน)
create or replace function public.repairs_lock_cost()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (new.cost is distinct from old.cost or new.cost_payer is distinct from old.cost_payer)
     and exists (select 1 from public.repair_payments where repair_id = old.id and status in ('review', 'paid')) then
    raise exception 'เรื่องนี้มีการส่งสลิปหรือชำระค่าซ่อมแล้ว แก้ไขค่าใช้จ่ายไม่ได้';
  end if;
  return new;
end;
$$;

drop trigger if exists repairs_lock_cost on public.repairs;
create trigger repairs_lock_cost before update of cost, cost_payer on public.repairs
  for each row execute function public.repairs_lock_cost();

-- submit_repair_slip: ผู้เช่าส่งสลิปค่าซ่อมของเรื่องตัวเอง (หน้าเว็บอัปโหลดรูปลงถัง slips โฟลเดอร์ <user id>/ ก่อนแล้วเรียกฟังก์ชันนี้)
create or replace function public.submit_repair_slip(p_repair uuid, p_path text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  r public.repairs;
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

  begin
    insert into public.repair_payments (repair_id, user_id, amount, slip_path)
    values (r.id, r.user_id, r.cost, p_path)
    returning id into new_id;
  exception when unique_violation then
    raise exception 'ค่าซ่อมรายการนี้ส่งสลิปแล้วหรือชำระเรียบร้อยแล้ว';
  end;

  perform public.notify_admins(
    'repair', 'มีสลิปค่าซ่อมรอตรวจสอบ',
    'ห้อง ' || r.room || ' · ' || r.problem,
    'ผู้เช่าห้อง ' || r.room || ' แนบสลิปค่าซ่อม "' || r.problem || '" ยอด ' || public.fmt_baht(r.cost) || ' รอตรวจสอบ',
    '/repairs', 'ไปที่ระบบแจ้งซ่อม');
  return new_id;
end;
$$;

-- record_repair_payment: ตรรกะยืนยันรับค่าซ่อม (ใช้ร่วมระหว่างแอดมินกดยืนยันกับระบบอนุมัติอัตโนมัติ) ผู้เรียกต้องตรวจสิทธิ์ก่อน
create or replace function public.record_repair_payment(p_payment uuid, p_by uuid, p_auto boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  pay public.repair_payments;
  r public.repairs;
  ref text;
begin
  select * into pay from public.repair_payments where id = p_payment and status = 'review' for update;
  if not found then
    raise exception 'รายการนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ';
  end if;
  select * into r from public.repairs where id = pay.repair_id;

  ref := nullif(pay.verify_detail ->> 'transRef', '');
  begin
    if ref is not null then
      insert into public.slip_refs (trans_ref, source) values (ref, 'repair');
    end if;
  exception when unique_violation then
    raise exception 'สลิปนี้ถูกใช้ยืนยันรับเงินกับรายการอื่นแล้ว';
  end;

  update public.repair_payments
     set status = 'paid', reviewed_at = now(), reviewed_by = p_by, auto_approved = coalesce(p_auto, false),
         trans_ref = ref, reject_reason = null, receipt_no = nextval('public.receipt_no_seq')
   where id = pay.id;

  perform public.notify(
    pay.user_id, 'repair', 'ชำระค่าซ่อมเรียบร้อย',
    'ห้อง ' || r.room || ' · ' || r.problem,
    case when p_auto
      then 'ระบบตรวจสอบสลิปและยืนยันการชำระค่าซ่อม "' || r.problem || '" ยอด ' || public.fmt_baht(pay.amount) || ' อัตโนมัติแล้ว'
      else 'ผู้ดูแลตรวจสอบสลิปและยืนยันการชำระค่าซ่อม "' || r.problem || '" ยอด ' || public.fmt_baht(pay.amount) || ' แล้ว' end,
    '/repairs', 'ดูรายการแจ้งซ่อม');
  if p_auto then
    perform public.notify_admins(
      'repair', 'ระบบอนุมัติสลิปค่าซ่อมอัตโนมัติ',
      'ห้อง ' || r.room || ' · ' || r.problem,
      'ระบบตรวจสลิปค่าซ่อมห้อง ' || r.room || ' ยอด ' || public.fmt_baht(pay.amount) || ' ผ่านครบทุกเงื่อนไขและยืนยันรับเงินแล้ว',
      '/repairs', 'ไปที่ระบบแจ้งซ่อม');
  end if;
end;
$$;

-- approve_repair_payment: แอดมินยืนยันว่าได้รับค่าซ่อมตามสลิป (ยอดเต็มตามที่ระบุ)
create or replace function public.approve_repair_payment(p_payment uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  perform public.record_repair_payment(p_payment, auth.uid(), false);
end;
$$;

-- reject_repair_payment: แอดมินปฏิเสธสลิป (ต้องมีเหตุผล) ผู้เช่าส่งสลิปใหม่ได้
create or replace function public.reject_repair_payment(p_payment uuid, p_reason text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  pay public.repair_payments;
  r public.repairs;
begin
  if not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'กรุณาระบุเหตุผลที่ปฏิเสธ';
  end if;
  update public.repair_payments
     set status = 'rejected', reject_reason = left(btrim(p_reason), 500), reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_payment and status = 'review'
   returning * into pay;
  if not found then
    raise exception 'รายการนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ';
  end if;
  select * into r from public.repairs where id = pay.repair_id;
  perform public.notify(
    pay.user_id, 'repair', 'สลิปค่าซ่อมไม่ผ่านการตรวจสอบ',
    'ห้อง ' || r.room || ' · ' || r.problem,
    'ผู้ดูแลไม่รับสลิปค่าซ่อม "' || r.problem || E'"\nเหตุผล: ' || pay.reject_reason || E'\nกรุณาโอนและแนบสลิปใหม่อีกครั้ง',
    '/repairs', 'แนบสลิปใหม่');
end;
$$;

-- ---------------------------------------------------------------------------
-- ตรวจสลิปด้วย EasySlip สำหรับค่าซ่อม (ทำงานเหมือนของใบแจ้งหนี้ใน slip-verify.sql ใช้ Edge Function verify-slip ตัวเดียวกัน)
-- ---------------------------------------------------------------------------

-- เปลี่ยนสลิปไม่ได้ในแถวเดิม (ส่งใหม่คือแถวใหม่) จึงไม่ต้องมี trigger ล้างผลตรวจ

-- จองสิทธิ์ตรวจ 1 ครั้งต่อรายการ (ตรวจซ้ำได้เฉพาะเมื่อครั้งก่อน error สูงสุด 3 ครั้ง)
-- created_at = เวลาที่ซ่อมเสร็จ (ถ้ามี) ใช้เทียบวันที่โอนในสลิปว่าไม่เก่ากว่าเวลาที่รู้ยอดค่าซ่อม
create or replace function public.claim_repair_slip_verify(p_payment uuid)
returns table (id uuid, user_id uuid, slip_path text, total numeric, paid_amount numeric, created_at timestamptz)
language sql
security definer set search_path = public
as $$
  with c as (
    update public.repair_payments p
       set verify_status = 'checking', verify_attempts = p.verify_attempts + 1
     where p.id = p_payment
       and p.status = 'review'
       and (p.verify_status is null or p.verify_status = 'error')
       and p.verify_attempts < 3
     returning p.id, p.user_id, p.slip_path, p.amount, p.repair_id
  )
  select c.id, c.user_id, c.slip_path, c.amount, 0::numeric, coalesce(r.completed_at, r.created_at)
  from c join public.repairs r on r.id = c.repair_id;
$$;

-- บันทึกผลตรวจ และตรวจสลิปซ้ำจากเลขอ้างอิง
create or replace function public.apply_repair_slip_result(p_payment uuid, p_status text, p_detail jsonb)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  result text := p_status;
  detail jsonb := coalesce(p_detail, '{}'::jsonb);
  ref text := nullif(detail ->> 'transRef', '');
begin
  perform 1 from public.repair_payments where id = p_payment and verify_status = 'checking' for update;
  if not found then return 'ignored'; end if;

  if result in ('ok', 'warn') and ref is not null and (
       exists (select 1 from public.slip_refs where trans_ref = ref)
       or exists (select 1 from public.repair_payments
                   where id <> p_payment and status = 'review' and verify_status in ('ok', 'warn') and verify_detail ->> 'transRef' = ref)
       or exists (select 1 from public.invoices
                   where status = 'review' and verify_status in ('ok', 'warn') and verify_detail ->> 'transRef' = ref)
     ) then
    result := 'failed';
    detail := jsonb_set(detail, '{notes}', coalesce(detail -> 'notes', '[]'::jsonb) || to_jsonb('สลิปนี้ถูกใช้กับรายการอื่นแล้ว'::text));
  end if;

  update public.repair_payments set verify_status = result, verify_detail = detail where id = p_payment;
  return result;
end;
$$;

create or replace function public.mark_repair_slip_error(p_payment uuid, p_message text)
returns void
language sql
security definer set search_path = public
as $$
  update public.repair_payments
     set verify_status = 'error', verify_detail = jsonb_build_object('notes', jsonb_build_array(p_message))
   where id = p_payment and verify_status = 'checking';
$$;

-- ยืนยันรับค่าซ่อมให้เองเมื่อผ่านครบทุกเงื่อนไข (เหมือน auto_approve_slip: โหมด auto, ผลตรวจ ok, ยอดเท่ายอดค่าซ่อมพอดี,
-- ผู้รับยืนยันแล้ว, มีเลขอ้างอิงและไม่ซ้ำ) คืน 'paid' หรือ 'not_eligible'
create or replace function public.auto_approve_repair_payment(p_payment uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  pay public.repair_payments;
  detail jsonb;
  amt numeric;
begin
  if coalesce((select slip_verify_mode from public.app_settings where id = 1), 'off') <> 'auto' then
    return 'not_eligible';
  end if;

  select * into pay from public.repair_payments where id = p_payment and status = 'review' and verify_status = 'ok' for update;
  if not found then return 'not_eligible'; end if;

  detail := coalesce(pay.verify_detail, '{}'::jsonb);
  begin
    amt := (detail ->> 'amount')::numeric;
  exception when others then
    return 'not_eligible';
  end;

  if amt is null or round(amt, 2) <> round(pay.amount, 2) then return 'not_eligible'; end if;
  if (detail -> 'accountMatched') is distinct from 'true'::jsonb then return 'not_eligible'; end if;
  if nullif(detail ->> 'transRef', '') is null then return 'not_eligible'; end if;

  begin
    perform public.record_repair_payment(pay.id, null, true);
  exception when raise_exception then
    return 'not_eligible';
  end;
  return 'paid';
end;
$$;

revoke all on function public.submit_repair_slip(uuid, text) from public, anon;
revoke all on function public.approve_repair_payment(uuid) from public, anon;
revoke all on function public.reject_repair_payment(uuid, text) from public, anon;
grant execute on function public.submit_repair_slip(uuid, text) to authenticated;
grant execute on function public.approve_repair_payment(uuid) to authenticated;
grant execute on function public.reject_repair_payment(uuid, text) to authenticated;

-- ฟังก์ชันภายในและของ Edge Function (service role) ผู้ใช้เว็บเรียกไม่ได้
revoke all on function public.record_repair_payment(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.claim_repair_slip_verify(uuid) from public, anon, authenticated;
revoke all on function public.apply_repair_slip_result(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.mark_repair_slip_error(uuid, text) from public, anon, authenticated;
revoke all on function public.auto_approve_repair_payment(uuid) from public, anon, authenticated;
grant execute on function public.claim_repair_slip_verify(uuid) to service_role;
grant execute on function public.apply_repair_slip_result(uuid, text, jsonb) to service_role;
grant execute on function public.mark_repair_slip_error(uuid, text) to service_role;
grant execute on function public.auto_approve_repair_payment(uuid) to service_role;

-- ============================================================
-- move-out
-- ============================================================

-- เงินประกันและการย้ายออก: รันใน Supabase SQL Editor หลังรัน schema.sql, invoices.sql, repairs.sql, notifications.sql, settings.sql และ payments.sql (รันซ้ำได้)
-- ถ้าจะให้บันทึกในประวัติการแก้ไข ให้รัน audit.sql อีกครั้งหลังไฟล์นี้
--
-- แนวคิด: เงินประกันเก็บที่ tenants.deposit แอดมินกรอกตอนเพิ่มผู้เช่าหรือแก้ในหน้ารายละเอียด
-- ย้ายออก = เรียก record_move_out ครั้งเดียว: ระบุวันที่ย้ายออก และรายการหักจากเงินประกัน (ค่าเช่า/ค่าปรับค้างชำระ ค่าทำความสะอาด ค่าเสียหาย ฯลฯ)
--   ฐานข้อมูลคำนวณเอง: ยอดคืนผู้เช่า = เงินประกัน - ยอดหัก (ไม่ต่ำกว่า 0) ถ้าหักเกินเงินประกัน = ยอดที่ผู้เช่าต้องจ่ายเพิ่ม (owed_amount)
--   รายการหักที่ผูกกับใบแจ้งหนี้ จะถูกบันทึกเป็นการรับเงินของใบนั้นจริง (แหล่งที่มา "หักจากเงินประกัน" มีใบเสร็จ) ไม่ปล่อยค้างในรายงาน
--   บันทึกย้ายออกเก็บสำเนาข้อมูลผู้เช่า ไม่หายแม้ลบผู้เช่าและบัญชีภายหลัง (การลบผู้เช่า/คืนห้องว่างยังใช้ปุ่มเดิมในหน้ารายละเอียดผู้เช่า)
--   เว็บเขียนตาราง move_outs ตรง ๆ ไม่ได้ ต้องผ่านฟังก์ชัน

alter table public.tenants add column if not exists deposit numeric(12, 2) not null default 0;
alter table public.tenants drop constraint if exists tenants_deposit_check;
alter table public.tenants add constraint tenants_deposit_check check (deposit >= 0);

-- แหล่งที่มาของการรับเงินค่าห้อง: transfer = โอน (ผ่านสลิป) deposit = หักจากเงินประกันตอนย้ายออก (ไม่มีสลิป)
alter table public.invoice_payments add column if not exists source text not null default 'transfer';
alter table public.invoice_payments drop constraint if exists invoice_payments_source_check;
alter table public.invoice_payments add constraint invoice_payments_source_check check (source in ('transfer', 'deposit'));

create table if not exists public.move_outs (
  id uuid primary key default gen_random_uuid(),
  room text not null references public.rooms (number) on update cascade,
  -- สำเนาข้อมูลผู้เช่า ณ วันที่ย้ายออก
  tenant_name text not null,
  tenant_phone text not null default '',
  tenant_user_id uuid,
  start_date date,
  end_date date,
  move_out_date date not null,
  deposit numeric(12, 2) not null check (deposit >= 0),
  -- รายการหัก [{label, amount, invoice_id?}] (ตรวจและจัดรูปแบบโดย record_move_out)
  deductions jsonb not null default '[]'::jsonb,
  deductions_total numeric(12, 2) not null default 0 check (deductions_total >= 0),
  -- ยอดที่ต้องคืนผู้เช่า / ยอดที่ผู้เช่าต้องจ่ายเพิ่ม (หักเกินเงินประกัน)
  refund_amount numeric(12, 2) not null default 0 check (refund_amount >= 0),
  owed_amount numeric(12, 2) not null default 0 check (owed_amount >= 0),
  -- pending รอคืนเงิน, done คืนแล้ว, none ไม่มียอดต้องคืน
  refund_status text not null default 'pending' check (refund_status in ('pending', 'done', 'none')),
  refunded_at timestamptz,
  refund_note text not null default '' check (char_length(refund_note) <= 500),
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists move_outs_room_idx on public.move_outs (room, created_at desc);
-- ผู้เช่า 1 สัญญา (ห้อง + วันเริ่มสัญญา) บันทึกย้ายออกได้ครั้งเดียว
create unique index if not exists move_outs_tenancy_key on public.move_outs (room, start_date) where start_date is not null;

alter table public.move_outs enable row level security;
drop policy if exists "move outs admin read" on public.move_outs;
create policy "move outs admin read" on public.move_outs for select to authenticated using (public.is_admin());
revoke insert, update, delete on table public.move_outs from anon, authenticated;

-- record_move_out: บันทึกย้ายออกและหักเงินประกัน (ทั้งหมดสำเร็จหรือไม่สำเร็จพร้อมกัน)
-- p_deductions = [{"label": "ค่าทำความสะอาด", "amount": 500}, {"label": "ค่าเช่า ต.ค. 69", "amount": 4200, "invoice_id": "<uuid>"}]
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
  if exists (select 1 from public.move_outs where room = t.room and start_date is not distinct from t.start_date) then
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
      select * into inv from public.invoices where id = inv_id and room = t.room for update;
      if not found then
        raise exception 'ไม่พบใบแจ้งหนี้ของห้องนี้';
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

-- mark_deposit_refunded: แอดมินบันทึกว่าคืนเงินประกันให้ผู้เช่าแล้ว
create or replace function public.mark_deposit_refunded(p_id uuid, p_note text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  update public.move_outs
     set refund_status = 'done', refunded_at = now(), refund_note = left(btrim(coalesce(p_note, '')), 500)
   where id = p_id and refund_status = 'pending';
  if not found then
    raise exception 'ไม่มียอดเงินประกันที่รอคืนในรายการนี้';
  end if;
end;
$$;

revoke all on function public.record_move_out(text, date, jsonb, text) from public, anon;
revoke all on function public.mark_deposit_refunded(uuid, text) from public, anon;
grant execute on function public.record_move_out(text, date, jsonb, text) to authenticated;
grant execute on function public.mark_deposit_refunded(uuid, text) to authenticated;

-- ============================================================
-- audit
-- ============================================================

-- ประวัติการแก้ไขข้อมูลสำคัญ (audit log): รันใน Supabase SQL Editor หลังรัน invoices.sql, repairs.sql, payments.sql, repair-payments.sql และ settings.sql (รันซ้ำได้)
-- ไฟล์ที่ยังไม่ได้รัน (เช่น repair-payments.sql) ข้ามส่วนของตารางนั้นเองโดยไม่ error
--
-- แนวคิด: ฐานข้อมูลบันทึกเองด้วย trigger ทุกครั้งที่มีการเปลี่ยนเรื่องเงินและการตั้งค่า (ใครทำ ทำอะไร เมื่อไหร่ ค่าเดิม/ค่าใหม่)
--   เว็บไม่มีสิทธิ์เขียน/แก้/ลบตารางนี้ (บันทึกปลอมหรือลบร่องรอยไม่ได้) เฉพาะแอดมินอ่านได้ และแก้/ลบแถวที่บันทึกแล้วไม่ได้แม้ใช้ SQL Editor (trigger กัน)
-- บันทึก: สร้าง/แก้ยอด/เปลี่ยนสถานะ/ลบใบแจ้งหนี้, ยืนยันรับเงิน (แอดมินหรือระบบอัตโนมัติ), โอนคืนยอดเกิน, ยืนยัน/ปฏิเสธสลิปค่าซ่อม,
--   แก้ค่าซ่อมและผู้ชำระ, เพิ่ม/ลบผู้เช่า, แก้ไขการตั้งค่า (รวมบัญชีรับเงินและพร้อมเพย์)
-- ผู้ทำรายการที่ไม่มีตัวตน (Edge Function ใช้ service role หรือรัน SQL เอง) บันทึกเป็น "ระบบ"
-- ไม่มีการลบประวัติเก่าอัตโนมัติ ตารางโตช้าเพราะเก็บเฉพาะเหตุการณ์สำคัญ

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- ผู้ทำรายการ: id และอีเมลจากตั๋วล็อกอิน (ว่าง = ระบบ) role = admin / user / system
  actor_id uuid,
  actor_email text,
  actor_role text not null default 'system',
  -- ชนิดเหตุการณ์ เช่น invoice.create, payment.confirm, settings.update
  action text not null,
  -- ตารางและรหัสของสิ่งที่ถูกแก้ ห้องที่เกี่ยวข้อง (ถ้ามี)
  entity text not null,
  entity_id text,
  room text,
  -- ข้อความสรุปภาษาไทยสำหรับอ่าน และรายละเอียด (ค่าเดิม/ค่าใหม่) สำหรับตรวจสอบ
  summary text not null,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, at desc);

alter table public.audit_log enable row level security;

drop policy if exists "audit read admin" on public.audit_log;
create policy "audit read admin" on public.audit_log for select to authenticated using (public.is_admin());
revoke insert, update, delete on table public.audit_log from anon, authenticated;

-- แก้/ลบแถวที่บันทึกแล้วไม่ได้ (กันแก้ประวัติย้อนหลัง)
create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ประวัติการแก้ไขแก้หรือลบไม่ได้';
end;
$$;

drop trigger if exists audit_log_immutable on public.audit_log;
create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

-- audit_write: บันทึก 1 เหตุการณ์ (เรียกจาก trigger ด้านล่างเท่านั้น ห้ามให้ผู้ใช้เรียกเอง)
create or replace function public.audit_write(
  p_action text, p_entity text, p_entity_id text, p_room text, p_summary text, p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  claims jsonb;
  email text;
  who uuid := auth.uid();
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    email := claims ->> 'email';
  exception when others then
    email := null;
  end;
  insert into public.audit_log (actor_id, actor_email, actor_role, action, entity, entity_id, room, summary, detail)
  values (
    who, email,
    case when who is null then 'system' when public.is_admin() then 'admin' else 'user' end,
    p_action, p_entity, p_entity_id, p_room, p_summary, coalesce(p_detail, '{}'::jsonb));
end;
$$;

revoke all on function public.audit_write(text, text, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.audit_status_label(s text)
returns text
language sql
immutable
as $$
  select case s when 'pending' then 'รอชำระ' when 'review' then 'รอตรวจสอบ' when 'paid' then 'ชำระแล้ว' else coalesce(s, '-') end;
$$;

-- ---------------------------------------------------------------------------
-- ใบแจ้งหนี้
-- ---------------------------------------------------------------------------
create or replace function public.audit_invoices()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_write('invoice.create', 'invoices', new.id::text, new.room,
      'สร้างใบแจ้งหนี้ ห้อง ' || new.room || ' เดือน ' || public.thai_month(new.month) || ' ยอด ' || public.fmt_baht(new.total),
      jsonb_build_object('month', new.month, 'total', new.total, 'tenant', new.tenant_name));
  elsif tg_op = 'DELETE' then
    perform public.audit_write('invoice.delete', 'invoices', old.id::text, old.room,
      'ลบใบแจ้งหนี้ ห้อง ' || old.room || ' เดือน ' || public.thai_month(old.month) || ' ยอด ' || public.fmt_baht(old.total)
        || ' (' || public.audit_status_label(old.status) || ' รับแล้ว ' || public.fmt_baht(old.paid_amount) || ')',
      jsonb_build_object('month', old.month, 'total', old.total, 'status', old.status, 'paid_amount', old.paid_amount, 'tenant', old.tenant_name));
  else
    if new.total is distinct from old.total then
      perform public.audit_write('invoice.edit_total', 'invoices', new.id::text, new.room,
        'แก้ยอดรวมใบแจ้งหนี้ ห้อง ' || new.room || ' เดือน ' || public.thai_month(new.month) || ': ' || public.fmt_baht(old.total) || ' → ' || public.fmt_baht(new.total),
        jsonb_build_object('month', new.month, 'old', old.total, 'new', new.total,
          'rent', jsonb_build_array(old.rent, new.rent),
          'water', jsonb_build_array(old.water_prev, old.water_curr, new.water_prev, new.water_curr),
          'elec', jsonb_build_array(old.elec_prev, old.elec_curr, new.elec_prev, new.elec_curr)));
    end if;
    if new.status is distinct from old.status then
      perform public.audit_write('invoice.status', 'invoices', new.id::text, new.room,
        'เปลี่ยนสถานะใบแจ้งหนี้ ห้อง ' || new.room || ' เดือน ' || public.thai_month(new.month) || ': '
          || public.audit_status_label(old.status) || ' → ' || public.audit_status_label(new.status)
          || case when old.status = 'review' and new.status = 'pending' and new.paid_amount = old.paid_amount and coalesce(new.reject_reason, '') <> ''
                  then ' (ปฏิเสธสลิป: ' || new.reject_reason || ')' else '' end,
        jsonb_build_object('month', new.month, 'from', old.status, 'to', new.status, 'paid_amount', new.paid_amount, 'reject_reason', new.reject_reason));
    end if;
    if new.refund_status = 'done' and old.refund_status is distinct from 'done' then
      perform public.audit_write('refund.done', 'invoices', new.id::text, new.room,
        'บันทึกโอนยอดคืนผู้เช่า ห้อง ' || new.room || ' เดือน ' || public.thai_month(new.month) || ' ' || public.fmt_baht(new.refund_amount),
        jsonb_build_object('month', new.month, 'refund_amount', new.refund_amount, 'note', new.refund_note));
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists audit_invoices on public.invoices;
create trigger audit_invoices after insert or update or delete on public.invoices
  for each row execute function public.audit_invoices();

-- ---------------------------------------------------------------------------
-- การรับเงินค่าห้อง (ยืนยันสลิป)
-- ---------------------------------------------------------------------------
create or replace function public.audit_invoice_payments()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  inv public.invoices;
begin
  select * into inv from public.invoices where id = new.invoice_id;
  perform public.audit_write('payment.confirm', 'invoice_payments', new.id::text, inv.room,
    case when new.auto_approved then 'ระบบยืนยันรับเงินอัตโนมัติ' else 'ยืนยันรับเงิน' end
      || ' ห้อง ' || coalesce(inv.room, '-') || ' เดือน ' || coalesce(public.thai_month(inv.month), '-') || ' ' || public.fmt_baht(new.amount),
    jsonb_build_object('invoice_id', new.invoice_id, 'amount', new.amount, 'auto', new.auto_approved, 'trans_ref', new.trans_ref, 'confirmed_by', new.confirmed_by));
  return new;
end;
$$;

drop trigger if exists audit_invoice_payments on public.invoice_payments;
create trigger audit_invoice_payments after insert on public.invoice_payments
  for each row execute function public.audit_invoice_payments();

-- ---------------------------------------------------------------------------
-- ค่าซ่อม: ยอด/ผู้ชำระ และการยืนยัน/ปฏิเสธสลิป (ส่วนสลิปมีเมื่อรัน repair-payments.sql แล้ว)
-- ---------------------------------------------------------------------------
create or replace function public.audit_repairs()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.cost is distinct from old.cost or new.cost_payer is distinct from old.cost_payer then
    perform public.audit_write('repair.cost', 'repairs', new.id::text, new.room,
      'แก้ค่าซ่อม ห้อง ' || new.room || ' "' || new.problem || '": ' || public.fmt_baht(old.cost) || ' (' || old.cost_payer || ') → '
        || public.fmt_baht(new.cost) || ' (' || new.cost_payer || ')',
      jsonb_build_object('old_cost', old.cost, 'new_cost', new.cost, 'old_payer', old.cost_payer, 'new_payer', new.cost_payer));
  end if;
  return new;
end;
$$;

drop trigger if exists audit_repairs on public.repairs;
create trigger audit_repairs after update of cost, cost_payer on public.repairs
  for each row execute function public.audit_repairs();

do $$
begin
  if to_regclass('public.repair_payments') is not null then
    execute $f$
      create or replace function public.audit_repair_payments()
      returns trigger
      language plpgsql
      security definer set search_path = public
      as $body$
      declare
        r public.repairs;
      begin
        if new.status is distinct from old.status and new.status in ('paid', 'rejected') then
          select * into r from public.repairs where id = new.repair_id;
          perform public.audit_write('repair_payment.' || new.status, 'repair_payments', new.id::text, r.room,
            case when new.status = 'paid'
                 then case when new.auto_approved then 'ระบบยืนยันรับค่าซ่อมอัตโนมัติ' else 'ยืนยันรับค่าซ่อม' end
                 else 'ปฏิเสธสลิปค่าซ่อม' end
              || ' ห้อง ' || coalesce(r.room, '-') || ' "' || coalesce(r.problem, '-') || '" ' || public.fmt_baht(new.amount)
              || case when new.status = 'rejected' then ' (' || coalesce(new.reject_reason, '') || ')' else '' end,
            jsonb_build_object('repair_id', new.repair_id, 'amount', new.amount, 'auto', new.auto_approved, 'trans_ref', new.trans_ref, 'reason', new.reject_reason));
        end if;
        return new;
      end;
      $body$
    $f$;
    drop trigger if exists audit_repair_payments on public.repair_payments;
    create trigger audit_repair_payments after update on public.repair_payments
      for each row execute function public.audit_repair_payments();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ย้ายออกและคืนเงินประกัน (มีเมื่อรัน move-out.sql แล้ว ถ้ารัน move-out.sql ทีหลัง ให้รันไฟล์นี้ซ้ำ)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.move_outs') is not null then
    execute $f$
      create or replace function public.audit_move_outs()
      returns trigger
      language plpgsql
      security definer set search_path = public
      as $body$
      begin
        if tg_op = 'INSERT' then
          perform public.audit_write('moveout.create', 'move_outs', new.id::text, new.room,
            'บันทึกการย้ายออก ห้อง ' || new.room || ' ' || new.tenant_name || ' เงินประกัน ' || public.fmt_baht(new.deposit)
              || ' หัก ' || public.fmt_baht(new.deductions_total)
              || case when new.owed_amount > 0 then ' ผู้เช่าต้องจ่ายเพิ่ม ' || public.fmt_baht(new.owed_amount) else ' คืน ' || public.fmt_baht(new.refund_amount) end,
            jsonb_build_object('deposit', new.deposit, 'deductions', new.deductions, 'refund', new.refund_amount, 'owed', new.owed_amount, 'move_out_date', new.move_out_date));
        elsif new.refund_status = 'done' and old.refund_status is distinct from 'done' then
          perform public.audit_write('moveout.refund', 'move_outs', new.id::text, new.room,
            'บันทึกคืนเงินประกัน ห้อง ' || new.room || ' ' || new.tenant_name || ' ' || public.fmt_baht(new.refund_amount),
            jsonb_build_object('refund', new.refund_amount, 'note', new.refund_note));
        end if;
        return new;
      end;
      $body$
    $f$;
    drop trigger if exists audit_move_outs on public.move_outs;
    create trigger audit_move_outs after insert or update on public.move_outs
      for each row execute function public.audit_move_outs();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ผู้เช่า (เพิ่ม/ลบ)
-- ---------------------------------------------------------------------------
create or replace function public.audit_tenants()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_write('tenant.create', 'tenants', new.room, new.room,
      'เพิ่มผู้เช่า ห้อง ' || new.room || ' ' || new.name, jsonb_build_object('name', new.name, 'username', new.username));
    return new;
  end if;
  perform public.audit_write('tenant.delete', 'tenants', old.room, old.room,
    'ลบผู้เช่า ห้อง ' || old.room || ' ' || old.name, jsonb_build_object('name', old.name, 'username', old.username));
  return old;
end;
$$;

drop trigger if exists audit_tenants on public.tenants;
create trigger audit_tenants after insert or delete on public.tenants
  for each row execute function public.audit_tenants();

-- ---------------------------------------------------------------------------
-- การตั้งค่า (โดยเฉพาะบัญชีรับเงิน/พร้อมเพย์ ถ้าถูกเปลี่ยนต้องตรวจย้อนหลังได้ว่าใครเปลี่ยน)
-- ---------------------------------------------------------------------------
create or replace function public.audit_settings()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  k text;
  changed jsonb := '{}'::jsonb;
begin
  for k in select jsonb_object_keys(n) loop
    if k <> 'updated_at' and (o -> k) is distinct from (n -> k) then
      changed := changed || jsonb_build_object(k, jsonb_build_object('old', o -> k, 'new', n -> k));
    end if;
  end loop;
  if changed <> '{}'::jsonb then
    perform public.audit_write('settings.update', 'app_settings', '1', null,
      'แก้ไขการตั้งค่า: ' || (select string_agg(key, ', ' order by key) from jsonb_object_keys(changed) as key), changed);
  end if;
  return new;
end;
$$;

drop trigger if exists audit_settings on public.app_settings;
create trigger audit_settings after update on public.app_settings
  for each row execute function public.audit_settings();

-- ============================================================
-- chat
-- ============================================================

-- ระบบแชทผู้เช่า <-> ผู้ดูแล แบบเรียลไทม์: รันใน Supabase SQL Editor หลังรัน schema.sql (ต้องมีฟังก์ชัน is_admin())
-- รันซ้ำได้ ไม่ทำให้ข้อมูลเดิมหาย
--
-- แนวคิด: ผู้เช่า 1 คน = 1 ห้องแชท (ระบุด้วย tenant_user_id = id บัญชีผู้เช่า) ผู้ดูแลทุกคนเห็นและตอบได้ทุกห้อง
-- read_at = เวลาที่ "อีกฝั่ง" อ่านข้อความนั้นแล้ว (ข้อความผู้เช่า -> ผู้ดูแลอ่าน, ข้อความผู้ดูแล -> ผู้เช่าอ่าน)

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_user_id uuid not null references auth.users (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  -- ส่งจากฝั่งผู้เช่าหรือไม่ (กำหนดตอนเพิ่มข้อความ ไม่ขึ้นกับบัญชีผู้ส่งที่อาจถูกลบภายหลัง)
  from_tenant boolean not null default false,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- รูปที่แนบในแชท (path ใน bucket chat: <tenant_user_id>/<ไฟล์>) ข้อความต้องมีตัวอักษรหรือรูปอย่างใดอย่างหนึ่ง
alter table public.chat_messages add column if not exists image_path text;
alter table public.chat_messages alter column body set default '';
-- แก้ไข/ลบข้อความ (ลบแบบซ่อน: ล้างเนื้อหาแต่เก็บแถวไว้ แสดงเป็น "ข้อความนี้ถูกลบแล้ว")
alter table public.chat_messages add column if not exists edited_at timestamptz;
alter table public.chat_messages add column if not exists deleted_at timestamptz;
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages add constraint chat_messages_body_check
  check (char_length(body) <= 2000 and (deleted_at is not null or btrim(body) <> '' or image_path is not null));

create index if not exists chat_messages_thread_idx on public.chat_messages (tenant_user_id, created_at desc);
create index if not exists chat_messages_unread_idx on public.chat_messages (tenant_user_id, from_tenant) where read_at is null;

alter table public.chat_messages enable row level security;

-- ผู้ดูแลเห็นทุกห้อง ผู้เช่าเห็นเฉพาะห้องแชทของตัวเอง
drop policy if exists "chat read" on public.chat_messages;
create policy "chat read" on public.chat_messages for select to authenticated
  using (public.is_admin() or tenant_user_id = auth.uid());

-- ส่งข้อความได้เฉพาะในห้องที่ตัวเองมีสิทธิ์ (ผู้ส่ง/เวลา/ฝั่ง ถูกกำหนดโดย trigger ด้านล่าง)
drop policy if exists "chat insert" on public.chat_messages;
create policy "chat insert" on public.chat_messages for insert to authenticated
  with check (public.is_admin() or tenant_user_id = auth.uid());

-- แก้/ลบตารางตรง ๆ ไม่ได้ ต้องผ่านฟังก์ชัน chat_mark_read / chat_edit_message / chat_delete_message
revoke update, delete on table public.chat_messages from anon, authenticated;

-- กำหนดผู้ส่ง ฝั่งผู้ส่ง และเวลาเอง ไม่เชื่อค่าที่ส่งมาจากเว็บ
create or replace function public.chat_messages_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.sender_id := auth.uid();
    new.from_tenant := not public.is_admin();
  end if;
  new.body := btrim(coalesce(new.body, ''));
  -- รูปต้องอยู่ในโฟลเดอร์ของห้องแชทนี้เท่านั้น
  if new.image_path is not null and split_part(new.image_path, '/', 1) <> new.tenant_user_id::text then
    raise exception 'ที่อยู่รูปไม่ถูกต้อง';
  end if;
  new.read_at := null;
  new.edited_at := null;
  new.deleted_at := null;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists chat_messages_before_insert on public.chat_messages;
create trigger chat_messages_before_insert before insert on public.chat_messages
  for each row execute function public.chat_messages_before_insert();

-- ทำเครื่องหมายว่าอ่านข้อความของอีกฝั่งในห้องนี้แล้ว
create or replace function public.chat_mark_read(p_tenant uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_admin boolean := public.is_admin();
begin
  if not v_admin and p_tenant is distinct from auth.uid() then
    raise exception 'ไม่มีสิทธิ์เข้าถึงห้องแชทนี้';
  end if;
  update public.chat_messages
  set read_at = now()
  where tenant_user_id = p_tenant and read_at is null and from_tenant = v_admin;
end;
$$;

-- แก้ไขข้อความของตัวเอง (แก้ได้เฉพาะตัวอักษร รูปแก้ไม่ได้)
create or replace function public.chat_edit_message(p_id uuid, p_body text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.chat_messages
  set body = btrim(coalesce(p_body, '')), edited_at = now()
  where id = p_id and sender_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'แก้ไขได้เฉพาะข้อความของตัวเองที่ยังไม่ถูกลบ'; end if;
end;
$$;

-- ลบข้อความของตัวเอง: ล้างข้อความและรูป คืน path รูปเดิมให้เว็บลบไฟล์ออกจาก storage
create or replace function public.chat_delete_message(p_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_image text;
begin
  select image_path into v_image from public.chat_messages
  where id = p_id and sender_id = auth.uid() and deleted_at is null
  for update;
  if not found then raise exception 'ลบได้เฉพาะข้อความของตัวเองที่ยังไม่ถูกลบ'; end if;
  update public.chat_messages set body = '', image_path = null, deleted_at = now() where id = p_id;
  return v_image;
end;
$$;

-- รายการห้องแชทสำหรับผู้ดูแล: ข้อความล่าสุด และจำนวนข้อความจากผู้เช่าที่ยังไม่อ่าน
create or replace function public.chat_conversations()
returns table (tenant_user_id uuid, last_body text, last_at timestamptz, last_from_tenant boolean, unread bigint)
language sql
stable
security definer set search_path = public
as $$
  select distinct on (m.tenant_user_id)
    m.tenant_user_id,
    case when m.deleted_at is not null then 'ข้อความถูกลบแล้ว' else coalesce(nullif(m.body, ''), '[รูปภาพ]') end,
    m.created_at, m.from_tenant,
    count(*) filter (where m.from_tenant and m.read_at is null and m.deleted_at is null) over (partition by m.tenant_user_id)
  from public.chat_messages m
  where public.is_admin()
  order by m.tenant_user_id, m.created_at desc;
$$;

revoke all on function public.chat_mark_read(uuid) from public, anon;
revoke all on function public.chat_conversations() from public, anon;
grant execute on function public.chat_mark_read(uuid) to authenticated;
grant execute on function public.chat_conversations() to authenticated;
revoke all on function public.chat_edit_message(uuid, text) from public, anon;
revoke all on function public.chat_delete_message(uuid) from public, anon;
grant execute on function public.chat_edit_message(uuid, text) to authenticated;
grant execute on function public.chat_delete_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- รูปในแชท: bucket ส่วนตัว แยกโฟลเดอร์ตามห้องแชท (<tenant_user_id>/...) ไม่เกิน 5 MB
-- ผู้เช่าอัปโหลด/ดูได้เฉพาะโฟลเดอร์ตัวเอง ผู้ดูแลได้ทุกโฟลเดอร์
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "chat upload own or admin" on storage.objects;
create policy "chat upload own or admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "chat read own or admin" on storage.objects;
create policy "chat read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'chat' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ลบได้เฉพาะไฟล์ที่ตัวเองอัปโหลด (ใช้ตอนส่งข้อความไม่สำเร็จ หรือลบข้อความที่มีรูป)
drop policy if exists "chat delete own upload" on storage.objects;
create policy "chat delete own upload" on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and owner_id = auth.uid()::text);

-- ให้เว็บรับข้อความใหม่/สถานะอ่านแล้วแบบเรียลไทม์
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- ============================================================
-- notifications
-- ============================================================

-- ระบบแจ้งเตือนภายในเว็บ/แอป: รันใน Supabase SQL Editor หลังรัน schema.sql, invoices.sql และ repairs.sql
-- (ต้องมีตาราง profiles, invoices, repairs และฟังก์ชัน is_admin()) รันซ้ำได้ ไม่ทำให้ข้อมูลเดิมหาย
--
-- แนวคิด: แจ้งเตือน 1 แถวต่อ 1 ผู้รับ (สถานะอ่านแล้วแยกกันรายคน) สร้างโดย trigger ในฐานข้อมูลเท่านั้น
-- ฝั่งเว็บอ่าน/ทำเครื่องหมายอ่านแล้ว/ลบของตัวเองได้ แต่สร้างหรือแก้ข้อความเองไม่ได้

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'system' check (type in ('repair', 'invoice', 'system')),
  title text not null,
  subtitle text not null default '',
  details text not null default '',
  action_link text,
  action_label text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ฐานข้อมูลเดิมที่เคยมีคอลัมน์สี: ลบทิ้ง (แจ้งเตือนทุกรายการแสดงเป็นสีแดงที่ฝั่งเว็บ ไม่ต้องเก็บสี)
alter table public.notifications drop column if exists color;

create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications read own" on public.notifications;
create policy "notifications read own" on public.notifications for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own" on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists "notifications delete own" on public.notifications;
create policy "notifications delete own" on public.notifications for delete to authenticated
  using (recipient_id = auth.uid());

-- ฝั่งเว็บแก้ได้เฉพาะคอลัมน์ read_at (ทำเครื่องหมายอ่านแล้ว) และไม่มีสิทธิ์เพิ่มแถวเอง
revoke insert, update on table public.notifications from anon, authenticated;
grant update (read_at) on table public.notifications to authenticated;

-- ให้เว็บรับแจ้งเตือนใหม่แบบเรียลไทม์ (DELETE ต้องใช้ replica identity full ถึงจะกรองตามผู้รับได้)
alter table public.notifications replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ฟังก์ชันช่วยสร้างแจ้งเตือน (ห้ามให้ผู้ใช้เรียกเอง ไม่งั้นจะส่งแจ้งเตือนปลอมหาคนอื่นได้)
-- ---------------------------------------------------------------------------

-- ลบฟังก์ชันเวอร์ชันเก่าที่มีพารามิเตอร์สี (ลายเซ็นเปลี่ยน)
drop function if exists public.notify(uuid, text, text, text, text, text, text, text);
drop function if exists public.notify_admins(text, text, text, text, text, text, text);

create or replace function public.notify(
  p_recipient uuid, p_type text, p_title text,
  p_subtitle text, p_details text, p_link text, p_label text
)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.notifications (recipient_id, type, title, subtitle, details, action_link, action_label)
  select p_recipient, p_type, p_title, p_subtitle, p_details, p_link, p_label
  where p_recipient is not null;
$$;

-- ส่งถึงแอดมินทุกคน (ยกเว้นคนที่เป็นผู้กระทำเอง)
create or replace function public.notify_admins(
  p_type text, p_title text,
  p_subtitle text, p_details text, p_link text, p_label text
)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.notifications (recipient_id, type, title, subtitle, details, action_link, action_label)
  select p.id, p_type, p_title, p_subtitle, p_details, p_link, p_label
  from public.profiles p
  where p.role = 'admin' and p.id is distinct from auth.uid();
$$;

revoke all on function public.notify(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_admins(text, text, text, text, text, text) from public, anon, authenticated;

-- 2026-10 -> ต.ค. 69
create or replace function public.thai_month(m text)
returns text
language sql
immutable
as $$
  select (array['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'])[substr(m, 6, 2)::int]
         || ' ' || lpad(((substr(m, 1, 4)::int + 543) % 100)::text, 2, '0');
$$;

-- 1234.5 -> ฿1,234.5
create or replace function public.fmt_baht(n numeric)
returns text
language sql
immutable
as $$
  select '฿' || rtrim(to_char(n, 'FM999,999,999,990.99'), '.');
$$;

create or replace function public.repair_status_label(s text)
returns text
language sql
immutable
as $$
  select case s
    when 'pending' then 'รอนัดหมาย'
    when 'scheduled' then 'นัดหมายแล้ว'
    when 'in_progress' then 'กำลังซ่อม'
    when 'done' then 'เสร็จสิ้น'
    when 'cancelled' then 'ยกเลิก'
    else s end;
$$;

-- 13:00-15:30 -> 13:00-15:30 น. (ค่าแบบเดิม morning -> 09:00-12:00 น.)
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

-- 2026-10-20 -> จ. 20 ต.ค. 69
create or replace function public.thai_date(d date)
returns text
language sql
immutable
as $$
  select (array['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'])[extract(dow from d)::int + 1]
         || ' ' || extract(day from d)::int || ' ' || public.thai_month(to_char(d, 'YYYY-MM'));
$$;

-- ข้อความวันนัด เช่น "จ. 20 ต.ค. 69 13:00-15:30 น."
create or replace function public.repair_appointment_text(d date, p text)
returns text
language sql
immutable
as $$
  select public.thai_date(d) || ' ' || public.repair_period_label(p);
$$;

-- ข้อความช่วงเวลาที่ผู้เช่าสะดวก (บรรทัดละช่วง)
create or replace function public.repair_slots_text(p_slots jsonb, p_allow_entry boolean, p_note text)
returns text
language sql
immutable
as $$
  select concat_ws(E'\n',
    nullif(string_agg('• ' || public.repair_appointment_text((e->>'date')::date, e->>'period'), E'\n'), ''),
    case when p_allow_entry then '• เข้าห้องได้แม้ผู้เช่าไม่อยู่' end,
    case when coalesce(p_note, '') <> '' then '• หมายเหตุ: ' || p_note end)
  from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) e;
$$;

-- ---------------------------------------------------------------------------
-- แจ้งซ่อม
-- ---------------------------------------------------------------------------

create or replace function public.repairs_notify()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_admin boolean;
  v_head text;
  v_text text;
  v_title text;
  v_appt_changed boolean;
begin
  -- แก้ข้อมูลจาก SQL Editor / service role (ไม่มีผู้ใช้) ไม่ต้องแจ้งเตือน
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  v_admin := public.is_admin();

  if tg_op = 'INSERT' then
    if v_admin then
      perform public.notify(
        new.user_id, 'repair',
        case when new.status = 'scheduled' and new.appointment_state = 'proposed'
             then 'ผู้ดูแลบันทึกเรื่องแจ้งซ่อมและเสนอวันเข้าซ่อม กรุณายืนยัน'
             else 'ผู้ดูแลบันทึกเรื่องแจ้งซ่อมให้คุณ' end,
        'ห้อง ' || new.room || ' · ' || new.problem,
        'รายการ: ' || new.problem || case when new.detail <> '' then E'\n' || new.detail else '' end
          || case when new.status = 'scheduled'
                  then E'\nวันนัด: ' || public.repair_appointment_text(new.appointment_date, new.appointment_period)
                  else '' end,
        '/repairs', 'ดูรายการแจ้งซ่อม');
    else
      perform public.notify_admins(
        'repair',
        case new.urgency when 'emergency' then 'แจ้งซ่อมฉุกเฉิน!' when 'urgent' then 'แจ้งซ่อมด่วน' else 'แจ้งซ่อมใหม่' end,
        'ห้อง ' || new.room || ' · ' || new.problem,
        'ผู้เช่า' || case when new.tenant_name <> '' then ' ' || new.tenant_name else '' end
          || ' ห้อง ' || new.room || ' แจ้งซ่อม: ' || new.problem
          || case when new.detail <> '' then E'\n\n' || new.detail else '' end
          || E'\n\nช่วงเวลาที่สะดวกให้ช่างเข้า:\n'
          || coalesce(nullif(public.repair_slots_text(new.available_slots, new.allow_entry, new.availability_note), ''), '• ไม่ได้ระบุ')
          || case when new.contact_phone <> '' then E'\nเบอร์ติดต่อ: ' || new.contact_phone else '' end,
        '/repairs', 'ไปที่ระบบแจ้งซ่อม');
    end if;

  elsif tg_op = 'UPDATE' then
    v_head := 'ห้อง ' || new.room || ' · ' || new.problem;
    v_appt_changed := new.appointment_date is distinct from old.appointment_date
                   or new.appointment_period is distinct from old.appointment_period;

    if v_admin then
      v_text := 'รายการ: ' || new.problem || E'\nสถานะ: ' || public.repair_status_label(new.status);
      if new.status = 'scheduled' then
        v_text := v_text || E'\nวันนัด: ' || public.repair_appointment_text(new.appointment_date, new.appointment_period)
          || case when new.technician <> '' then E'\nช่าง: ' || new.technician else '' end
          || E'\nช่างจะโทรไปคอนเฟิร์มอีกครั้งก่อนถึงเวลานัด 30 นาที';
      end if;
      if new.status in ('in_progress', 'done') and new.cost > 0 then
        v_text := v_text || E'\nค่าใช้จ่าย: ' || public.fmt_baht(new.cost)
          || case when new.cost_payer = 'tenant' then ' (ผู้เช่าเป็นผู้ชำระ)' else ' (หอพักรับผิดชอบ)' end
          || case when new.cost_payer = 'tenant' and new.status = 'done' then E'\nชำระค่าซ่อมและแนบสลิปได้ที่หน้าแจ้งซ่อม' else '' end;
      end if;
      if new.admin_note <> '' then
        v_text := v_text || E'\n\nข้อความจากผู้ดูแล: ' || new.admin_note;
      end if;

      if new.status = 'scheduled' and new.appointment_state = 'proposed'
         and (v_appt_changed or old.status is distinct from 'scheduled' or old.appointment_state is distinct from 'proposed') then
        v_title := 'ผู้ดูแลเสนอวันเข้าซ่อม กรุณายืนยัน';
        v_text := v_text || E'\n\nหากไม่สะดวก กด "ขอเปลี่ยนเวลา" ในหน้าแจ้งซ่อมเพื่อเลือกวันใหม่';
      elsif new.status = 'scheduled' and (v_appt_changed or old.status is distinct from 'scheduled'
            or old.appointment_state is distinct from new.appointment_state) then
        v_title := 'นัดเข้าซ่อม ' || public.repair_appointment_text(new.appointment_date, new.appointment_period);
      elsif new.status is distinct from old.status then
        v_title := case new.status
          when 'done' then case when new.cost_payer = 'tenant' and new.cost > 0
                                then 'ซ่อมเสร็จแล้ว มีค่าซ่อมที่ต้องชำระ ' || public.fmt_baht(new.cost)
                                else 'ซ่อมเสร็จแล้ว กรุณาตรวจสอบและยืนยัน' end
          when 'cancelled' then 'เรื่องแจ้งซ่อมถูกยกเลิก'
          when 'pending' then 'ต้องนัดวันเข้าซ่อมใหม่'
          else 'สถานะแจ้งซ่อมเปลี่ยนเป็น "' || public.repair_status_label(new.status) || '"' end;
      elsif new.status = 'done' and new.cost_payer = 'tenant' and new.cost > 0
            and (new.cost is distinct from old.cost or new.cost_payer is distinct from old.cost_payer) then
        v_title := 'มีค่าซ่อมที่ต้องชำระ ' || public.fmt_baht(new.cost);
      elsif new.admin_note is distinct from old.admin_note or new.technician is distinct from old.technician then
        v_title := 'ผู้ดูแลส่งข้อความเกี่ยวกับงานซ่อม';
      end if;

      if v_title is not null then
        perform public.notify(new.user_id, 'repair', v_title, v_head, v_text, '/repairs', 'ดูรายการแจ้งซ่อม');
      end if;

    -- ===== การกระทำของผู้เช่า =====
    elsif old.appointment_state = 'proposed' and new.appointment_state = 'confirmed' then
      perform public.notify_admins(
        'repair', 'ผู้เช่ายืนยันวันนัดซ่อมแล้ว', v_head,
        'ผู้เช่าห้อง ' || new.room || ' ยืนยันนัด ' || public.repair_appointment_text(new.appointment_date, new.appointment_period)
          || E'\nรายการ: ' || new.problem,
        '/repairs', 'ไปที่ระบบแจ้งซ่อม');
    elsif old.status = 'scheduled' and new.status = 'pending' then
      perform public.notify_admins(
        'repair', 'ผู้เช่าขอเปลี่ยนวันนัดซ่อม', v_head,
        'ผู้เช่าห้อง ' || new.room || ' ไม่สะดวกวันนัด ' || public.repair_appointment_text(old.appointment_date, old.appointment_period)
          || case when new.tenant_message <> '' then E'\nเหตุผล: ' || new.tenant_message else '' end
          || E'\n\nช่วงเวลาที่สะดวกใหม่:\n'
          || coalesce(nullif(public.repair_slots_text(new.available_slots, new.allow_entry, new.availability_note), ''), '• ไม่ได้ระบุ'),
        '/repairs', 'นัดวันใหม่');
    elsif old.status = 'done' and new.status = 'pending' then
      perform public.notify_admins(
        'repair', 'ผู้เช่าแจ้งว่ายังซ่อมไม่หาย', v_head,
        'ผู้เช่าห้อง ' || new.room || ' แจ้งว่างานซ่อม "' || new.problem || '" ยังมีปัญหา'
          || E'\nรายละเอียด: ' || new.tenant_message || E'\n\nกรุณานัดวันเข้าซ่อมใหม่',
        '/repairs', 'ไปที่ระบบแจ้งซ่อม');
    elsif old.tenant_confirmed_at is null and new.tenant_confirmed_at is not null then
      perform public.notify_admins(
        'repair', 'ผู้เช่ายืนยันว่าซ่อมเรียบร้อย', v_head,
        'ผู้เช่าห้อง ' || new.room || ' ตรวจสอบแล้ว งานซ่อม "' || new.problem || '" เรียบร้อยดี',
        '/repairs', 'ไปที่ระบบแจ้งซ่อม');
    elsif new.problem is distinct from old.problem
       or new.detail is distinct from old.detail
       or new.image_path is distinct from old.image_path
       or new.available_slots is distinct from old.available_slots
       or new.allow_entry is distinct from old.allow_entry
       or new.urgency is distinct from old.urgency then
      perform public.notify_admins(
        'repair', 'ผู้เช่าแก้ไขเรื่องแจ้งซ่อม', v_head,
        'ผู้เช่าห้อง ' || new.room || ' แก้ไขรายละเอียดเรื่องแจ้งซ่อม: ' || new.problem
          || case when new.detail <> '' then E'\n\n' || new.detail else '' end
          || E'\n\nช่วงเวลาที่สะดวก:\n'
          || coalesce(nullif(public.repair_slots_text(new.available_slots, new.allow_entry, new.availability_note), ''), '• ไม่ได้ระบุ'),
        '/repairs', 'ไปที่ระบบแจ้งซ่อม');
    end if;

  elsif tg_op = 'DELETE' then
    -- ผู้เช่ายกเลิกเรื่องที่ยังรอดำเนินการ (แอดมินลบเองไม่ต้องแจ้ง)
    if not v_admin then
      perform public.notify_admins(
        'repair', 'ผู้เช่ายกเลิกการแจ้งซ่อม',
        'ห้อง ' || old.room || ' · ' || old.problem,
        'ผู้เช่าห้อง ' || old.room || ' ยกเลิกการแจ้งซ่อม: ' || old.problem,
        '/repairs', 'ไปที่ระบบแจ้งซ่อม');
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists repairs_notify on public.repairs;
create trigger repairs_notify after insert or update or delete on public.repairs
  for each row execute function public.repairs_notify();

-- เตือนนัดซ่อมของวันนี้ (ผู้เช่า + แอดมิน) เรียกวันละครั้งตอนเช้าโดย pg_cron ด้านล่าง
create or replace function public.repairs_send_reminders()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select * from public.repairs
    where status = 'scheduled' and appointment_state = 'confirmed' and appointment_date = public.today_th()
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
  -- ตาราง repair_payments มาจาก repair-payments.sql ถ้ายังไม่ได้รันให้ข้ามส่วนนี้ (ใช้ dynamic SQL กัน error ตอนยังไม่มีตาราง)
  if to_regclass('public.repair_payments') is not null then
    for r in execute
      'select r.* from public.repairs r
        where r.status = ''done'' and r.cost_payer = ''tenant'' and r.cost > 0
          and r.user_id is not null and r.completed_at is not null
          and (public.today_th() - (r.completed_at at time zone ''Asia/Bangkok'')::date) >= 3
          and (public.today_th() - (r.completed_at at time zone ''Asia/Bangkok'')::date) % 3 = 0
          and not exists (select 1 from public.repair_payments p where p.repair_id = r.id and p.status in (''review'', ''paid''))'
    loop
      perform public.notify(
        r.user_id, 'repair', 'ค่าซ่อมยังไม่ได้ชำระ ' || public.fmt_baht(r.cost),
        'ห้อง ' || r.room || ' · ' || r.problem,
        'ค่าซ่อม "' || r.problem || '" ยอด ' || public.fmt_baht(r.cost) || E' ยังไม่ได้ชำระ\nชำระและแนบสลิปได้ที่หน้าแจ้งซ่อม',
        '/repairs', 'ชำระค่าซ่อม');
    end loop;
  end if;
end;
$$;

revoke all on function public.repairs_send_reminders() from public, anon, authenticated;

-- ตั้งเวลาเรียกทุกวัน 07:00 เวลาไทย (00:00 UTC) ต้องเปิด extension pg_cron ก่อน
-- (Supabase: Database > Extensions > pg_cron) ถ้ายังไม่เปิด ส่วนนี้จะถูกข้าม ระบบส่วนอื่นยังใช้งานได้ตามปกติ
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('repair-reminders', '0 0 * * *', 'select public.repairs_send_reminders()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ใบแจ้งหนี้
-- ---------------------------------------------------------------------------

create or replace function public.invoices_notify()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.notify(
      new.user_id, 'invoice', 'ใบแจ้งหนี้ใหม่ เดือน ' || public.thai_month(new.month),
      'ยอดที่ต้องชำระ ' || public.fmt_baht(new.total),
      'ห้อง ' || new.room || ' มีใบแจ้งหนี้เดือน ' || public.thai_month(new.month)
        || ' ยอดรวม ' || public.fmt_baht(new.total) || E'\nกรุณาชำระเงินและแนบสลิปในระบบ',
      '/invoices', 'ไปที่ใบแจ้งหนี้');

  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'review' then
      -- ผู้เช่าแนบสลิปแล้ว (ผ่านฟังก์ชัน submit_slip)
      perform public.notify_admins(
        'invoice', 'มีสลิปรอตรวจสอบ',
        'ห้อง ' || new.room || ' · ' || public.thai_month(new.month),
        'ผู้เช่า ' || new.tenant_name || ' ห้อง ' || new.room || ' แนบสลิปชำระเงินเดือน '
          || public.thai_month(new.month) || ' ยอด ' || public.fmt_baht(new.total) || ' รอตรวจสอบ',
        '/invoices', 'ไปที่ใบแจ้งหนี้');
    elsif new.status = 'paid' then
      -- ชำระครบ (ถ้าโอนเกิน refund_amount > 0 บอกผู้เช่าว่าหอพักจะโอนยอดเกินคืน ดู supabase/payments.sql)
      perform public.notify(
        new.user_id, 'invoice', 'ชำระเงินเรียบร้อย',
        'ใบแจ้งหนี้เดือน ' || public.thai_month(new.month) || ' · ' || public.fmt_baht(new.total),
        'ผู้ดูแลตรวจสอบสลิปและยืนยันการชำระเงินใบแจ้งหนี้เดือน ' || public.thai_month(new.month) || ' แล้ว'
          || case when new.refund_amount > 0
               then E'\nยอดที่โอนเกินมา ' || public.fmt_baht(new.refund_amount) || ' หอพักจะโอนคืนให้'
               else '' end,
        '/invoices', 'ดูใบแจ้งหนี้');
    elsif new.status = 'pending' and old.status = 'review' and new.paid_amount > old.paid_amount then
      -- ผู้ดูแลยืนยันสลิปแต่ยอดยังไม่ครบ: เก็บยอดที่ได้รับไว้ ผู้เช่าโอนส่วนที่เหลือเพิ่ม (ไม่ใช่การปฏิเสธสลิป)
      perform public.notify(
        new.user_id, 'invoice', 'ได้รับยอดชำระบางส่วน',
        'ใบแจ้งหนี้เดือน ' || public.thai_month(new.month) || ' · คงเหลือ ' || public.fmt_baht(new.total - new.paid_amount),
        'ได้รับยอดชำระ ' || public.fmt_baht(new.paid_amount - old.paid_amount) || ' แล้ว ยังเหลือยอดที่ต้องชำระอีก '
          || public.fmt_baht(new.total - new.paid_amount) || E'\nกรุณาโอนส่วนที่เหลือและแนบสลิปเพิ่ม',
        '/invoices', 'ชำระส่วนที่เหลือ');
    elsif new.status = 'pending' and old.status = 'review' then
      perform public.notify(
        new.user_id, 'invoice', 'สลิปไม่ผ่านการตรวจสอบ',
        'ใบแจ้งหนี้เดือน ' || public.thai_month(new.month),
        'ผู้ดูแลไม่รับสลิปที่แนบไว้'
          || case when coalesce(new.reject_reason, '') <> '' then E'\nเหตุผล: ' || new.reject_reason else '' end
          || E'\nกรุณาแนบสลิปใหม่อีกครั้ง',
        '/invoices', 'แนบสลิปใหม่');
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists invoices_notify on public.invoices;
create trigger invoices_notify after insert or update of status on public.invoices
  for each row execute function public.invoices_notify();

-- ============================================================
-- performance
-- ============================================================

-- เปิด Realtime ให้ตารางที่หน้าเว็บใช้ และเพิ่มดัชนีที่ช่วยให้โหลดเร็วขึ้น: รันใน Supabase SQL Editor (รันซ้ำได้)
-- ตารางไหนยังไม่มี (เช่น ยังไม่ได้รัน repair-payments.sql) ข้ามเอง ไม่ error ถ้าเพิ่มตารางทีหลังให้รันไฟล์นี้ซ้ำ
--
-- 1) Realtime: เมื่อมีคนเพิ่ม/แก้/ลบแถวในตารางเหล่านี้ หน้าเว็บที่เปิดอยู่จะโหลดข้อมูลใหม่เอง (src/lib/realtime.js)
--    Supabase ส่งเหตุการณ์เฉพาะให้ผู้ที่มีสิทธิ์อ่านแถวนั้นตาม RLS (ผู้เช่าได้เหตุการณ์ของตัวเอง แอดมินได้ทั้งหมด) และหน้าเว็บโหลดข้อมูลซ้ำผ่าน RLS
--    ทุกครั้ง ไม่ใช้ข้อมูลในเหตุการณ์โดยตรง ข้อควรรู้: เหตุการณ์ "ลบ" ส่งเฉพาะรหัสแถว (uuid) ไปยังผู้ฟังตารางนั้น ไม่มีเนื้อหาของแถว
--    (แจ้งเตือนกับแชทเปิดไว้แล้วในไฟล์ของตัวเอง notifications.sql / chat.sql)
-- 2) ดัชนี: ช่วยการอ่านที่เกิดบ่อย (ผู้เช่าเปิดหน้าใบแจ้งหนี้/แจ้งซ่อม ฯลฯ ที่กรองด้วย user_id และนโยบาย RLS ที่เทียบ user_id = ผู้ใช้)

do $$
declare
  t text;
begin
  foreach t in array array[
    'invoices', 'invoice_payments', 'repairs', 'repair_payments', 'rooms', 'tenants', 'app_settings', 'move_outs', 'audit_log'
  ] loop
    if to_regclass('public.' || t) is not null
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.invoices') is not null then
    -- ผู้เช่าอ่านใบแจ้งหนี้ของตัวเอง (user_id) เรียงตามเดือน
    create index if not exists invoices_user_month_idx on public.invoices (user_id, month desc);
    -- กรอง/รวมตามเดือน (แดชบอร์ด รายงาน)
    create index if not exists invoices_month_idx on public.invoices (month);
    -- ใบที่ยังไม่ชำระครบ (ยอดค้าง เตือนเกินกำหนด) มีน้อยกว่าใบทั้งหมดมาก ดัชนีเฉพาะส่วนจึงเล็กและเร็ว
    create index if not exists invoices_open_idx on public.invoices (room, month) where status <> 'paid';
  end if;
  if to_regclass('public.invoice_payments') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoice_payments' and column_name = 'user_id') then
    create index if not exists invoice_payments_user_idx on public.invoice_payments (user_id);
  end if;
  if to_regclass('public.repair_payments') is not null then
    create index if not exists repair_payments_user_idx on public.repair_payments (user_id);
  end if;
  if to_regclass('public.tenants') is not null then
    -- หาข้อมูลผู้เช่าจากบัญชีล็อกอิน (ทุกหน้าของผู้เช่า และนโยบาย RLS หลายตาราง)
    create index if not exists tenants_user_idx on public.tenants (user_id);
  end if;
end $$;

-- ============================================================
-- slip-quota
-- ============================================================
-- ตัวนับโควตาตรวจสลิป EasySlip (ตาราง slip_verify_log, app_settings.slip_quota และฟังก์ชันจองสิทธิ์ตรวจที่บันทึกการจอง)

create table if not exists public.slip_verify_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('invoice', 'repair'))
);

create index if not exists slip_verify_log_at_idx on public.slip_verify_log (at);

alter table public.slip_verify_log enable row level security;
drop policy if exists "slip verify log admin read" on public.slip_verify_log;
create policy "slip verify log admin read" on public.slip_verify_log for select to authenticated
  using (public.is_admin());
revoke insert, update, delete on table public.slip_verify_log from anon, authenticated;

-- โควตาต่อเดือนที่หอพักซื้อไว้ (ว่าง = ไม่ตั้ง ไม่แสดงคำเตือน)
alter table public.app_settings add column if not exists slip_quota int;
alter table public.app_settings drop constraint if exists app_settings_slip_quota_check;
alter table public.app_settings add constraint app_settings_slip_quota_check check (slip_quota is null or slip_quota >= 0);

-- จองสิทธิ์ตรวจ (เหมือนเดิมทุกอย่าง เพิ่มแค่บันทึกลง slip_verify_log เมื่อจองสำเร็จ)
create or replace function public.claim_slip_verify(p_invoice uuid)
returns table (id uuid, user_id uuid, slip_path text, total numeric, paid_amount numeric, created_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
begin
  return query
  update public.invoices i
     set verify_status = 'checking', verify_attempts = i.verify_attempts + 1
   where i.id = p_invoice
     and i.status = 'review'
     and i.slip_path is not null
     and (i.verify_status is null or i.verify_status = 'error')
     and i.verify_attempts < 3
  returning i.id, i.user_id, i.slip_path, i.total, i.paid_amount, i.created_at;
  if found then
    insert into public.slip_verify_log (kind) values ('invoice');
  end if;
end;
$$;

-- created_at = เวลาที่ซ่อมเสร็จ (ถ้ามี) ใช้เทียบวันที่โอนในสลิปว่าไม่เก่ากว่าเวลาที่รู้ยอดค่าซ่อม
create or replace function public.claim_repair_slip_verify(p_payment uuid)
returns table (id uuid, user_id uuid, slip_path text, total numeric, paid_amount numeric, created_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
begin
  return query
  with c as (
    update public.repair_payments p
       set verify_status = 'checking', verify_attempts = p.verify_attempts + 1
     where p.id = p_payment
       and p.status = 'review'
       and (p.verify_status is null or p.verify_status = 'error')
       and p.verify_attempts < 3
     returning p.id, p.user_id, p.slip_path, p.amount, p.repair_id
  )
  select c.id, c.user_id, c.slip_path, c.amount, 0::numeric, coalesce(r.completed_at, r.created_at)
  from c join public.repairs r on r.id = c.repair_id;
  if found then
    insert into public.slip_verify_log (kind) values ('repair');
  end if;
end;
$$;

-- ============================================================
-- hardening
-- ============================================================
-- ปิดฟังก์ชันที่คนนอกเรียกได้ ตั้ง search_path ให้ฟังก์ชันช่วย และระบบบังคับเปลี่ยนรหัสผ่านครั้งแรก

-- ============================================================
-- 1) ฟังก์ชัน trigger ไม่ให้ใครเรียกผ่าน API (/rest/v1/rpc/...)
--    trigger ยังทำงานตามปกติ เพราะ Postgres ตรวจสิทธิ์ EXECUTE ตอนสร้าง trigger เท่านั้น ไม่ตรวจตอนยิง
-- ============================================================

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- ============================================================
-- 2) ฟังก์ชันที่ต้อง login ก่อนใช้ ปิดไม่ให้คนที่ยังไม่ login เรียก
-- ============================================================

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

revoke execute on function public.submit_slip(uuid, text) from public, anon;
grant execute on function public.submit_slip(uuid, text) to authenticated, service_role;

-- ============================================================
-- 3) ตั้ง search_path ให้ฟังก์ชันช่วย กันถูกสวมด้วย schema อื่น
-- ============================================================

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'repair_valid_period', 'today_th', 'repair_valid_slots', 'invoices_lock_total', 'thai_month', 'fmt_baht',
         'repair_status_label', 'repair_period_label', 'thai_date', 'repair_appointment_text', 'repair_slots_text',
         'invoices_reset_verify', 'invoice_late_fee', 'audit_log_immutable', 'asof_date', 'audit_status_label'
       )
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;

-- ============================================================
-- 4) บังคับเปลี่ยนรหัสผ่านครั้งแรก
--    บัญชีที่แอดมินสร้างหรือรีเซ็ตรหัสให้จะถูกตั้ง must_change_password = true (โดย Edge Function)
--    เว็บพาไปหน้าบัญชีจนกว่าจะตั้งรหัสใหม่ แล้วเรียก clear_must_change_password()
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'must_change_password'
  ) then
    alter table public.profiles add column must_change_password boolean not null default false;
    -- ผู้เช่าที่มีอยู่แล้วใช้รหัสเริ่มต้นที่เดาได้ (TP+เลขห้อง+เบอร์ 4 ตัวท้าย) ให้เปลี่ยนตอนเข้าครั้งถัดไป (ทำครั้งเดียวตอนเพิ่มคอลัมน์)
    update public.profiles set must_change_password = true where role = 'user';
  end if;
end $$;

-- ผู้ใช้ล้างเครื่องหมายของตัวเองได้เท่านั้น (ไม่มี policy ให้แก้ profiles ตรง ๆ)
create or replace function public.clear_must_change_password()
returns void
language sql
security definer set search_path = public
as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

revoke execute on function public.clear_must_change_password() from public, anon;
grant execute on function public.clear_must_change_password() to authenticated, service_role;

-- ============================================================
-- rls-performance
-- ============================================================
-- ห่อ auth.uid() ใน policy ทุกตัวให้คำนวณครั้งเดียวต่อคำสั่ง และเพิ่มดัชนี FK

-- ============================================================
-- 1) policy ที่เรียก auth.uid() ตรง ๆ จะถูกคำนวณซ้ำทุกแถว ห่อด้วย (select ...) ให้คำนวณครั้งเดียวต่อคำสั่ง
--    แก้ทุก policy ในโครงสร้าง public ที่ยังไม่ได้ห่อ (ไม่แตะบทบาทหรือคำสั่งของ policy)
-- ============================================================

do $$
declare
  p record;
  new_qual text;
  new_check text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ 'auth\.uid\(\)' or coalesce(with_check, '') ~ 'auth\.uid\(\)')
  loop
    -- ข้ามอันที่ห่อแล้ว (ตรวจจาก "select auth.uid()" ที่ Postgres แสดงเป็น ( SELECT auth.uid() AS uid))
    new_qual := case when p.qual is null or p.qual ~* 'select\s+auth\.uid\(\)' then p.qual
                     else replace(p.qual, 'auth.uid()', '(select auth.uid())') end;
    new_check := case when p.with_check is null or p.with_check ~* 'select\s+auth\.uid\(\)' then p.with_check
                      else replace(p.with_check, 'auth.uid()', '(select auth.uid())') end;
    if new_qual is distinct from p.qual or new_check is distinct from p.with_check then
      execute format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename)
        || case when new_qual is not null then format(' using (%s)', new_qual) else '' end
        || case when new_check is not null then format(' with check (%s)', new_check) else '' end;
    end if;
  end loop;
end $$;

-- ============================================================
-- 2) ดัชนีให้ foreign key ที่ยังไม่มี (ลบ/แก้แถวต้นทางจะไม่ต้องสแกนทั้งตาราง)
-- ============================================================

create index if not exists chat_messages_sender_idx on public.chat_messages (sender_id);
create index if not exists invoice_payments_confirmed_by_idx on public.invoice_payments (confirmed_by);
create index if not exists move_outs_created_by_idx on public.move_outs (created_by);
create index if not exists repair_payments_reviewed_by_idx on public.repair_payments (reviewed_by);
