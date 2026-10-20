-- ประวัติการแก้ไขข้อมูลสำคัญ (audit log): รันใน Supabase SQL Editor หลังรัน invoices.sql, repairs.sql, payments.sql, repair-payments.sql และ settings.sql (รันซ้ำได้)
-- ไฟล์ที่ยังไม่ได้รัน (เช่น repair-payments.sql) ข้ามส่วนของตารางนั้นเองโดยไม่ error
--
-- แนวคิด: ฐานข้อมูลบันทึกเองด้วย trigger ทุกครั้งที่มีการเปลี่ยนเรื่องเงินและการตั้งค่า (ใครทำ ทำอะไร เมื่อไหร่ ค่าเดิม/ค่าใหม่)
--   เว็บไม่มีสิทธิ์เขียน/แก้/ลบตารางนี้ (บันทึกปลอมหรือลบร่องรอยไม่ได้) เฉพาะแอดมินอ่านได้ และแก้/ลบแถวที่บันทึกแล้วไม่ได้แม้ใช้ SQL Editor (trigger กัน)
-- บันทึก: สร้าง/แก้ยอด/เปลี่ยนสถานะ/ลบใบแจ้งหนี้, ยืนยันรับเงิน (แอดมินหรือระบบอัตโนมัติ), โอนคืนยอดเกิน, ยืนยัน/ปฏิเสธสลิปค่าซ่อม,
--   แก้ค่าซ่อมและผู้ชำระ, เพิ่ม/ลบผู้เช่า, แก้ไขการตั้งค่า (รวมบัญชีรับเงินและพร้อมเพย์)
-- ผู้ทำรายการที่ไม่มีตัวตน (Edge Function ใช้ service role หรือรัน SQL เอง) บันทึกเป็น "ระบบ"
-- ไม่มีการลบประวัติเก่าอัตโนมัติ ตารางโตช้าเพราะเก็บเฉพาะเหตุการณ์สำคัญ

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- ผู้ทำรายการ: id และอีเมลจากตั๋วล็อกอิน (ว่าง = ระบบ) role = admin / user / system
  actor_id uuid,
  actor_email text,
  actor_role text not null default 'system',
  -- ชนิดเหตุการณ์ เช่น invoice.create, payment.confirm, settings.update
  action text not null,
  -- ตารางและรหัสของสิ่งที่ถูกแก้ ห้องที่เกี่ยวข้อง (ถ้ามี)
  entity text not null,
  entity_id text,
  room text,
  -- ข้อความสรุปภาษาไทยสำหรับอ่าน และรายละเอียด (ค่าเดิม/ค่าใหม่) สำหรับตรวจสอบ
  summary text not null,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, at desc);

alter table public.audit_log enable row level security;

drop policy if exists "audit read admin" on public.audit_log;
create policy "audit read admin" on public.audit_log for select to authenticated using (public.is_admin());
revoke insert, update, delete on table public.audit_log from anon, authenticated;

-- แก้/ลบแถวที่บันทึกแล้วไม่ได้ (กันแก้ประวัติย้อนหลัง)
create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ประวัติการแก้ไขแก้หรือลบไม่ได้';
end;
$$;

drop trigger if exists audit_log_immutable on public.audit_log;
create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

-- audit_write: บันทึก 1 เหตุการณ์ (เรียกจาก trigger ด้านล่างเท่านั้น ห้ามให้ผู้ใช้เรียกเอง)
create or replace function public.audit_write(
  p_action text, p_entity text, p_entity_id text, p_room text, p_summary text, p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  claims jsonb;
  email text;
  who uuid := auth.uid();
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    email := claims ->> 'email';
  exception when others then
    email := null;
  end;
  insert into public.audit_log (actor_id, actor_email, actor_role, action, entity, entity_id, room, summary, detail)
  values (
    who, email,
    case when who is null then 'system' when public.is_admin() then 'admin' else 'user' end,
    p_action, p_entity, p_entity_id, p_room, p_summary, coalesce(p_detail, '{}'::jsonb));
end;
$$;

revoke all on function public.audit_write(text, text, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.audit_status_label(s text)
returns text
language sql
immutable
as $$
  select case s when 'pending' then 'รอชำระ' when 'review' then 'รอตรวจสอบ' when 'paid' then 'ชำระแล้ว' else coalesce(s, '-') end;
$$;

-- ---------------------------------------------------------------------------
-- ใบแจ้งหนี้
-- ---------------------------------------------------------------------------
create or replace function public.audit_invoices()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_write('invoice.create', 'invoices', new.id::text, new.room,
      'สร้างใบแจ้งหนี้ ห้อง ' || new.room || ' เดือน ' || public.thai_month(new.month) || ' ยอด ' || public.fmt_baht(new.total),
      jsonb_build_object('month', new.month, 'total', new.total, 'tenant', new.tenant_name));
  elsif tg_op = 'DELETE' then
    perform public.audit_write('invoice.delete', 'invoices', old.id::text, old.room,
      'ลบใบแจ้งหนี้ ห้อง ' || old.room || ' เดือน ' || public.thai_month(old.month) || ' ยอด ' || public.fmt_baht(old.total)
        || ' (' || public.audit_status_label(old.status) || ' รับแล้ว ' || public.fmt_baht(old.paid_amount) || ')',
      jsonb_build_object('month', old.month, 'total', old.total, 'status', old.status, 'paid_amount', old.paid_amount, 'tenant', old.tenant_name));
  else
    if new.total is distinct from old.total then
      perform public.audit_write('invoice.edit_total', 'invoices', new.id::text, new.room,
        'แก้ยอดรวมใบแจ้งหนี้ ห้อง ' || new.room || ' เดือน ' || public.thai_month(new.month) || ': ' || public.fmt_baht(old.total) || ' → ' || public.fmt_baht(new.total),
        jsonb_build_object('month', new.month, 'old', old.total, 'new', new.total,
          'rent', jsonb_build_array(old.rent, new.rent),
          'water', jsonb_build_array(old.water_prev, old.water_curr, new.water_prev, new.water_curr),
          'elec', jsonb_build_array(old.elec_prev, old.elec_curr, new.elec_prev, new.elec_curr)));
    end if;
    if new.status is distinct from old.status then
      perform public.audit_write('invoice.status', 'invoices', new.id::text, new.room,
        'เปลี่ยนสถานะใบแจ้งหนี้ ห้อง ' || new.room || ' เดือน ' || public.thai_month(new.month) || ': '
          || public.audit_status_label(old.status) || ' → ' || public.audit_status_label(new.status)
          || case when old.status = 'review' and new.status = 'pending' and new.paid_amount = old.paid_amount and coalesce(new.reject_reason, '') <> ''
                  then ' (ปฏิเสธสลิป: ' || new.reject_reason || ')' else '' end,
        jsonb_build_object('month', new.month, 'from', old.status, 'to', new.status, 'paid_amount', new.paid_amount, 'reject_reason', new.reject_reason));
    end if;
    if new.refund_status = 'done' and old.refund_status is distinct from 'done' then
      perform public.audit_write('refund.done', 'invoices', new.id::text, new.room,
        'บันทึกโอนยอดคืนผู้เช่า ห้อง ' || new.room || ' เดือน ' || public.thai_month(new.month) || ' ' || public.fmt_baht(new.refund_amount),
        jsonb_build_object('month', new.month, 'refund_amount', new.refund_amount, 'note', new.refund_note));
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists audit_invoices on public.invoices;
create trigger audit_invoices after insert or update or delete on public.invoices
  for each row execute function public.audit_invoices();

-- ---------------------------------------------------------------------------
-- การรับเงินค่าห้อง (ยืนยันสลิป)
-- ---------------------------------------------------------------------------
create or replace function public.audit_invoice_payments()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  inv public.invoices;
begin
  select * into inv from public.invoices where id = new.invoice_id;
  perform public.audit_write('payment.confirm', 'invoice_payments', new.id::text, inv.room,
    case when new.auto_approved then 'ระบบยืนยันรับเงินอัตโนมัติ' else 'ยืนยันรับเงิน' end
      || ' ห้อง ' || coalesce(inv.room, '-') || ' เดือน ' || coalesce(public.thai_month(inv.month), '-') || ' ' || public.fmt_baht(new.amount),
    jsonb_build_object('invoice_id', new.invoice_id, 'amount', new.amount, 'auto', new.auto_approved, 'trans_ref', new.trans_ref, 'confirmed_by', new.confirmed_by));
  return new;
end;
$$;

drop trigger if exists audit_invoice_payments on public.invoice_payments;
create trigger audit_invoice_payments after insert on public.invoice_payments
  for each row execute function public.audit_invoice_payments();

-- ---------------------------------------------------------------------------
-- ค่าซ่อม: ยอด/ผู้ชำระ และการยืนยัน/ปฏิเสธสลิป (ส่วนสลิปมีเมื่อรัน repair-payments.sql แล้ว)
-- ---------------------------------------------------------------------------
create or replace function public.audit_repairs()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.cost is distinct from old.cost or new.cost_payer is distinct from old.cost_payer then
    perform public.audit_write('repair.cost', 'repairs', new.id::text, new.room,
      'แก้ค่าซ่อม ห้อง ' || new.room || ' "' || new.problem || '": ' || public.fmt_baht(old.cost) || ' (' || old.cost_payer || ') → '
        || public.fmt_baht(new.cost) || ' (' || new.cost_payer || ')',
      jsonb_build_object('old_cost', old.cost, 'new_cost', new.cost, 'old_payer', old.cost_payer, 'new_payer', new.cost_payer));
  end if;
  return new;
end;
$$;

drop trigger if exists audit_repairs on public.repairs;
create trigger audit_repairs after update of cost, cost_payer on public.repairs
  for each row execute function public.audit_repairs();

do $$
begin
  if to_regclass('public.repair_payments') is not null then
    execute $f$
      create or replace function public.audit_repair_payments()
      returns trigger
      language plpgsql
      security definer set search_path = public
      as $body$
      declare
        r public.repairs;
      begin
        if new.status is distinct from old.status and new.status in ('paid', 'rejected') then
          select * into r from public.repairs where id = new.repair_id;
          perform public.audit_write('repair_payment.' || new.status, 'repair_payments', new.id::text, r.room,
            case when new.status = 'paid'
                 then case when new.auto_approved then 'ระบบยืนยันรับค่าซ่อมอัตโนมัติ' else 'ยืนยันรับค่าซ่อม' end
                 else 'ปฏิเสธสลิปค่าซ่อม' end
              || ' ห้อง ' || coalesce(r.room, '-') || ' "' || coalesce(r.problem, '-') || '" ' || public.fmt_baht(new.amount)
              || case when new.status = 'rejected' then ' (' || coalesce(new.reject_reason, '') || ')' else '' end,
            jsonb_build_object('repair_id', new.repair_id, 'amount', new.amount, 'auto', new.auto_approved, 'trans_ref', new.trans_ref, 'reason', new.reject_reason));
        end if;
        return new;
      end;
      $body$
    $f$;
    drop trigger if exists audit_repair_payments on public.repair_payments;
    create trigger audit_repair_payments after update on public.repair_payments
      for each row execute function public.audit_repair_payments();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ผู้เช่า (เพิ่ม/ลบ)
-- ---------------------------------------------------------------------------
create or replace function public.audit_tenants()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_write('tenant.create', 'tenants', new.room, new.room,
      'เพิ่มผู้เช่า ห้อง ' || new.room || ' ' || new.name, jsonb_build_object('name', new.name, 'username', new.username));
    return new;
  end if;
  perform public.audit_write('tenant.delete', 'tenants', old.room, old.room,
    'ลบผู้เช่า ห้อง ' || old.room || ' ' || old.name, jsonb_build_object('name', old.name, 'username', old.username));
  return old;
end;
$$;

drop trigger if exists audit_tenants on public.tenants;
create trigger audit_tenants after insert or delete on public.tenants
  for each row execute function public.audit_tenants();

-- ---------------------------------------------------------------------------
-- การตั้งค่า (โดยเฉพาะบัญชีรับเงิน/พร้อมเพย์ ถ้าถูกเปลี่ยนต้องตรวจย้อนหลังได้ว่าใครเปลี่ยน)
-- ---------------------------------------------------------------------------
create or replace function public.audit_settings()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  k text;
  changed jsonb := '{}'::jsonb;
begin
  for k in select jsonb_object_keys(n) loop
    if k <> 'updated_at' and (o -> k) is distinct from (n -> k) then
      changed := changed || jsonb_build_object(k, jsonb_build_object('old', o -> k, 'new', n -> k));
    end if;
  end loop;
  if changed <> '{}'::jsonb then
    perform public.audit_write('settings.update', 'app_settings', '1', null,
      'แก้ไขการตั้งค่า: ' || (select string_agg(key, ', ' order by key) from jsonb_object_keys(changed) as key), changed);
  end if;
  return new;
end;
$$;

drop trigger if exists audit_settings on public.app_settings;
create trigger audit_settings after update on public.app_settings
  for each row execute function public.audit_settings();
