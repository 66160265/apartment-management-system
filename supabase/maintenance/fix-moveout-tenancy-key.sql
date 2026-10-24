-- แก้ข้อบกพร่อง: ผู้เช่าคนใหม่ที่เริ่มสัญญาวันเดียวกับผู้เช่าคนเก่าที่เพิ่งย้ายออกจากห้องเดียวกัน ถูกนับว่า "ย้ายออกไปแล้ว"
-- (เดิมแยกสัญญาด้วย ห้อง + วันเริ่มสัญญา เท่านั้น) ตอนนี้แยกด้วย ห้อง + วันเริ่มสัญญา + ตัวผู้เช่า รันซ้ำได้ ไม่แตะข้อมูล
-- สร้างจากไฟล์ migrations/20261022000000_initial_schema.sql (ส่วน move-out)

-- ผู้เช่า 1 สัญญา (ห้อง + วันเริ่มสัญญา + ตัวผู้เช่า) บันทึกย้ายออกได้ครั้งเดียว
-- ต้องรวมตัวผู้เช่าด้วย ไม่งั้นผู้เช่าคนใหม่ที่เริ่มสัญญาวันเดียวกับคนเก่าที่เพิ่งย้ายออกจากห้องเดียวกัน จะถูกนับว่าย้ายออกไปแล้ว
drop index if exists public.move_outs_tenancy_key;
create unique index if not exists move_outs_tenancy_key
  on public.move_outs (room, start_date, (coalesce(tenant_user_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  where start_date is not null;

create or replace function public.record_move_out(p_room text, p_date date, p_deductions jsonb, p_note text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  t public.tenants;
  item jsonb;
  lbl text;
  amt numeric;
  inv_id uuid;
  inv public.invoices;
  fee numeric;
  due numeric;
  total_ded numeric := 0;
  clean jsonb := '[]'::jsonb;
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  if p_date is null then
    raise exception 'กรุณาระบุวันที่ย้ายออก';
  end if;
  if p_deductions is null then
    p_deductions := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_deductions) <> 'array' or jsonb_array_length(p_deductions) > 30 then
    raise exception 'รายการหักไม่ถูกต้อง (ไม่เกิน 30 รายการ)';
  end if;

  select * into t from public.tenants where room = p_room for update;
  if not found then
    raise exception 'ไม่พบผู้เช่าห้องนี้';
  end if;
  if exists (
    select 1 from public.move_outs
     where room = t.room and start_date is not distinct from t.start_date and tenant_user_id is not distinct from t.user_id
  ) then
    raise exception 'ห้องนี้บันทึกการย้ายออกของสัญญานี้แล้ว';
  end if;

  for item in select * from jsonb_array_elements(p_deductions) loop
    lbl := btrim(coalesce(item ->> 'label', ''));
    begin
      amt := (item ->> 'amount')::numeric;
    exception when others then
      raise exception 'ยอดหักไม่ถูกต้อง';
    end;
    if lbl = '' or char_length(lbl) > 100 then
      raise exception 'ชื่อรายการหักต้องมี 1-100 ตัวอักษร';
    end if;
    if amt is null or amt <= 0 or amt > 10000000 then
      raise exception 'ยอดหักของรายการ "%" ต้องมากกว่า 0', lbl;
    end if;
    amt := round(amt, 2);
    total_ded := total_ded + amt;

    inv_id := null;
    if nullif(item ->> 'invoice_id', '') is not null then
      begin
        inv_id := (item ->> 'invoice_id')::uuid;
      exception when others then
        raise exception 'รหัสใบแจ้งหนี้ไม่ถูกต้อง';
      end;
      -- ต้องเป็นใบของผู้เช่าคนนี้ (ใบค้างของผู้เช่าคนก่อนในห้องเดียวกันหักจากเงินประกันคนนี้ไม่ได้)
      select * into inv from public.invoices where id = inv_id and room = t.room and user_id = t.user_id for update;
      if not found then
        raise exception 'ไม่พบใบแจ้งหนี้ของผู้เช่าคนนี้';
      end if;
      if inv.status <> 'pending' then
        raise exception 'ใบแจ้งหนี้เดือน % ไม่ได้อยู่ในสถานะรอชำระ (ชำระแล้วหรือรอตรวจสลิปอยู่ กรุณาจัดการก่อน)', public.thai_month(inv.month);
      end if;
      fee := public.invoice_late_fee(inv.late_fee_rate, inv.late_fee_grace, inv.late_fee_cap, inv.due_date, public.today_th());
      due := inv.total + fee - inv.paid_amount;
      if amt > due then
        raise exception 'ยอดหักเกินยอดค้างของใบแจ้งหนี้เดือน % (ค้าง %)', public.thai_month(inv.month), public.fmt_baht(due);
      end if;

      insert into public.invoice_payments (invoice_id, user_id, amount, slip_path, slip_uploaded_at, confirmed_by, auto_approved, source)
      values (inv.id, inv.user_id, amt, null, null, auth.uid(), false, 'deposit');

      if inv.paid_amount + amt >= inv.total + fee then
        update public.invoices
           set status = 'paid', paid_amount = paid_amount + amt, reviewed_at = now(), reject_reason = null, late_fee = fee
         where id = inv.id;
      else
        update public.invoices set paid_amount = paid_amount + amt where id = inv.id;
      end if;
    end if;

    clean := clean || jsonb_build_array(
      case when inv_id is null then jsonb_build_object('label', lbl, 'amount', amt)
           else jsonb_build_object('label', lbl, 'amount', amt, 'invoice_id', inv_id) end);
  end loop;

  -- ย้ายออกก่อนครบสัญญาปีแรก: ไม่คืนเงินประกัน (หักส่วนที่เหลือหลังหักรายการอื่น ถ้าหน้าเว็บใส่มาแล้วก็ไม่เหลือให้หักซ้ำ)
  if t.start_date is not null and p_date < (t.start_date + interval '1 year')::date and t.deposit - total_ded > 0 then
    clean := clean || jsonb_build_array(jsonb_build_object('label', 'ไม่คืนเงินประกัน (ย้ายออกก่อนครบสัญญา 1 ปี)', 'amount', t.deposit - total_ded));
    total_ded := t.deposit;
  end if;

  insert into public.move_outs (
    room, tenant_name, tenant_phone, tenant_user_id, start_date, end_date, move_out_date, deposit,
    deductions, deductions_total, refund_amount, owed_amount, refund_status, note, created_by)
  values (
    t.room, t.name, t.phone, t.user_id, t.start_date, t.end_date, p_date, t.deposit,
    clean, total_ded, greatest(0, t.deposit - total_ded), greatest(0, total_ded - t.deposit),
    case when t.deposit - total_ded > 0 then 'pending' else 'none' end,
    left(btrim(coalesce(p_note, '')), 500), auth.uid())
  returning id into new_id;
  return new_id;
end;
$$;
