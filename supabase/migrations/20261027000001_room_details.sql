-- รายละเอียดห้องพักรายห้อง: ห้องแอร์/ห้องพัดลม และมีเครื่องทำน้ำอุ่นหรือไม่ (รันหลัง 20261026000000_repair_late_fee.sql รันซ้ำได้ ข้อมูลเดิมไม่หาย)
-- วิธีใช้: วางทั้งไฟล์ใน Supabase SQL Editor แล้วกด Run (หรือ `npx supabase db push`) แล้วรัน `notify pgrst, 'reload schema';`
--
-- ห้องที่มีอยู่แล้วจะได้ค่าเริ่มต้น "ห้องพัดลม" และ "ไม่มีเครื่องทำน้ำอุ่น" แอดมินเข้าไปแก้รายห้องได้ที่หน้า "ห้องพัก"
-- ไม่ต้องแก้ policy: สิทธิ์อ่าน/เขียนตาราง rooms ที่มีอยู่ครอบคลุมคอลัมน์ใหม่แล้ว

alter table public.rooms add column if not exists cooling text not null default 'fan';
alter table public.rooms add column if not exists water_heater boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_cooling_check') then
    alter table public.rooms add constraint rooms_cooling_check check (cooling in ('fan', 'air'));
  end if;
end $$;
