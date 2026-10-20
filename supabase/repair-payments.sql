-- จ่ายค่าซ่อมในระบบ: รันใน Supabase SQL Editor หลังรัน repairs.sql, notifications.sql, payments.sql และ slip-verify.sql (รันซ้ำได้)
--
-- แนวคิด: เรื่องแจ้งซ่อมที่ซ่อมเสร็จแล้ว (status = done) และผู้ดูแลระบุว่าผู้เช่าเป็นผู้ชำระ (cost_payer = tenant, cost > 0)
--   ผู้เช่าโอนเงินตามยอด cost แล้วแนบสลิป -> ผู้ดูแล (หรือระบบตรวจสลิปโหมดอัตโนมัติ) ยืนยัน -> ชำระแล้ว
-- จ่ายครั้งเดียวเต็มยอด ไม่มีโอนไม่ครบ/โอนเกินแบบใบแจ้งหนี้ ถ้ายอดไม่ตรงให้ผู้ดูแลปฏิเสธพร้อมเหตุผล ผู้เช่าโอนใหม่
-- เก็บแยกในตาราง repair_payments (ไม่เพิ่มคอลัมน์ในตาราง repairs) เพราะ trigger ของ repairs ล็อกเฉพาะคอลัมน์ที่ระบุชื่อไว้
-- ผู้เช่าเขียนตารางนี้ตรง ๆ ไม่ได้ ต้องผ่าน submit_repair_slip เท่านั้น จึงปลอมสถานะ "ชำระแล้ว" ไม่ได้

create table if not exists public.repair_payments (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references public.repairs (id) on delete cascade,
  -- ผู้เช่าเจ้าของเรื่อง (ใช้ให้ผู้เช่าอ่านของตัวเองได้)
  user_id uuid references auth.users (id) on delete set null,
  -- ยอดค่าซ่อมที่ต้องชำระ ณ ตอนส่งสลิป (จำไว้ ใช้เทียบกับยอดในสลิป)
  amount numeric(12, 2) not null check (amount > 0),
  slip_path text not null,
  slip_uploaded_at timestamptz not null default now(),
  -- review รอตรวจ, paid ชำระแล้ว, rejected ถูกปฏิเสธ (ผู้เช่าส่งสลิปใหม่ได้)
  status text not null default 'review' check (status in ('review', 'paid', 'rejected')),
  reject_reason text,
  reviewed_at timestamptz,
  -- ผู้ดูแลที่ยืนยัน/ปฏิเสธ (ว่าง = ระบบอนุมัติอัตโนมัติ หรือยังไม่ตรวจ)
  reviewed_by uuid references auth.users (id) on delete set null,
  auto_approved boolean not null default false,
  -- เลขอ้างอิงสลิป และผลตรวจสลิปด้วย EasySlip (ความหมายเหมือน invoices ใน slip-verify.sql)
  trans_ref text,
  verify_status text check (verify_status is null or verify_status in ('checking', 'ok', 'warn', 'failed', 'error', 'skipped')),
  verify_detail jsonb,
  verify_attempts int not null default 0,
  created_at timestamptz not null default now()
);

-- เลขที่ใบเสร็จ (ใช้ตัวนับ receipt_no_seq ร่วมกับค่าห้อง ดู payments.sql) ออกตอนยืนยันรับเงินเท่านั้น
alter table public.repair_payments add column if not exists receipt_no bigint;
do $$
declare
  x record;
begin
  for x in select id from public.repair_payments where status = 'paid' and receipt_no is null order by reviewed_at, id loop
    update public.repair_payments set receipt_no = nextval('public.receipt_no_seq') where id = x.id;
  end loop;
end $$;
create unique index if not exists repair_payments_receipt_key on public.repair_payments (receipt_no);

-- ค่าซ่อมหนึ่งเรื่องมีรายการที่ "รอตรวจหรือชำระแล้ว" ได้ไม่เกิน 1 รายการ (ส่งสลิปซ้อนไม่ได้ ส่งใหม่ได้เมื่อถูกปฏิเสธ)
create unique index if not exists repair_payments_active_key on public.repair_payments (repair_id) where status in ('review', 'paid');
create index if not exists repair_payments_repair_idx on public.repair_payments (repair_id, created_at);

alter table public.repair_payments enable row level security;

drop policy if exists "repair payments read" on public.repair_payments;
create policy "repair payments read" on public.repair_payments for select to authenticated
  using (public.is_admin() or user_id = auth.uid());
revoke insert, update, delete on table public.repair_payments from anon, authenticated;

-- มีสลิปรอตรวจหรือชำระแล้ว ห้ามแก้ยอดค่าใช้จ่ายหรือผู้ชำระของเรื่องนั้น (ไม่งั้นยอดที่ผู้เช่าโอนกับยอดในระบบขัดกัน)
create or replace function public.repairs_lock_cost()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (new.cost is distinct from old.cost or new.cost_payer is distinct from old.cost_payer)
     and exists (select 1 from public.repair_payments where repair_id = old.id and status in ('review', 'paid')) then
    raise exception 'เรื่องนี้มีการส่งสลิปหรือชำระค่าซ่อมแล้ว แก้ไขค่าใช้จ่ายไม่ได้';
  end if;
  return new;
end;
$$;

drop trigger if exists repairs_lock_cost on public.repairs;
create trigger repairs_lock_cost before update of cost, cost_payer on public.repairs
  for each row execute function public.repairs_lock_cost();

-- submit_repair_slip: ผู้เช่าส่งสลิปค่าซ่อมของเรื่องตัวเอง (หน้าเว็บอัปโหลดรูปลงถัง slips โฟลเดอร์ <user id>/ ก่อนแล้วเรียกฟังก์ชันนี้)
create or replace function public.submit_repair_slip(p_repair uuid, p_path text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  r public.repairs;
  new_id uuid;
begin
  select * into r from public.repairs where id = p_repair and user_id = auth.uid() for update;
  if not found then
    raise exception 'ไม่พบรายการแจ้งซ่อม';
  end if;
  if r.status <> 'done' or r.cost_payer <> 'tenant' or r.cost <= 0 then
    raise exception 'รายการนี้ไม่มีค่าซ่อมที่ต้องชำระ';
  end if;
  if p_path is null or p_path not like auth.uid()::text || '/%' then
    raise exception 'ที่อยู่ไฟล์สลิปไม่ถูกต้อง';
  end if;

  begin
    insert into public.repair_payments (repair_id, user_id, amount, slip_path)
    values (r.id, r.user_id, r.cost, p_path)
    returning id into new_id;
  exception when unique_violation then
    raise exception 'ค่าซ่อมรายการนี้ส่งสลิปแล้วหรือชำระเรียบร้อยแล้ว';
  end;

  perform public.notify_admins(
    'repair', 'มีสลิปค่าซ่อมรอตรวจสอบ',
    'ห้อง ' || r.room || ' · ' || r.problem,
    'ผู้เช่าห้อง ' || r.room || ' แนบสลิปค่าซ่อม "' || r.problem || '" ยอด ' || public.fmt_baht(r.cost) || ' รอตรวจสอบ',
    '/repairs', 'ไปที่ระบบแจ้งซ่อม');
  return new_id;
end;
$$;

-- record_repair_payment: ตรรกะยืนยันรับค่าซ่อม (ใช้ร่วมระหว่างแอดมินกดยืนยันกับระบบอนุมัติอัตโนมัติ) ผู้เรียกต้องตรวจสิทธิ์ก่อน
create or replace function public.record_repair_payment(p_payment uuid, p_by uuid, p_auto boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  pay public.repair_payments;
  r public.repairs;
  ref text;
begin
  select * into pay from public.repair_payments where id = p_payment and status = 'review' for update;
  if not found then
    raise exception 'รายการนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ';
  end if;
  select * into r from public.repairs where id = pay.repair_id;

  ref := nullif(pay.verify_detail ->> 'transRef', '');
  begin
    if ref is not null then
      insert into public.slip_refs (trans_ref, source) values (ref, 'repair');
    end if;
  exception when unique_violation then
    raise exception 'สลิปนี้ถูกใช้ยืนยันรับเงินกับรายการอื่นแล้ว';
  end;

  update public.repair_payments
     set status = 'paid', reviewed_at = now(), reviewed_by = p_by, auto_approved = coalesce(p_auto, false),
         trans_ref = ref, reject_reason = null, receipt_no = nextval('public.receipt_no_seq')
   where id = pay.id;

  perform public.notify(
    pay.user_id, 'repair', 'ชำระค่าซ่อมเรียบร้อย',
    'ห้อง ' || r.room || ' · ' || r.problem,
    case when p_auto
      then 'ระบบตรวจสอบสลิปและยืนยันการชำระค่าซ่อม "' || r.problem || '" ยอด ' || public.fmt_baht(pay.amount) || ' อัตโนมัติแล้ว'
      else 'ผู้ดูแลตรวจสอบสลิปและยืนยันการชำระค่าซ่อม "' || r.problem || '" ยอด ' || public.fmt_baht(pay.amount) || ' แล้ว' end,
    '/repairs', 'ดูรายการแจ้งซ่อม');
  if p_auto then
    perform public.notify_admins(
      'repair', 'ระบบอนุมัติสลิปค่าซ่อมอัตโนมัติ',
      'ห้อง ' || r.room || ' · ' || r.problem,
      'ระบบตรวจสลิปค่าซ่อมห้อง ' || r.room || ' ยอด ' || public.fmt_baht(pay.amount) || ' ผ่านครบทุกเงื่อนไขและยืนยันรับเงินแล้ว',
      '/repairs', 'ไปที่ระบบแจ้งซ่อม');
  end if;
end;
$$;

-- approve_repair_payment: แอดมินยืนยันว่าได้รับค่าซ่อมตามสลิป (ยอดเต็มตามที่ระบุ)
create or replace function public.approve_repair_payment(p_payment uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  perform public.record_repair_payment(p_payment, auth.uid(), false);
end;
$$;

-- reject_repair_payment: แอดมินปฏิเสธสลิป (ต้องมีเหตุผล) ผู้เช่าส่งสลิปใหม่ได้
create or replace function public.reject_repair_payment(p_payment uuid, p_reason text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  pay public.repair_payments;
  r public.repairs;
begin
  if not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'กรุณาระบุเหตุผลที่ปฏิเสธ';
  end if;
  update public.repair_payments
     set status = 'rejected', reject_reason = left(btrim(p_reason), 500), reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_payment and status = 'review'
   returning * into pay;
  if not found then
    raise exception 'รายการนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ';
  end if;
  select * into r from public.repairs where id = pay.repair_id;
  perform public.notify(
    pay.user_id, 'repair', 'สลิปค่าซ่อมไม่ผ่านการตรวจสอบ',
    'ห้อง ' || r.room || ' · ' || r.problem,
    'ผู้ดูแลไม่รับสลิปค่าซ่อม "' || r.problem || E'"\nเหตุผล: ' || pay.reject_reason || E'\nกรุณาโอนและแนบสลิปใหม่อีกครั้ง',
    '/repairs', 'แนบสลิปใหม่');
end;
$$;

-- ---------------------------------------------------------------------------
-- ตรวจสลิปด้วย EasySlip สำหรับค่าซ่อม (ทำงานเหมือนของใบแจ้งหนี้ใน slip-verify.sql ใช้ Edge Function verify-slip ตัวเดียวกัน)
-- ---------------------------------------------------------------------------

-- เปลี่ยนสลิปไม่ได้ในแถวเดิม (ส่งใหม่คือแถวใหม่) จึงไม่ต้องมี trigger ล้างผลตรวจ

-- จองสิทธิ์ตรวจ 1 ครั้งต่อรายการ (ตรวจซ้ำได้เฉพาะเมื่อครั้งก่อน error สูงสุด 3 ครั้ง)
-- created_at = เวลาที่ซ่อมเสร็จ (ถ้ามี) ใช้เทียบวันที่โอนในสลิปว่าไม่เก่ากว่าเวลาที่รู้ยอดค่าซ่อม
create or replace function public.claim_repair_slip_verify(p_payment uuid)
returns table (id uuid, user_id uuid, slip_path text, total numeric, paid_amount numeric, created_at timestamptz)
language sql
security definer set search_path = public
as $$
  with c as (
    update public.repair_payments p
       set verify_status = 'checking', verify_attempts = p.verify_attempts + 1
     where p.id = p_payment
       and p.status = 'review'
       and (p.verify_status is null or p.verify_status = 'error')
       and p.verify_attempts < 3
     returning p.id, p.user_id, p.slip_path, p.amount, p.repair_id
  )
  select c.id, c.user_id, c.slip_path, c.amount, 0::numeric, coalesce(r.completed_at, r.created_at)
  from c join public.repairs r on r.id = c.repair_id;
$$;

-- บันทึกผลตรวจ และตรวจสลิปซ้ำจากเลขอ้างอิง
create or replace function public.apply_repair_slip_result(p_payment uuid, p_status text, p_detail jsonb)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  result text := p_status;
  detail jsonb := coalesce(p_detail, '{}'::jsonb);
  ref text := nullif(detail ->> 'transRef', '');
begin
  perform 1 from public.repair_payments where id = p_payment and verify_status = 'checking' for update;
  if not found then return 'ignored'; end if;

  if result in ('ok', 'warn') and ref is not null and (
       exists (select 1 from public.slip_refs where trans_ref = ref)
       or exists (select 1 from public.repair_payments
                   where id <> p_payment and status = 'review' and verify_status in ('ok', 'warn') and verify_detail ->> 'transRef' = ref)
       or exists (select 1 from public.invoices
                   where status = 'review' and verify_status in ('ok', 'warn') and verify_detail ->> 'transRef' = ref)
     ) then
    result := 'failed';
    detail := jsonb_set(detail, '{notes}', coalesce(detail -> 'notes', '[]'::jsonb) || to_jsonb('สลิปนี้ถูกใช้กับรายการอื่นแล้ว'::text));
  end if;

  update public.repair_payments set verify_status = result, verify_detail = detail where id = p_payment;
  return result;
end;
$$;

create or replace function public.mark_repair_slip_error(p_payment uuid, p_message text)
returns void
language sql
security definer set search_path = public
as $$
  update public.repair_payments
     set verify_status = 'error', verify_detail = jsonb_build_object('notes', jsonb_build_array(p_message))
   where id = p_payment and verify_status = 'checking';
$$;

-- ยืนยันรับค่าซ่อมให้เองเมื่อผ่านครบทุกเงื่อนไข (เหมือน auto_approve_slip: โหมด auto, ผลตรวจ ok, ยอดเท่ายอดค่าซ่อมพอดี,
-- ผู้รับยืนยันแล้ว, มีเลขอ้างอิงและไม่ซ้ำ) คืน 'paid' หรือ 'not_eligible'
create or replace function public.auto_approve_repair_payment(p_payment uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  pay public.repair_payments;
  detail jsonb;
  amt numeric;
begin
  if coalesce((select slip_verify_mode from public.app_settings where id = 1), 'off') <> 'auto' then
    return 'not_eligible';
  end if;

  select * into pay from public.repair_payments where id = p_payment and status = 'review' and verify_status = 'ok' for update;
  if not found then return 'not_eligible'; end if;

  detail := coalesce(pay.verify_detail, '{}'::jsonb);
  begin
    amt := (detail ->> 'amount')::numeric;
  exception when others then
    return 'not_eligible';
  end;

  if amt is null or round(amt, 2) <> round(pay.amount, 2) then return 'not_eligible'; end if;
  if (detail -> 'accountMatched') is distinct from 'true'::jsonb then return 'not_eligible'; end if;
  if nullif(detail ->> 'transRef', '') is null then return 'not_eligible'; end if;

  begin
    perform public.record_repair_payment(pay.id, null, true);
  exception when raise_exception then
    return 'not_eligible';
  end;
  return 'paid';
end;
$$;

revoke all on function public.submit_repair_slip(uuid, text) from public, anon;
revoke all on function public.approve_repair_payment(uuid) from public, anon;
revoke all on function public.reject_repair_payment(uuid, text) from public, anon;
grant execute on function public.submit_repair_slip(uuid, text) to authenticated;
grant execute on function public.approve_repair_payment(uuid) to authenticated;
grant execute on function public.reject_repair_payment(uuid, text) to authenticated;

-- ฟังก์ชันภายในและของ Edge Function (service role) ผู้ใช้เว็บเรียกไม่ได้
revoke all on function public.record_repair_payment(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.claim_repair_slip_verify(uuid) from public, anon, authenticated;
revoke all on function public.apply_repair_slip_result(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.mark_repair_slip_error(uuid, text) from public, anon, authenticated;
revoke all on function public.auto_approve_repair_payment(uuid) from public, anon, authenticated;
grant execute on function public.claim_repair_slip_verify(uuid) to service_role;
grant execute on function public.apply_repair_slip_result(uuid, text, jsonb) to service_role;
grant execute on function public.mark_repair_slip_error(uuid, text) to service_role;
grant execute on function public.auto_approve_repair_payment(uuid) to service_role;
