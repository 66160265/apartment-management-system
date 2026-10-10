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
