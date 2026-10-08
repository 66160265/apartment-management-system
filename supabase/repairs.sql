-- ระบบแจ้งซ่อม: รันใน Supabase SQL Editor หลังรัน schema.sql (ต้องมีฟังก์ชัน is_admin())
-- รันซ้ำได้ ไม่ทำให้ข้อมูลเดิมหาย

create table if not exists public.repairs (
  id uuid primary key default gen_random_uuid(),
  room text not null references public.rooms (number) on update cascade,
  user_id uuid references auth.users (id) on delete set null,
  tenant_name text not null default '',
  problem text not null check (char_length(btrim(problem)) between 1 and 200),
  detail text not null default '' check (char_length(detail) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  image_path text,
  admin_note text not null default '' check (char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

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
  if not public.is_admin() then
    new.room := old.room;
    new.user_id := old.user_id;
    new.tenant_name := old.tenant_name;
    new.status := old.status;
    new.admin_note := old.admin_note;
    new.completed_at := old.completed_at;
    new.created_at := old.created_at;
  elsif new.status is distinct from old.status then
    new.completed_at := case when new.status = 'done' then now() else null end;
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
