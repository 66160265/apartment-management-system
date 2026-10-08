-- ระบบแจ้งเตือนภายในเว็บ/แอป: รันใน Supabase SQL Editor หลังรัน schema.sql, invoices.sql และ repairs.sql
-- (ต้องมีตาราง profiles, invoices, repairs และฟังก์ชัน is_admin()) รันซ้ำได้ ไม่ทำให้ข้อมูลเดิมหาย
--
-- แนวคิด: แจ้งเตือน 1 แถวต่อ 1 ผู้รับ (สถานะอ่านแล้วแยกกันรายคน) สร้างโดย trigger ในฐานข้อมูลเท่านั้น
-- ฝั่งเว็บอ่าน/ทำเครื่องหมายอ่านแล้ว/ลบของตัวเองได้ แต่สร้างหรือแก้ข้อความเองไม่ได้

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'system' check (type in ('repair', 'invoice', 'system')),
  title text not null,
  subtitle text not null default '',
  details text not null default '',
  action_link text,
  action_label text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ฐานข้อมูลเดิมที่เคยมีคอลัมน์สี: ลบทิ้ง (แจ้งเตือนทุกรายการแสดงเป็นสีแดงที่ฝั่งเว็บ ไม่ต้องเก็บสี)
alter table public.notifications drop column if exists color;

create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications read own" on public.notifications;
create policy "notifications read own" on public.notifications for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own" on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists "notifications delete own" on public.notifications;
create policy "notifications delete own" on public.notifications for delete to authenticated
  using (recipient_id = auth.uid());

-- ฝั่งเว็บแก้ได้เฉพาะคอลัมน์ read_at (ทำเครื่องหมายอ่านแล้ว) และไม่มีสิทธิ์เพิ่มแถวเอง
revoke insert, update on table public.notifications from anon, authenticated;
grant update (read_at) on table public.notifications to authenticated;

-- ให้เว็บรับแจ้งเตือนใหม่แบบเรียลไทม์ (DELETE ต้องใช้ replica identity full ถึงจะกรองตามผู้รับได้)
alter table public.notifications replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ฟังก์ชันช่วยสร้างแจ้งเตือน (ห้ามให้ผู้ใช้เรียกเอง ไม่งั้นจะส่งแจ้งเตือนปลอมหาคนอื่นได้)
-- ---------------------------------------------------------------------------

-- ลบฟังก์ชันเวอร์ชันเก่าที่มีพารามิเตอร์สี (ลายเซ็นเปลี่ยน)
drop function if exists public.notify(uuid, text, text, text, text, text, text, text);
drop function if exists public.notify_admins(text, text, text, text, text, text, text);

create or replace function public.notify(
  p_recipient uuid, p_type text, p_title text,
  p_subtitle text, p_details text, p_link text, p_label text
)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.notifications (recipient_id, type, title, subtitle, details, action_link, action_label)
  select p_recipient, p_type, p_title, p_subtitle, p_details, p_link, p_label
  where p_recipient is not null;
$$;

-- ส่งถึงแอดมินทุกคน (ยกเว้นคนที่เป็นผู้กระทำเอง)
create or replace function public.notify_admins(
  p_type text, p_title text,
  p_subtitle text, p_details text, p_link text, p_label text
)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.notifications (recipient_id, type, title, subtitle, details, action_link, action_label)
  select p.id, p_type, p_title, p_subtitle, p_details, p_link, p_label
  from public.profiles p
  where p.role = 'admin' and p.id is distinct from auth.uid();
$$;

revoke all on function public.notify(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_admins(text, text, text, text, text, text) from public, anon, authenticated;

-- 2026-10 -> ต.ค. 69
create or replace function public.thai_month(m text)
returns text
language sql
immutable
as $$
  select (array['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'])[substr(m, 6, 2)::int]
         || ' ' || lpad(((substr(m, 1, 4)::int + 543) % 100)::text, 2, '0');
$$;

-- 1234.5 -> ฿1,234.5
create or replace function public.fmt_baht(n numeric)
returns text
language sql
immutable
as $$
  select '฿' || rtrim(to_char(n, 'FM999,999,999,990.99'), '.');
$$;

create or replace function public.repair_status_label(s text)
returns text
language sql
immutable
as $$
  select case s when 'pending' then 'รอดำเนินการ' when 'in_progress' then 'กำลังดำเนินการ' else 'เสร็จสิ้น' end;
$$;

-- ---------------------------------------------------------------------------
-- แจ้งซ่อม
-- ---------------------------------------------------------------------------

create or replace function public.repairs_notify()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_admin boolean;
  v_text text;
begin
  -- แก้ข้อมูลจาก SQL Editor / service role (ไม่มีผู้ใช้) ไม่ต้องแจ้งเตือน
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  v_admin := public.is_admin();

  if tg_op = 'INSERT' then
    if v_admin then
      perform public.notify(
        new.user_id, 'repair', 'ผู้ดูแลบันทึกเรื่องแจ้งซ่อมให้คุณ',
        'ห้อง ' || new.room || ' · ' || new.problem,
        'รายการ: ' || new.problem || case when new.detail <> '' then E'\n' || new.detail else '' end,
        '/repairs', 'ดูรายการแจ้งซ่อม');
    else
      perform public.notify_admins(
        'repair', 'แจ้งซ่อมใหม่',
        'ห้อง ' || new.room || ' · ' || new.problem,
        'ผู้เช่า' || case when new.tenant_name <> '' then ' ' || new.tenant_name else '' end
          || ' ห้อง ' || new.room || ' แจ้งซ่อม: ' || new.problem
          || case when new.detail <> '' then E'\n\n' || new.detail else '' end,
        '/repairs', 'ไปที่ระบบแจ้งซ่อม');
    end if;

  elsif tg_op = 'UPDATE' then
    if v_admin then
      if new.status is distinct from old.status or new.admin_note is distinct from old.admin_note then
        v_text := 'รายการ: ' || new.problem || E'\nสถานะ: ' || public.repair_status_label(new.status);
        if new.admin_note <> '' then
          v_text := v_text || E'\n\nข้อความจากผู้ดูแล: ' || new.admin_note;
        end if;
        perform public.notify(
          new.user_id, 'repair',
          case when new.status is distinct from old.status
               then 'สถานะแจ้งซ่อมเปลี่ยนเป็น "' || public.repair_status_label(new.status) || '"'
               else 'ผู้ดูแลส่งข้อความเกี่ยวกับงานซ่อม' end,
          'ห้อง ' || new.room || ' · ' || new.problem,
          v_text, '/repairs', 'ดูรายการแจ้งซ่อม');
      end if;
    elsif new.problem is distinct from old.problem
       or new.detail is distinct from old.detail
       or new.image_path is distinct from old.image_path then
      perform public.notify_admins(
        'repair', 'ผู้เช่าแก้ไขเรื่องแจ้งซ่อม',
        'ห้อง ' || new.room || ' · ' || new.problem,
        'ผู้เช่าห้อง ' || new.room || ' แก้ไขรายละเอียดเรื่องแจ้งซ่อม: ' || new.problem
          || case when new.detail <> '' then E'\n\n' || new.detail else '' end,
        '/repairs', 'ไปที่ระบบแจ้งซ่อม');
    end if;

  elsif tg_op = 'DELETE' then
    -- ผู้เช่ายกเลิกเรื่องที่ยังรอดำเนินการ (แอดมินลบเองไม่ต้องแจ้ง)
    if not v_admin then
      perform public.notify_admins(
        'repair', 'ผู้เช่ายกเลิกการแจ้งซ่อม',
        'ห้อง ' || old.room || ' · ' || old.problem,
        'ผู้เช่าห้อง ' || old.room || ' ยกเลิกการแจ้งซ่อม: ' || old.problem,
        '/repairs', 'ไปที่ระบบแจ้งซ่อม');
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists repairs_notify on public.repairs;
create trigger repairs_notify after insert or update or delete on public.repairs
  for each row execute function public.repairs_notify();

-- ---------------------------------------------------------------------------
-- ใบแจ้งหนี้
-- ---------------------------------------------------------------------------

create or replace function public.invoices_notify()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.notify(
      new.user_id, 'invoice', 'ใบแจ้งหนี้ใหม่ เดือน ' || public.thai_month(new.month),
      'ยอดที่ต้องชำระ ' || public.fmt_baht(new.total),
      'ห้อง ' || new.room || ' มีใบแจ้งหนี้เดือน ' || public.thai_month(new.month)
        || ' ยอดรวม ' || public.fmt_baht(new.total) || E'\nกรุณาชำระเงินและแนบสลิปในระบบ',
      '/invoices', 'ไปที่ใบแจ้งหนี้');

  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'review' then
      -- ผู้เช่าแนบสลิปแล้ว (ผ่านฟังก์ชัน submit_slip)
      perform public.notify_admins(
        'invoice', 'มีสลิปรอตรวจสอบ',
        'ห้อง ' || new.room || ' · ' || public.thai_month(new.month),
        'ผู้เช่า ' || new.tenant_name || ' ห้อง ' || new.room || ' แนบสลิปชำระเงินเดือน '
          || public.thai_month(new.month) || ' ยอด ' || public.fmt_baht(new.total) || ' รอตรวจสอบ',
        '/invoices', 'ไปที่ใบแจ้งหนี้');
    elsif new.status = 'paid' then
      perform public.notify(
        new.user_id, 'invoice', 'ชำระเงินเรียบร้อย',
        'ใบแจ้งหนี้เดือน ' || public.thai_month(new.month) || ' · ' || public.fmt_baht(new.total),
        'ผู้ดูแลตรวจสอบสลิปและยืนยันการชำระเงินใบแจ้งหนี้เดือน ' || public.thai_month(new.month) || ' แล้ว',
        '/invoices', 'ดูใบแจ้งหนี้');
    elsif new.status = 'pending' and old.status = 'review' then
      perform public.notify(
        new.user_id, 'invoice', 'สลิปไม่ผ่านการตรวจสอบ',
        'ใบแจ้งหนี้เดือน ' || public.thai_month(new.month),
        'ผู้ดูแลไม่รับสลิปที่แนบไว้'
          || case when coalesce(new.reject_reason, '') <> '' then E'\nเหตุผล: ' || new.reject_reason else '' end
          || E'\nกรุณาแนบสลิปใหม่อีกครั้ง',
        '/invoices', 'แนบสลิปใหม่');
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists invoices_notify on public.invoices;
create trigger invoices_notify after insert or update of status on public.invoices
  for each row execute function public.invoices_notify();
