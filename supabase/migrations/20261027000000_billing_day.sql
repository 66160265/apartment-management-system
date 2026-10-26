-- วันออกบิล + แจ้งเตือนผู้ดูแลให้ออกใบแจ้งหนี้ (รันหลัง 20261026000000_repair_late_fee.sql รันซ้ำได้ ข้อมูลเดิมไม่หาย)
-- วิธีใช้: วางทั้งไฟล์ใน Supabase SQL Editor แล้วกด Run (หรือ `npx supabase db push`) แล้วรัน `notify pgrst, 'reload schema';`
--
--   - ตั้ง "วันออกบิล" (วันที่ 1 - 28 ของเดือน) ได้ในหน้าตั้งค่า ค่าเริ่มต้น = วันที่ 1
--   - ถึงวันออกบิลของเดือน ถ้ายังมีห้องที่มีผู้เช่าแต่ยังไม่ออกบิลของเดือนที่แล้ว (บิลเดือนไหนออกในเดือนถัดไป) ระบบส่งแจ้งเตือน
--     ให้ผู้ดูแลทุกคน (เจ้าของและพนักงาน) เดือนละครั้ง บอกจำนวนและเลขห้องที่ยังไม่ได้ออก
--   - ส่งได้ 2 ทาง: งานประจำวัน pg_cron (ถ้าเปิด extension) หรือตอนผู้ดูแลเปิดเว็บ (หน้าเว็บเรียก billing_day_reminder)
--     ทางไหนมาก่อนส่ง อีกทางไม่ส่งซ้ำ ถ้าวันนั้นไม่มีใครเปิดเว็บและไม่ได้เปิด pg_cron จะส่งตอนผู้ดูแลเปิดเว็บครั้งถัดไป (หลังวันออกบิล)

-- ============================================================
-- 1) วันออกบิลในหน้าตั้งค่า
-- ============================================================

alter table public.app_settings add column if not exists billing_day int not null default 1;

alter table public.app_settings drop constraint if exists app_settings_billing_day_check;
alter table public.app_settings add constraint app_settings_billing_day_check check (billing_day between 1 and 28);

-- ============================================================
-- 2) บันทึกว่าเตือนบิลเดือนไหนไปแล้ว (กันเตือนซ้ำ) ใช้ผ่านฟังก์ชันเท่านั้น
-- ============================================================

create table if not exists public.billing_reminders (
  bill_month text primary key check (bill_month ~ '^[0-9]{4}-[0-9]{2}$'),
  sent_at timestamptz not null default now(),
  missing_count int not null default 0
);

alter table public.billing_reminders enable row level security;
revoke all on table public.billing_reminders from anon, authenticated;

-- ============================================================
-- 3) ส่งแจ้งเตือน (ภายใน ไม่ให้ใครเรียกผ่าน API ตรง ๆ)
--    คืน true เมื่อส่งแจ้งเตือนในครั้งนี้
-- ============================================================

create or replace function public.billing_reminder_send()
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  s public.app_settings;
  today date := public.today_th();
  v_month text := to_char(date_trunc('month', public.today_th()) - interval '1 month', 'YYYY-MM');
  month_end date := date_trunc('month', public.today_th())::date - 1;
  n int;
  names text;
  claimed text;
begin
  select * into s from public.app_settings where id = 1;
  if not found then
    return false;
  end if;
  -- ยังไม่ถึงวันออกบิลของเดือนนี้
  if extract(day from today) < s.billing_day then
    return false;
  end if;

  -- ห้องที่มีผู้เช่า แต่ยังไม่มีใบแจ้งหนี้ของเดือนที่แล้ว (ผู้เช่าที่เริ่มสัญญาหลังเดือนนั้นไม่นับ เหมือนการ์ด "ต้องจัดการตอนนี้")
  select count(*), string_agg(r.number, ', ' order by r.number)
    into n, names
    from public.rooms r
   where r.status = 'occupied'
     and not exists (select 1 from public.invoices i where i.room = r.number and i.month = v_month)
     and not exists (select 1 from public.tenants t where t.room = r.number and t.start_date > month_end);
  if n = 0 then
    return false;
  end if;

  -- จองสิทธิ์ส่งของเดือนนี้ (ถ้ามีคนส่งไปแล้ว หรือกำลังส่งพร้อมกัน จะไม่ส่งซ้ำ)
  insert into public.billing_reminders (bill_month, missing_count) values (v_month, n)
  on conflict (bill_month) do nothing
  returning billing_reminders.bill_month into claimed;
  if claimed is null then
    return false;
  end if;

  -- ส่งถึงผู้ดูแลทุกคน (ไม่ใช้ notify_admins เพราะฟังก์ชันนั้นข้ามคนที่กำลังเรียกอยู่ คนที่เปิดเว็บแล้วทำให้เตือนจะไม่ได้รับ)
  insert into public.notifications (recipient_id, type, title, subtitle, details, action_link, action_label)
  select p.id, 'invoice',
         'ถึงวันออกบิลแล้ว: บิลเดือน ' || public.thai_month(v_month),
         'ยังไม่ได้ออกบิล ' || n || ' ห้อง',
         'ถึงวันออกบิลประจำเดือนแล้ว (ตั้งไว้วันที่ ' || s.billing_day || ' ของเดือน)'
           || E'\nบิลเดือน ' || public.thai_month(v_month) || ' ยังไม่ได้ออก ' || n || ' ห้อง: '
           || case when n > 15 then (select string_agg(x, ', ') from (select unnest(string_to_array(names, ', ')) as x limit 15) q) || ' และอีก ' || (n - 15) || ' ห้อง' else names end
           || E'\nออกใบแจ้งหนี้ได้ที่หน้าใบแจ้งหนี้ > สร้างใบแจ้งหนี้ (กรอกเลขมิเตอร์ของแต่ละห้อง)',
         '/invoices', 'ไปออกใบแจ้งหนี้'
    from public.profiles p
   where p.role = 'admin';
  return true;
end;
$$;

revoke all on function public.billing_reminder_send() from public, anon, authenticated;

-- ============================================================
-- 4) ให้หน้าเว็บของผู้ดูแลเรียกตรวจ (เฉพาะแอดมิน) ใช้เมื่อไม่ได้เปิด pg_cron หรือวันนั้นไม่มีใครเปิดเว็บ
-- ============================================================

create or replace function public.billing_day_reminder()
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  return public.billing_reminder_send();
end;
$$;

revoke all on function public.billing_day_reminder() from public, anon;
grant execute on function public.billing_day_reminder() to authenticated;

-- ============================================================
-- 5) งานประจำวัน 07:15 เวลาไทย (00:15 UTC) ถ้าเปิด pg_cron (Database > Extensions > pg_cron) ถ้าไม่เปิด ใช้ทางหน้าเว็บแทน
-- ============================================================

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('billing-day-reminder', '15 0 * * *', 'select public.billing_reminder_send()');
  end if;
end $$;
