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
  select case s
    when 'pending' then 'รอนัดหมาย'
    when 'scheduled' then 'นัดหมายแล้ว'
    when 'in_progress' then 'กำลังซ่อม'
    when 'done' then 'เสร็จสิ้น'
    when 'cancelled' then 'ยกเลิก'
    else s end;
$$;

-- 13:00-15:30 -> 13:00-15:30 น. (ค่าแบบเดิม morning -> 09:00-12:00 น.)
create or replace function public.repair_period_label(p text)
returns text
language sql
immutable
as $$
  select case p
    when 'morning' then '09:00-12:00 น.'
    when 'afternoon' then '13:00-17:00 น.'
    when 'evening' then '17:00-20:00 น.'
    else coalesce(p || ' น.', '') end;
$$;

-- 2026-10-20 -> จ. 20 ต.ค. 69
create or replace function public.thai_date(d date)
returns text
language sql
immutable
as $$
  select (array['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'])[extract(dow from d)::int + 1]
         || ' ' || extract(day from d)::int || ' ' || public.thai_month(to_char(d, 'YYYY-MM'));
$$;

-- ข้อความวันนัด เช่น "จ. 20 ต.ค. 69 13:00-15:30 น."
create or replace function public.repair_appointment_text(d date, p text)
returns text
language sql
immutable
as $$
  select public.thai_date(d) || ' ' || public.repair_period_label(p);
$$;

-- ข้อความช่วงเวลาที่ผู้เช่าสะดวก (บรรทัดละช่วง)
create or replace function public.repair_slots_text(p_slots jsonb, p_allow_entry boolean, p_note text)
returns text
language sql
immutable
as $$
  select concat_ws(E'\n',
    nullif(string_agg('• ' || public.repair_appointment_text((e->>'date')::date, e->>'period'), E'\n'), ''),
    case when p_allow_entry then '• เข้าห้องได้แม้ผู้เช่าไม่อยู่' end,
    case when coalesce(p_note, '') <> '' then '• หมายเหตุ: ' || p_note end)
  from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) e;
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
  v_head text;
  v_text text;
  v_title text;
  v_appt_changed boolean;
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
        new.user_id, 'repair',
        case when new.status = 'scheduled' and new.appointment_state = 'proposed'
             then 'ผู้ดูแลบันทึกเรื่องแจ้งซ่อมและเสนอวันเข้าซ่อม กรุณายืนยัน'
             else 'ผู้ดูแลบันทึกเรื่องแจ้งซ่อมให้คุณ' end,
        'ห้อง ' || new.room || ' · ' || new.problem,
        'รายการ: ' || new.problem || case when new.detail <> '' then E'\n' || new.detail else '' end
          || case when new.status = 'scheduled'
                  then E'\nวันนัด: ' || public.repair_appointment_text(new.appointment_date, new.appointment_period)
                  else '' end,
        '/repairs', 'ดูรายการแจ้งซ่อม');
    else
      perform public.notify_admins(
        'repair',
        case new.urgency when 'emergency' then 'แจ้งซ่อมฉุกเฉิน!' when 'urgent' then 'แจ้งซ่อมด่วน' else 'แจ้งซ่อมใหม่' end,
        'ห้อง ' || new.room || ' · ' || new.problem,
        'ผู้เช่า' || case when new.tenant_name <> '' then ' ' || new.tenant_name else '' end
          || ' ห้อง ' || new.room || ' แจ้งซ่อม: ' || new.problem
          || case when new.detail <> '' then E'\n\n' || new.detail else '' end
          || E'\n\nช่วงเวลาที่สะดวกให้ช่างเข้า:\n'
          || coalesce(nullif(public.repair_slots_text(new.available_slots, new.allow_entry, new.availability_note), ''), '• ไม่ได้ระบุ')
          || case when new.contact_phone <> '' then E'\nเบอร์ติดต่อ: ' || new.contact_phone else '' end,
        '/repairs', 'ไปที่ระบบแจ้งซ่อม');
    end if;

  elsif tg_op = 'UPDATE' then
    v_head := 'ห้อง ' || new.room || ' · ' || new.problem;
    v_appt_changed := new.appointment_date is distinct from old.appointment_date
                   or new.appointment_period is distinct from old.appointment_period;

    if v_admin then
      v_text := 'รายการ: ' || new.problem || E'\nสถานะ: ' || public.repair_status_label(new.status);
      if new.status = 'scheduled' then
        v_text := v_text || E'\nวันนัด: ' || public.repair_appointment_text(new.appointment_date, new.appointment_period)
          || case when new.technician <> '' then E'\nช่าง: ' || new.technician else '' end
          || E'\nช่างจะโทรไปคอนเฟิร์มอีกครั้งก่อนถึงเวลานัด 30 นาที';
      end if;
      if new.status in ('in_progress', 'done') and new.cost > 0 then
        v_text := v_text || E'\nค่าใช้จ่าย: ' || public.fmt_baht(new.cost)
          || case when new.cost_payer = 'tenant' then ' (ผู้เช่าเป็นผู้ชำระ)' else ' (หอพักรับผิดชอบ)' end
          || case when new.cost_payer = 'tenant' and new.status = 'done' then E'\nชำระค่าซ่อมและแนบสลิปได้ที่หน้าแจ้งซ่อม' else '' end;
      end if;
      if new.admin_note <> '' then
        v_text := v_text || E'\n\nข้อความจากผู้ดูแล: ' || new.admin_note;
      end if;

      if new.status = 'scheduled' and new.appointment_state = 'proposed'
         and (v_appt_changed or old.status is distinct from 'scheduled' or old.appointment_state is distinct from 'proposed') then
        v_title := 'ผู้ดูแลเสนอวันเข้าซ่อม กรุณายืนยัน';
        v_text := v_text || E'\n\nหากไม่สะดวก กด "ขอเปลี่ยนเวลา" ในหน้าแจ้งซ่อมเพื่อเลือกวันใหม่';
      elsif new.status = 'scheduled' and (v_appt_changed or old.status is distinct from 'scheduled'
            or old.appointment_state is distinct from new.appointment_state) then
        v_title := 'นัดเข้าซ่อม ' || public.repair_appointment_text(new.appointment_date, new.appointment_period);
      elsif new.status is distinct from old.status then
        v_title := case new.status
          when 'done' then 'ซ่อมเสร็จแล้ว กรุณาตรวจสอบและยืนยัน'
          when 'cancelled' then 'เรื่องแจ้งซ่อมถูกยกเลิก'
          when 'pending' then 'ต้องนัดวันเข้าซ่อมใหม่'
          else 'สถานะแจ้งซ่อมเปลี่ยนเป็น "' || public.repair_status_label(new.status) || '"' end;
      elsif new.admin_note is distinct from old.admin_note or new.technician is distinct from old.technician then
        v_title := 'ผู้ดูแลส่งข้อความเกี่ยวกับงานซ่อม';
      end if;

      if v_title is not null then
        perform public.notify(new.user_id, 'repair', v_title, v_head, v_text, '/repairs', 'ดูรายการแจ้งซ่อม');
      end if;

    -- ===== การกระทำของผู้เช่า =====
    elsif old.appointment_state = 'proposed' and new.appointment_state = 'confirmed' then
      perform public.notify_admins(
        'repair', 'ผู้เช่ายืนยันวันนัดซ่อมแล้ว', v_head,
        'ผู้เช่าห้อง ' || new.room || ' ยืนยันนัด ' || public.repair_appointment_text(new.appointment_date, new.appointment_period)
          || E'\nรายการ: ' || new.problem,
        '/repairs', 'ไปที่ระบบแจ้งซ่อม');
    elsif old.status = 'scheduled' and new.status = 'pending' then
      perform public.notify_admins(
        'repair', 'ผู้เช่าขอเปลี่ยนวันนัดซ่อม', v_head,
        'ผู้เช่าห้อง ' || new.room || ' ไม่สะดวกวันนัด ' || public.repair_appointment_text(old.appointment_date, old.appointment_period)
          || case when new.tenant_message <> '' then E'\nเหตุผล: ' || new.tenant_message else '' end
          || E'\n\nช่วงเวลาที่สะดวกใหม่:\n'
          || coalesce(nullif(public.repair_slots_text(new.available_slots, new.allow_entry, new.availability_note), ''), '• ไม่ได้ระบุ'),
        '/repairs', 'นัดวันใหม่');
    elsif old.status = 'done' and new.status = 'pending' then
      perform public.notify_admins(
        'repair', 'ผู้เช่าแจ้งว่ายังซ่อมไม่หาย', v_head,
        'ผู้เช่าห้อง ' || new.room || ' แจ้งว่างานซ่อม "' || new.problem || '" ยังมีปัญหา'
          || E'\nรายละเอียด: ' || new.tenant_message || E'\n\nกรุณานัดวันเข้าซ่อมใหม่',
        '/repairs', 'ไปที่ระบบแจ้งซ่อม');
    elsif old.tenant_confirmed_at is null and new.tenant_confirmed_at is not null then
      perform public.notify_admins(
        'repair', 'ผู้เช่ายืนยันว่าซ่อมเรียบร้อย', v_head,
        'ผู้เช่าห้อง ' || new.room || ' ตรวจสอบแล้ว งานซ่อม "' || new.problem || '" เรียบร้อยดี',
        '/repairs', 'ไปที่ระบบแจ้งซ่อม');
    elsif new.problem is distinct from old.problem
       or new.detail is distinct from old.detail
       or new.image_path is distinct from old.image_path
       or new.available_slots is distinct from old.available_slots
       or new.allow_entry is distinct from old.allow_entry
       or new.urgency is distinct from old.urgency then
      perform public.notify_admins(
        'repair', 'ผู้เช่าแก้ไขเรื่องแจ้งซ่อม', v_head,
        'ผู้เช่าห้อง ' || new.room || ' แก้ไขรายละเอียดเรื่องแจ้งซ่อม: ' || new.problem
          || case when new.detail <> '' then E'\n\n' || new.detail else '' end
          || E'\n\nช่วงเวลาที่สะดวก:\n'
          || coalesce(nullif(public.repair_slots_text(new.available_slots, new.allow_entry, new.availability_note), ''), '• ไม่ได้ระบุ'),
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

-- เตือนนัดซ่อมของวันนี้ (ผู้เช่า + แอดมิน) เรียกวันละครั้งตอนเช้าโดย pg_cron ด้านล่าง
create or replace function public.repairs_send_reminders()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select * from public.repairs
    where status = 'scheduled' and appointment_state = 'confirmed' and appointment_date = public.today_th()
  loop
    perform public.notify(
      r.user_id, 'repair', 'วันนี้มีนัดเข้าซ่อม ' || public.repair_period_label(r.appointment_period),
      'ห้อง ' || r.room || ' · ' || r.problem,
      'ช่างจะเข้าซ่อม "' || r.problem || '" ' || public.repair_appointment_text(r.appointment_date, r.appointment_period)
        || case when r.technician <> '' then E'\nช่าง: ' || r.technician else '' end
        || case when r.allow_entry then E'\nคุณอนุญาตให้เข้าห้องได้แม้ไม่อยู่' else E'\nกรุณาอยู่ห้องตามเวลานัด' end,
      '/repairs', 'ดูรายการแจ้งซ่อม');
    perform public.notify_admins(
      'repair', 'วันนี้มีนัดซ่อมห้อง ' || r.room,
      public.repair_period_label(r.appointment_period) || ' · ' || r.problem,
      'นัดซ่อมห้อง ' || r.room || ' ' || public.repair_appointment_text(r.appointment_date, r.appointment_period)
        || E'\nรายการ: ' || r.problem
        || case when r.technician <> '' then E'\nช่าง: ' || r.technician else '' end
        || case when r.contact_phone <> '' then E'\nเบอร์ผู้เช่า: ' || r.contact_phone else '' end,
      '/repairs', 'ไปที่ระบบแจ้งซ่อม');
  end loop;
end;
$$;

revoke all on function public.repairs_send_reminders() from public, anon, authenticated;

-- ตั้งเวลาเรียกทุกวัน 07:00 เวลาไทย (00:00 UTC) ต้องเปิด extension pg_cron ก่อน
-- (Supabase: Database > Extensions > pg_cron) ถ้ายังไม่เปิด ส่วนนี้จะถูกข้าม ระบบส่วนอื่นยังใช้งานได้ตามปกติ
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('repair-reminders', '0 0 * * *', 'select public.repairs_send_reminders()');
  end if;
end $$;

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
      -- ชำระครบ (ถ้าโอนเกิน refund_amount > 0 บอกผู้เช่าว่าหอพักจะโอนยอดเกินคืน ดู supabase/payments.sql)
      perform public.notify(
        new.user_id, 'invoice', 'ชำระเงินเรียบร้อย',
        'ใบแจ้งหนี้เดือน ' || public.thai_month(new.month) || ' · ' || public.fmt_baht(new.total),
        'ผู้ดูแลตรวจสอบสลิปและยืนยันการชำระเงินใบแจ้งหนี้เดือน ' || public.thai_month(new.month) || ' แล้ว'
          || case when new.refund_amount > 0
               then E'\nยอดที่โอนเกินมา ' || public.fmt_baht(new.refund_amount) || ' หอพักจะโอนคืนให้'
               else '' end,
        '/invoices', 'ดูใบแจ้งหนี้');
    elsif new.status = 'pending' and old.status = 'review' and new.paid_amount > old.paid_amount then
      -- ผู้ดูแลยืนยันสลิปแต่ยอดยังไม่ครบ: เก็บยอดที่ได้รับไว้ ผู้เช่าโอนส่วนที่เหลือเพิ่ม (ไม่ใช่การปฏิเสธสลิป)
      perform public.notify(
        new.user_id, 'invoice', 'ได้รับยอดชำระบางส่วน',
        'ใบแจ้งหนี้เดือน ' || public.thai_month(new.month) || ' · คงเหลือ ' || public.fmt_baht(new.total - new.paid_amount),
        'ได้รับยอดชำระ ' || public.fmt_baht(new.paid_amount - old.paid_amount) || ' แล้ว ยังเหลือยอดที่ต้องชำระอีก '
          || public.fmt_baht(new.total - new.paid_amount) || E'\nกรุณาโอนส่วนที่เหลือและแนบสลิปเพิ่ม',
        '/invoices', 'ชำระส่วนที่เหลือ');
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
