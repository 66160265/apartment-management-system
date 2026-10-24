-- ความปลอดภัยเพิ่มเติม (ตรวจพบ 24 ต.ค. 2026) รันซ้ำได้ ไม่แตะข้อมูล และไม่แตะฟังก์ชัน/ตารางอื่น
-- 1) submit_slip / submit_repair_slip: ต้องมีไฟล์สลิปอยู่ในที่เก็บจริงก่อนรับ (เดิมส่งชื่อไฟล์ที่ไม่มีอยู่ได้)
-- 2) บทบาท anon (ยังไม่ login) ไม่ต้องมีสิทธิ์ระดับตารางเลย (RLS กันไว้อยู่แล้ว นี่คือชั้นป้องกันที่สอง) และตารางใหม่ไม่เปิดให้ anon อัตโนมัติ
-- สร้างจากไฟล์ migrations/20261022000000_initial_schema.sql (ส่วน payments, repair-payments, hardening)

create or replace function public.submit_slip(p_invoice uuid, p_path text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- ไฟล์สลิปต้องอยู่ในที่เก็บจริง (กันส่งชื่อไฟล์ที่ไม่มีอยู่ ทำให้แอดมินเปิดดูไม่ได้)
  if not exists (select 1 from storage.objects where bucket_id = 'slips' and name = p_path) then
    raise exception 'ไม่พบไฟล์สลิป กรุณาอัปโหลดใหม่';
  end if;
  update public.invoices
     set slip_path = p_path,
         slip_uploaded_at = now(),
         status = 'review',
         reject_reason = null
   where id = p_invoice
     and user_id = auth.uid()
     and status = 'pending'
     and p_path like auth.uid()::text || '/%';
  if not found then
    raise exception 'ไม่สามารถแนบสลิปให้ใบแจ้งหนี้นี้ได้';
  end if;
end;
$$;

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
  if not exists (select 1 from storage.objects where bucket_id = 'slips' and name = p_path) then
    raise exception 'ไม่พบไฟล์สลิป กรุณาอัปโหลดใหม่';
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


revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
