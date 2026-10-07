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
