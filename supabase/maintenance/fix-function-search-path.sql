-- ตั้ง search_path ให้ฟังก์ชันช่วยที่ยังไม่มี (ตรวจพบบนฐานข้อมูลจริง 23 ต.ค. 2026: 12 ฟังก์ชัน ส่วนใหญ่ถูกสร้างใหม่โดย SQL ของเพื่อนร่วมทีม)
-- ทำให้ตัวแจ้งเตือนความปลอดภัยของ Supabase (function_search_path_mutable) หายไป รันซ้ำได้ ไม่แตะข้อมูลและไม่เปลี่ยนการทำงานของฟังก์ชัน

alter function public.fmt_baht(numeric) set search_path = public;
alter function public.repair_appointment_text(date, text) set search_path = public;
alter function public.repair_period_label(text) set search_path = public;
alter function public.repair_period_range(text) set search_path = public;
alter function public.repair_periods_overlap(text, text) set search_path = public;
alter function public.repair_slots_text(jsonb, boolean, text) set search_path = public;
alter function public.repair_status_label(text) set search_path = public;
alter function public.repair_valid_period(text) set search_path = public;
alter function public.repair_valid_slots(jsonb) set search_path = public;
alter function public.thai_date(date) set search_path = public;
alter function public.thai_month(text) set search_path = public;
alter function public.today_th() set search_path = public;
