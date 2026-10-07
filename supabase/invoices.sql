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
