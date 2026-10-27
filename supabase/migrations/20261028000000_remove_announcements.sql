-- เอาระบบประกาศออก: ลบตาราง announcements พร้อม trigger และฟังก์ชันที่เกี่ยวข้อง (รันหลัง 20261027000001_room_details.sql รันซ้ำได้)
-- วิธีใช้: วางทั้งไฟล์ใน Supabase SQL Editor แล้วกด Run (หรือ `npx supabase db push`)
--
-- คำเตือน: ประกาศที่เคยลงไว้จะหายถาวร (ลบตาราง) ส่วนแจ้งเตือนที่เคยส่งให้ผู้เช่าจากประกาศยังอยู่ แต่ลิงก์ /announcements ของมันเปิดไม่ได้แล้ว
-- และประวัติการแก้ไข (audit_log) ที่เคยบันทึกเรื่องประกาศไว้ยังอยู่ตามเดิม

-- ตารางที่ drop ตรงนี้ลบ trigger และ policy ของตารางให้เอง ส่วนฟังก์ชันต้องลบแยก
drop table if exists public.announcements;

drop function if exists public.announcements_before_write();
drop function if exists public.announcements_notify();
drop function if exists public.audit_announcements();

-- แจ้งเตือนเก่าที่ชี้ไปหน้าประกาศ: ล้างลิงก์ที่ใช้ไม่ได้แล้ว (เก็บข้อความไว้)
update public.notifications set action_link = null, action_label = null where action_link = '/announcements';
