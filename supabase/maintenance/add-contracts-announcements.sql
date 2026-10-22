-- เพิ่มระบบ "ต่อสัญญา" (ประวัติการต่อสัญญา + ฟังก์ชัน renew_contract) และ "ประกาศถึงผู้เช่า" ลงฐานข้อมูลที่ใช้งานอยู่
-- แตะเฉพาะตาราง/ฟังก์ชันใหม่ของสองระบบนี้ ไม่แตะอย่างอื่น (เช่น ระบบกันนัดซ่อมซ้อนเวลาที่เพิ่มเข้ามาแยก) และรันซ้ำได้
-- ต้องมีตาราง profiles, tenants, notifications, audit_log และฟังก์ชัน is_admin(), notify(), audit_write(), thai_date(), today_th() อยู่แล้ว
-- สร้างจากส่วน contracts-announcements ของ migrations/20261022000000_initial_schema.sql บวกการปิดสิทธิ์ฟังก์ชัน trigger (ส่วน hardening)
-- และการปรับประสิทธิภาพ RLS (ส่วน rls-performance) เฉพาะตารางใหม่

-- ============================================================
-- contracts-announcements
-- ============================================================
-- ต่อสัญญาเช่า (แอดมินเป็นผู้ทำ ต่ออย่างเดียว เงินประกันใช้ก้อนเดิม) พร้อมประวัติการต่อ และประกาศถึงผู้เช่าทุกคน
-- รันซ้ำได้ ข้อมูลเดิมไม่หาย

-- ---------------------------------------------------------------------------
-- ประวัติการต่อสัญญา: แถวถูกเพิ่มโดยฟังก์ชัน renew_contract เท่านั้น แก้/ลบตรง ๆ ไม่ได้
-- ---------------------------------------------------------------------------
create table if not exists public.contract_renewals (
  id uuid primary key default gen_random_uuid(),
  room text not null,
  tenant_user_id uuid references auth.users (id) on delete set null,
  tenant_name text not null,
  previous_end_date date not null,
  new_end_date date not null check (new_end_date > previous_end_date),
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contract_renewals_room_idx on public.contract_renewals (room, created_at desc);
create index if not exists contract_renewals_user_idx on public.contract_renewals (tenant_user_id);
create index if not exists contract_renewals_created_by_idx on public.contract_renewals (created_by);

alter table public.contract_renewals enable row level security;

-- แอดมินเห็นทุกห้อง ผู้เช่าเห็นประวัติของตัวเอง
drop policy if exists "contract renewals read" on public.contract_renewals;
create policy "contract renewals read" on public.contract_renewals for select to authenticated
  using (public.is_admin() or tenant_user_id = auth.uid());

revoke insert, update, delete on table public.contract_renewals from anon, authenticated;

-- ต่อสัญญา: ย้ายวันสิ้นสุดสัญญาของผู้เช่าห้องนี้ไปเป็น p_new_end (ต้องหลังวันสิ้นสุดเดิม) บันทึกประวัติและประวัติการแก้ไข แจ้งผู้เช่าในเว็บ
-- วันเริ่มสัญญา เงินประกัน และข้อมูลอื่นไม่เปลี่ยน
create or replace function public.renew_contract(p_room text, p_new_end date, p_note text default '')
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  t public.tenants;
  new_id uuid;
  note_text text := left(btrim(coalesce(p_note, '')), 500);
begin
  if not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  if p_new_end is null then
    raise exception 'กรุณาระบุวันสิ้นสุดสัญญาใหม่';
  end if;

  select * into t from public.tenants where room = p_room for update;
  if not found then
    raise exception 'ไม่พบผู้เช่าห้องนี้';
  end if;
  if p_new_end <= t.end_date then
    raise exception 'วันสิ้นสุดสัญญาใหม่ต้องหลังวันสิ้นสุดเดิม (%)', public.thai_date(t.end_date);
  end if;
  if p_new_end > public.today_th() + 3650 then
    raise exception 'วันสิ้นสุดสัญญาใหม่ไกลเกินไป (เกิน 10 ปีนับจากวันนี้)';
  end if;

  update public.tenants set end_date = p_new_end where room = p_room;

  insert into public.contract_renewals (room, tenant_user_id, tenant_name, previous_end_date, new_end_date, note, created_by)
  values (t.room, t.user_id, t.name, t.end_date, p_new_end, note_text, auth.uid())
  returning id into new_id;

  perform public.audit_write('contract.renew', 'tenants', t.room, t.room,
    'ต่อสัญญาห้อง ' || t.room || ' ' || t.name || ' จาก ' || public.thai_date(t.end_date) || ' เป็น ' || public.thai_date(p_new_end),
    jsonb_build_object('previous_end_date', t.end_date, 'new_end_date', p_new_end, 'note', note_text));

  perform public.notify(t.user_id, 'system', 'ต่อสัญญาเช่าเรียบร้อย', 'ห้อง ' || t.room,
    'สัญญาเช่าของคุณถูกต่อออกไปถึงวันที่ ' || public.thai_date(p_new_end), '/account', 'ดูข้อมูลสัญญา');

  return new_id;
end;
$$;

revoke all on function public.renew_contract(text, date, text) from public, anon;
grant execute on function public.renew_contract(text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- ประกาศถึงผู้เช่าทุกคน: แอดมินเขียน/แก้/ลบ ผู้เช่าและแอดมินอ่านได้ เพิ่มประกาศแล้วทุกบัญชีผู้เช่าได้แจ้งเตือนในเว็บทันที
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  important boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists announcements_created_idx on public.announcements (created_at desc);
create index if not exists announcements_created_by_idx on public.announcements (created_by);

alter table public.announcements enable row level security;

drop policy if exists "announcements read" on public.announcements;
create policy "announcements read" on public.announcements for select to authenticated using (true);

drop policy if exists "announcements admin insert" on public.announcements;
create policy "announcements admin insert" on public.announcements for insert to authenticated
  with check (public.is_admin());

drop policy if exists "announcements admin update" on public.announcements;
create policy "announcements admin update" on public.announcements for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "announcements admin delete" on public.announcements;
create policy "announcements admin delete" on public.announcements for delete to authenticated
  using (public.is_admin());

-- ผู้เขียนและเวลาถูกกำหนดโดยฐานข้อมูล ไม่เชื่อค่าที่ส่งมาจากเว็บ แก้แล้วบันทึกเวลาแก้ไข (ผู้เขียนและเวลาสร้างเปลี่ยนไม่ได้)
create or replace function public.announcements_before_write()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.title := btrim(new.title);
  new.body := btrim(coalesce(new.body, ''));
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_at := null;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists announcements_before_write on public.announcements;
create trigger announcements_before_write before insert or update on public.announcements
  for each row execute function public.announcements_before_write();

-- ประกาศใหม่: แจ้งเตือนในเว็บถึงผู้เช่าทุกคนที่มีบัญชี (แก้ประกาศไม่แจ้งซ้ำ)
create or replace function public.announcements_notify()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, type, title, subtitle, details, action_link, action_label)
  select t.user_id, 'system',
         case when new.important then 'ประกาศสำคัญ: ' else 'ประกาศ: ' end || left(new.title, 100),
         '', left(new.body, 200), '/announcements', 'อ่านประกาศ'
  from public.tenants t
  where t.user_id is not null;
  return new;
end;
$$;

drop trigger if exists announcements_notify on public.announcements;
create trigger announcements_notify after insert on public.announcements
  for each row execute function public.announcements_notify();

-- ประวัติการแก้ไข: ลงประกาศ แก้ ลบ
create or replace function public.audit_announcements()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_write('announcement.create', 'announcements', new.id::text, null,
      'ลงประกาศ: ' || new.title, jsonb_build_object('title', new.title, 'important', new.important));
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.audit_write('announcement.update', 'announcements', new.id::text, null,
      'แก้ประกาศ: ' || new.title, jsonb_build_object('title', jsonb_build_object('old', old.title, 'new', new.title),
        'important', jsonb_build_object('old', old.important, 'new', new.important)));
    return new;
  end if;
  perform public.audit_write('announcement.delete', 'announcements', old.id::text, null,
    'ลบประกาศ: ' || old.title, jsonb_build_object('title', old.title));
  return old;
end;
$$;

drop trigger if exists audit_announcements on public.announcements;
create trigger audit_announcements after insert or update or delete on public.announcements
  for each row execute function public.audit_announcements();

-- ให้เว็บรับประกาศใหม่แบบเรียลไทม์
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'announcements'
  ) then
    alter publication supabase_realtime add table public.announcements;
  end if;
end $$;

-- ============================================================
-- ปรับประสิทธิภาพ RLS เฉพาะตารางใหม่ (คัดลอกจากส่วน rls-performance)
-- ============================================================

do $$
declare
  p record;
  new_qual text;
  new_check text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public' and tablename in ('contract_renewals', 'announcements')
       and (coalesce(qual, '') ~ 'auth\.uid\(\)' or coalesce(with_check, '') ~ 'auth\.uid\(\)')
  loop
    -- ข้ามอันที่ห่อแล้ว (ตรวจจาก "select auth.uid()" ที่ Postgres แสดงเป็น ( SELECT auth.uid() AS uid))
    new_qual := case when p.qual is null or p.qual ~* 'select\s+auth\.uid\(\)' then p.qual
                     else replace(p.qual, 'auth.uid()', '(select auth.uid())') end;
    new_check := case when p.with_check is null or p.with_check ~* 'select\s+auth\.uid\(\)' then p.with_check
                      else replace(p.with_check, 'auth.uid()', '(select auth.uid())') end;
    if new_qual is distinct from p.qual or new_check is distinct from p.with_check then
      execute format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename)
        || case when new_qual is not null then format(' using (%s)', new_qual) else '' end
        || case when new_check is not null then format(' with check (%s)', new_check) else '' end;
    end if;
  end loop;
end $$;

-- ============================================================
-- ปิดสิทธิ์เรียกฟังก์ชัน trigger ของระบบใหม่ผ่าน API (เหมือนส่วน hardening) ฟังก์ชันที่สร้างใหม่ได้สิทธิ์ตั้งต้นที่เปิดให้ทุกคนเรียกได้
-- trigger ยังทำงานตามปกติ เพราะ Postgres ตรวจสิทธิ์ EXECUTE ตอนสร้าง trigger เท่านั้น
-- ============================================================

revoke execute on function public.announcements_before_write() from public, anon, authenticated;
revoke execute on function public.announcements_notify() from public, anon, authenticated;
revoke execute on function public.audit_announcements() from public, anon, authenticated;
