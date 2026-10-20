-- ตรวจสลิปด้วย EasySlip: รันใน Supabase SQL Editor หลังรัน invoices.sql, notifications.sql, settings.sql และ payments.sql (รันซ้ำได้)
--
-- ไฟล์นี้คืออะไร: ช่องเก็บผลตรวจสลิปใน invoices, โหมดตรวจใน app_settings และฟังก์ชันที่ Edge Function verify-slip เรียก
-- Edge Function: supabase/functions/verify-slip (ต้อง deploy และตั้ง secret EASYSLIP_API_KEY)
-- โหมด slip_verify_mode: off = ไม่ตรวจ, suggest = ตรวจแล้วแสดงผลให้แอดมินดู แอดมินยังกดยืนยันรับเงินเองทุกครั้ง
--   auto = ตรวจแล้ว "ถ้าผ่านครบทุกเงื่อนไข" ระบบยืนยันรับเงินให้เอง (เงื่อนไขอยู่ที่ auto_approve_slip ด้านล่าง ตรวจซ้ำในฐานข้อมูลเสมอ)
-- ระบบไม่ปฏิเสธสลิปเอง สลิปที่ไม่ผ่านเงื่อนไขจะรอแอดมินตรวจเหมือนเดิม

alter table public.invoices
  -- สถานะการตรวจ: checking กำลังตรวจ, ok สลิปจริงและยอดตรงกับยอดคงเหลือ, warn สลิปจริงแต่มีข้อสังเกต (ยอดไม่ตรง วันที่แปลก ผู้รับตรวจไม่ได้)
  -- failed ไม่ผ่าน (ไม่พบ QR / ไม่ใช่สลิปจริง / สลิปซ้ำ), error ติดต่อบริการไม่ได้, skipped ข้ามการตรวจ (เช่น รูปใหญ่เกิน 4MB)
  add column if not exists verify_status text,
  -- รายละเอียดผลตรวจ: ยอด วันที่โอน ผู้โอน ผู้รับ เลขอ้างอิง (transRef) และ notes ข้อสังเกต ผู้เช่าเจ้าของบิลอ่านได้ด้วย (ไม่มีข้อมูลลับ)
  add column if not exists verify_detail jsonb,
  -- จำนวนครั้งที่ส่งตรวจ จำกัด 3 ครั้งต่อบิล กันเสียโควตาของบริการ
  add column if not exists verify_attempts int not null default 0;

alter table public.invoices drop constraint if exists invoices_verify_status_check;
alter table public.invoices add constraint invoices_verify_status_check
  check (verify_status is null or verify_status in ('checking', 'ok', 'warn', 'failed', 'error', 'skipped'));

-- โหมดตรวจสลิป ค่าเริ่มต้น off (ตารางนี้ผู้เช่าอ่านได้ จึงห้ามเก็บ API key ที่นี่ ให้เก็บเป็น secret ของ Edge Function)
alter table public.app_settings
  add column if not exists slip_verify_mode text not null default 'off';
alter table public.app_settings drop constraint if exists app_settings_slip_verify_mode_check;
alter table public.app_settings add constraint app_settings_slip_verify_mode_check check (slip_verify_mode in ('off', 'suggest', 'auto'));

-- เปลี่ยนสลิป (ผู้เช่าแนบใหม่ หรือแอดมินปฏิเสธ/ยืนยันแล้วล้างสลิป) ให้ล้างผลตรวจเก่าทิ้ง
-- ใช้ trigger แทนการแก้ submit_slip เพื่อไม่ให้การรัน invoices.sql ซ้ำมาทับพฤติกรรมนี้
create or replace function public.invoices_reset_verify()
returns trigger
language plpgsql
as $$
begin
  if new.slip_path is distinct from old.slip_path then
    new.verify_status := null;
    new.verify_detail := null;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_reset_verify on public.invoices;
create trigger invoices_reset_verify before update of slip_path on public.invoices
  for each row execute function public.invoices_reset_verify();

-- claim_slip_verify: Edge Function เรียกก่อนส่งสลิปไปตรวจ เพื่อ "จองสิทธิ์" ตรวจ 1 ครั้งต่อสลิป
-- คืนข้อมูลบิลเมื่อจองได้ คืนว่างเมื่อไม่ควรตรวจ (ไม่ได้รอตรวจ ตรวจไปแล้ว หรือครบ 3 ครั้ง)
-- ตรวจซ้ำได้เฉพาะเมื่อครั้งก่อน error (เช่น บริการล่ม) การจองเป็นคำสั่งเดียว กดซ้ำหรือเรียกพร้อมกันไม่เสียโควตาซ้ำ
create or replace function public.claim_slip_verify(p_invoice uuid)
returns table (id uuid, user_id uuid, slip_path text, total numeric, paid_amount numeric, created_at timestamptz)
language sql
security definer set search_path = public
as $$
  update public.invoices i
     set verify_status = 'checking', verify_attempts = i.verify_attempts + 1
   where i.id = p_invoice
     and i.status = 'review'
     and i.slip_path is not null
     and (i.verify_status is null or i.verify_status = 'error')
     and i.verify_attempts < 3
  returning i.id, i.user_id, i.slip_path, i.total, i.paid_amount, i.created_at;
$$;

-- apply_slip_result: บันทึกผลตรวจ และตรวจสลิปซ้ำจากเลขอ้างอิง (transRef) ใน detail
create or replace function public.apply_slip_result(p_invoice uuid, p_status text, p_detail jsonb)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  result text := p_status;
  detail jsonb := coalesce(p_detail, '{}'::jsonb);
  ref text := nullif(detail ->> 'transRef', '');
begin
  perform 1 from public.invoices where id = p_invoice and verify_status = 'checking' for update;
  if not found then return 'ignored'; end if;

  if result in ('ok', 'warn') and ref is not null and (
       exists (select 1 from public.invoice_payments where trans_ref = ref)
       or exists (select 1 from public.invoices
                   where id <> p_invoice and status = 'review' and verify_status in ('ok', 'warn') and verify_detail ->> 'transRef' = ref)
     ) then
    result := 'failed';
    detail := jsonb_set(detail, '{notes}', coalesce(detail -> 'notes', '[]'::jsonb) || to_jsonb('สลิปนี้ถูกใช้กับใบแจ้งหนี้อื่นแล้ว'::text));
  end if;

  update public.invoices set verify_status = result, verify_detail = detail where id = p_invoice;
  return result;
end;
$$;

-- mark_slip_error: Edge Function ล้มกลางทาง ให้สถานะ checking ไม่ค้าง
create or replace function public.mark_slip_error(p_invoice uuid, p_message text)
returns void
language sql
security definer set search_path = public
as $$
  update public.invoices
     set verify_status = 'error', verify_detail = jsonb_build_object('notes', jsonb_build_array(p_message))
   where id = p_invoice and verify_status = 'checking';
$$;

-- auto_approve_slip: ยืนยันรับเงินให้เองเมื่อ "ผ่านครบทุกเงื่อนไข" คืน 'paid' เมื่ออนุมัติ หรือ 'not_eligible' เมื่อไม่เข้าเงื่อนไข (ไม่ทำอะไร)
-- เงื่อนไขทั้งหมด (ตรวจในฐานข้อมูลเองทุกครั้ง ไม่เชื่อ Edge Function อย่างเดียว):
--   1) โหมดตั้งเป็น auto  2) บิลรอตรวจและผลตรวจเป็น ok  3) ยอดในสลิปเท่ากับยอดคงเหลือพอดี (ไม่ครบ/เกินให้แอดมินตัดสิน)
--   4) EasySlip ยืนยันว่าผู้รับคือบัญชีของหอพัก (accountMatched = true)  5) มีเลขอ้างอิงสลิป และไม่เคยถูกใช้
create or replace function public.auto_approve_slip(p_invoice uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  inv public.invoices;
  detail jsonb;
  amt numeric;
  result text;
begin
  if coalesce((select slip_verify_mode from public.app_settings where id = 1), 'off') <> 'auto' then
    return 'not_eligible';
  end if;

  select * into inv from public.invoices where id = p_invoice and status = 'review' and verify_status = 'ok' for update;
  if not found then return 'not_eligible'; end if;

  detail := coalesce(inv.verify_detail, '{}'::jsonb);
  begin
    amt := (detail ->> 'amount')::numeric;
  exception when others then
    return 'not_eligible';
  end;

  if amt is null or round(amt, 2) <> round(inv.total - inv.paid_amount, 2) then return 'not_eligible'; end if;
  if (detail -> 'accountMatched') is distinct from 'true'::jsonb then return 'not_eligible'; end if;
  if nullif(detail ->> 'transRef', '') is null then return 'not_eligible'; end if;

  begin
    result := public.record_payment(inv.id, amt, null, true);
  exception when raise_exception then
    -- เช่น สลิปถูกใช้กับบิลอื่นไปแล้ว: ปล่อยให้แอดมินตรวจเอง
    return 'not_eligible';
  end;

  -- ผู้ใช้ที่ไม่ได้ล็อกอิน (service role) ทำให้ trigger แจ้งเตือนข้าม จึงแจ้งเองตรงนี้
  perform public.notify(
    inv.user_id, 'invoice', 'ชำระเงินเรียบร้อย',
    'ใบแจ้งหนี้เดือน ' || public.thai_month(inv.month) || ' · ' || public.fmt_baht(inv.total),
    'ระบบตรวจสอบสลิปและยืนยันการชำระเงินใบแจ้งหนี้เดือน ' || public.thai_month(inv.month) || ' อัตโนมัติแล้ว',
    '/invoices', 'ดูใบแจ้งหนี้');
  perform public.notify_admins(
    'invoice', 'ระบบอนุมัติสลิปอัตโนมัติ',
    'ห้อง ' || inv.room || ' · ' || public.thai_month(inv.month),
    'ระบบตรวจสลิปของห้อง ' || inv.room || ' (' || inv.tenant_name || ') ยอด ' || public.fmt_baht(amt) || ' ผ่านครบทุกเงื่อนไขและยืนยันรับเงินแล้ว',
    '/invoices', 'ไปที่ใบแจ้งหนี้');
  return result;
end;
$$;

-- ให้เฉพาะ Edge Function (service role) เรียกได้ ผู้ใช้เว็บเรียกไม่ได้ ไม่งั้นปลอมผลตรวจได้
revoke all on function public.claim_slip_verify(uuid) from public, anon, authenticated;
revoke all on function public.apply_slip_result(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.mark_slip_error(uuid, text) from public, anon, authenticated;
revoke all on function public.auto_approve_slip(uuid) from public, anon, authenticated;
grant execute on function public.claim_slip_verify(uuid) to service_role;
grant execute on function public.apply_slip_result(uuid, text, jsonb) to service_role;
grant execute on function public.mark_slip_error(uuid, text) to service_role;
grant execute on function public.auto_approve_slip(uuid) to service_role;
