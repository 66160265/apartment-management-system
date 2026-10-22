-- กู้ระบบแชท (ตาราง chat_messages ฟังก์ชัน chat_* นโยบาย bucket chat และ realtime) กรณีถูกลบออกจากฐานข้อมูลโดยไม่ตั้งใจ
-- แตะเฉพาะวัตถุของแชท ไม่แตะตาราง/ฟังก์ชันอื่น (เช่น ระบบกันนัดซ่อมซ้อนเวลาที่เพิ่มเข้ามาแยก) และรันซ้ำได้
-- ข้อความแชทเดิมที่อยู่ในตารางที่ถูกลบกู้กลับไม่ได้ (ไฟล์นี้สร้างตารางเปล่า)
-- สร้างจากส่วน chat ของ migrations/20261022000000_initial_schema.sql บวกการปรับประสิทธิภาพ RLS ของ 20261022020000_rls_performance.sql เฉพาะแชท
-- ต้องมีตาราง profiles, tenants และฟังก์ชัน is_admin() อยู่แล้ว

-- ============================================================
-- chat
-- ============================================================

-- ระบบแชทผู้เช่า <-> ผู้ดูแล แบบเรียลไทม์: รันใน Supabase SQL Editor หลังรัน schema.sql (ต้องมีฟังก์ชัน is_admin())
-- รันซ้ำได้ ไม่ทำให้ข้อมูลเดิมหาย
--
-- แนวคิด: ผู้เช่า 1 คน = 1 ห้องแชท (ระบุด้วย tenant_user_id = id บัญชีผู้เช่า) ผู้ดูแลทุกคนเห็นและตอบได้ทุกห้อง
-- read_at = เวลาที่ "อีกฝั่ง" อ่านข้อความนั้นแล้ว (ข้อความผู้เช่า -> ผู้ดูแลอ่าน, ข้อความผู้ดูแล -> ผู้เช่าอ่าน)

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_user_id uuid not null references auth.users (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  -- ส่งจากฝั่งผู้เช่าหรือไม่ (กำหนดตอนเพิ่มข้อความ ไม่ขึ้นกับบัญชีผู้ส่งที่อาจถูกลบภายหลัง)
  from_tenant boolean not null default false,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- รูปที่แนบในแชท (path ใน bucket chat: <tenant_user_id>/<ไฟล์>) ข้อความต้องมีตัวอักษรหรือรูปอย่างใดอย่างหนึ่ง
alter table public.chat_messages add column if not exists image_path text;
alter table public.chat_messages alter column body set default '';
-- แก้ไข/ลบข้อความ (ลบแบบซ่อน: ล้างเนื้อหาแต่เก็บแถวไว้ แสดงเป็น "ข้อความนี้ถูกลบแล้ว")
alter table public.chat_messages add column if not exists edited_at timestamptz;
alter table public.chat_messages add column if not exists deleted_at timestamptz;
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages add constraint chat_messages_body_check
  check (char_length(body) <= 2000 and (deleted_at is not null or btrim(body) <> '' or image_path is not null));

create index if not exists chat_messages_thread_idx on public.chat_messages (tenant_user_id, created_at desc);
create index if not exists chat_messages_unread_idx on public.chat_messages (tenant_user_id, from_tenant) where read_at is null;

alter table public.chat_messages enable row level security;

-- ผู้ดูแลเห็นทุกห้อง ผู้เช่าเห็นเฉพาะห้องแชทของตัวเอง
drop policy if exists "chat read" on public.chat_messages;
create policy "chat read" on public.chat_messages for select to authenticated
  using (public.is_admin() or tenant_user_id = auth.uid());

-- ส่งข้อความได้เฉพาะในห้องที่ตัวเองมีสิทธิ์ (ผู้ส่ง/เวลา/ฝั่ง ถูกกำหนดโดย trigger ด้านล่าง)
drop policy if exists "chat insert" on public.chat_messages;
create policy "chat insert" on public.chat_messages for insert to authenticated
  with check (public.is_admin() or tenant_user_id = auth.uid());

-- แก้/ลบตารางตรง ๆ ไม่ได้ ต้องผ่านฟังก์ชัน chat_mark_read / chat_edit_message / chat_delete_message
revoke update, delete on table public.chat_messages from anon, authenticated;

-- กำหนดผู้ส่ง ฝั่งผู้ส่ง และเวลาเอง ไม่เชื่อค่าที่ส่งมาจากเว็บ
create or replace function public.chat_messages_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.sender_id := auth.uid();
    new.from_tenant := not public.is_admin();
  end if;
  new.body := btrim(coalesce(new.body, ''));
  -- รูปต้องอยู่ในโฟลเดอร์ของห้องแชทนี้เท่านั้น
  if new.image_path is not null and split_part(new.image_path, '/', 1) <> new.tenant_user_id::text then
    raise exception 'ที่อยู่รูปไม่ถูกต้อง';
  end if;
  new.read_at := null;
  new.edited_at := null;
  new.deleted_at := null;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists chat_messages_before_insert on public.chat_messages;
create trigger chat_messages_before_insert before insert on public.chat_messages
  for each row execute function public.chat_messages_before_insert();

-- ทำเครื่องหมายว่าอ่านข้อความของอีกฝั่งในห้องนี้แล้ว
create or replace function public.chat_mark_read(p_tenant uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_admin boolean := public.is_admin();
begin
  if not v_admin and p_tenant is distinct from auth.uid() then
    raise exception 'ไม่มีสิทธิ์เข้าถึงห้องแชทนี้';
  end if;
  update public.chat_messages
  set read_at = now()
  where tenant_user_id = p_tenant and read_at is null and from_tenant = v_admin;
end;
$$;

-- แก้ไขข้อความของตัวเอง (แก้ได้เฉพาะตัวอักษร รูปแก้ไม่ได้)
create or replace function public.chat_edit_message(p_id uuid, p_body text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.chat_messages
  set body = btrim(coalesce(p_body, '')), edited_at = now()
  where id = p_id and sender_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'แก้ไขได้เฉพาะข้อความของตัวเองที่ยังไม่ถูกลบ'; end if;
end;
$$;

-- ลบข้อความของตัวเอง: ล้างข้อความและรูป คืน path รูปเดิมให้เว็บลบไฟล์ออกจาก storage
create or replace function public.chat_delete_message(p_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_image text;
begin
  select image_path into v_image from public.chat_messages
  where id = p_id and sender_id = auth.uid() and deleted_at is null
  for update;
  if not found then raise exception 'ลบได้เฉพาะข้อความของตัวเองที่ยังไม่ถูกลบ'; end if;
  update public.chat_messages set body = '', image_path = null, deleted_at = now() where id = p_id;
  return v_image;
end;
$$;

-- รายการห้องแชทสำหรับผู้ดูแล: ข้อความล่าสุด และจำนวนข้อความจากผู้เช่าที่ยังไม่อ่าน
create or replace function public.chat_conversations()
returns table (tenant_user_id uuid, last_body text, last_at timestamptz, last_from_tenant boolean, unread bigint)
language sql
stable
security definer set search_path = public
as $$
  select distinct on (m.tenant_user_id)
    m.tenant_user_id,
    case when m.deleted_at is not null then 'ข้อความถูกลบแล้ว' else coalesce(nullif(m.body, ''), '[รูปภาพ]') end,
    m.created_at, m.from_tenant,
    count(*) filter (where m.from_tenant and m.read_at is null and m.deleted_at is null) over (partition by m.tenant_user_id)
  from public.chat_messages m
  where public.is_admin()
  order by m.tenant_user_id, m.created_at desc;
$$;

revoke all on function public.chat_mark_read(uuid) from public, anon;
revoke all on function public.chat_conversations() from public, anon;
grant execute on function public.chat_mark_read(uuid) to authenticated;
grant execute on function public.chat_conversations() to authenticated;
revoke all on function public.chat_edit_message(uuid, text) from public, anon;
revoke all on function public.chat_delete_message(uuid) from public, anon;
grant execute on function public.chat_edit_message(uuid, text) to authenticated;
grant execute on function public.chat_delete_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- รูปในแชท: bucket ส่วนตัว แยกโฟลเดอร์ตามห้องแชท (<tenant_user_id>/...) ไม่เกิน 5 MB
-- ผู้เช่าอัปโหลด/ดูได้เฉพาะโฟลเดอร์ตัวเอง ผู้ดูแลได้ทุกโฟลเดอร์
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "chat upload own or admin" on storage.objects;
create policy "chat upload own or admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "chat read own or admin" on storage.objects;
create policy "chat read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'chat' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ลบได้เฉพาะไฟล์ที่ตัวเองอัปโหลด (ใช้ตอนส่งข้อความไม่สำเร็จ หรือลบข้อความที่มีรูป)
drop policy if exists "chat delete own upload" on storage.objects;
create policy "chat delete own upload" on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and owner_id = auth.uid()::text);

-- ให้เว็บรับข้อความใหม่/สถานะอ่านแล้วแบบเรียลไทม์
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- ============================================================
-- ปรับประสิทธิภาพ RLS เฉพาะแชท (คัดลอกจาก 20261022020000_rls_performance.sql แล้วจำกัดที่ chat_messages) และดัชนี FK
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
     where schemaname = 'public' and tablename = 'chat_messages'
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

create index if not exists chat_messages_sender_idx on public.chat_messages (sender_id);
