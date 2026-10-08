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
