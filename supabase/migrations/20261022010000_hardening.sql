-- เพิ่มความปลอดภัย (ตามคำเตือน Security Advisor ของ Supabase) และบังคับเปลี่ยนรหัสผ่านครั้งแรก
-- รันซ้ำได้ ข้อมูลเดิมไม่หาย

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
