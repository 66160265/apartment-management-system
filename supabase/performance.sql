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
