-- เงินประกันและการย้ายออก: รันใน Supabase SQL Editor หลังรัน schema.sql, invoices.sql, repairs.sql, notifications.sql, settings.sql และ payments.sql (รันซ้ำได้)
-- ถ้าจะให้บันทึกในประวัติการแก้ไข ให้รัน audit.sql อีกครั้งหลังไฟล์นี้
--
-- แนวคิด: เงินประกันเก็บที่ tenants.deposit แอดมินกรอกตอนเพิ่มผู้เช่าหรือแก้ในหน้ารายละเอียด
-- ย้ายออก = เรียก record_move_out ครั้งเดียว: ระบุวันที่ย้ายออก และรายการหักจากเงินประกัน (ค่าเช่า/ค่าปรับค้างชำระ ค่าทำความสะอาด ค่าเสียหาย ฯลฯ)
--   ฐานข้อมูลคำนวณเอง: ยอดคืนผู้เช่า = เงินประกัน - ยอดหัก (ไม่ต่ำกว่า 0) ถ้าหักเกินเงินประกัน = ยอดที่ผู้เช่าต้องจ่ายเพิ่ม (owed_amount)
--   รายการหักที่ผูกกับใบแจ้งหนี้ จะถูกบันทึกเป็นการรับเงินของใบนั้นจริง (แหล่งที่มา "หักจากเงินประกัน" มีใบเสร็จ) ไม่ปล่อยค้างในรายงาน
--   บันทึกย้ายออกเก็บสำเนาข้อมูลผู้เช่า ไม่หายแม้ลบผู้เช่าและบัญชีภายหลัง (การลบผู้เช่า/คืนห้องว่างยังใช้ปุ่มเดิมในหน้ารายละเอียดผู้เช่า)
--   เว็บเขียนตาราง move_outs ตรง ๆ ไม่ได้ ต้องผ่านฟังก์ชัน

alter table public.tenants add column if not exists deposit numeric(12, 2) not null default 0;
alter table public.tenants drop constraint if exists tenants_deposit_check;
alter table public.tenants add constraint tenants_deposit_check check (deposit >= 0);

-- แหล่งที่มาของการรับเงินค่าห้อง: transfer = โอน (ผ่านสลิป) deposit = หักจากเงินประกันตอนย้ายออก (ไม่มีสลิป)
alter table public.invoice_payments add column if not exists source text not null default 'transfer';
alter table public.invoice_payments drop constraint if exists invoice_payments_source_check;
alter table public.invoice_payments add constraint invoice_payments_source_check check (source in ('transfer', 'deposit'));

create table if not exists public.move_outs (
  id uuid primary key default gen_random_uuid(),
  room text not null references public.rooms (number) on update cascade,
  -- สำเนาข้อมูลผู้เช่า ณ วันที่ย้ายออก
  tenant_name text not null,
  tenant_phone text not null default '',
  tenant_user_id uuid,
  start_date date,
  end_date date,
  move_out_date date not null,
  deposit numeric(12, 2) not null check (deposit >= 0),
  -- รายการหัก [{label, amount, invoice_id?}] (ตรวจและจัดรูปแบบโดย record_move_out)
  deductions jsonb not null default '[]'::jsonb,
  deductions_total numeric(12, 2) not null default 0 check (deductions_total >= 0),
  -- ยอดที่ต้องคืนผู้เช่า / ยอดที่ผู้เช่าต้องจ่ายเพิ่ม (หักเกินเงินประกัน)
  refund_amount numeric(12, 2) not null default 0 check (refund_amount >= 0),
  owed_amount numeric(12, 2) not null default 0 check (owed_amount >= 0),
  -- pending รอคืนเงิน, done คืนแล้ว, none ไม่มียอดต้องคืน
  refund_status text not null default 'pending' check (refund_status in ('pending', 'done', 'none')),
  refunded_at timestamptz,
  refund_note text not null default '' check (char_length(refund_note) <= 500),
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists move_outs_room_idx on public.move_outs (room, created_at desc);
-- ผู้เช่า 1 สัญญา (ห้อง + วันเริ่มสัญญา) บันทึกย้ายออกได้ครั้งเดียว
create unique index if not exists move_outs_tenancy_key on public.move_outs (room, start_date) where start_date is not null;

alter table public.move_outs enable row level security;
drop policy if exists "move outs admin read" on public.move_outs;
create policy "move outs admin read" on public.move_outs for select to authenticated using (public.is_admin());
revoke insert, update, delete on table public.move_outs from anon, authenticated;

-- record_move_out: บันทึกย้ายออกและหักเงินประกัน (ทั้งหมดสำเร็จหรือไม่สำเร็จพร้อมกัน)
-- p_deductions = [{"label": "ค่าทำความสะอาด", "amount": 500}, {"label": "ค่าเช่า ต.ค. 69", "amount": 4200, "invoice_id": "<uuid>"}]
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
  if exists (select 1 from public.move_outs where room = t.room and start_date is not distinct from t.start_date) then
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
      select * into inv from public.invoices where id = inv_id and room = t.room for update;
      if not found then
        raise exception 'ไม่พบใบแจ้งหนี้ของห้องนี้';
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

-- mark_deposit_refunded: แอดมินบันทึกว่าคืนเงินประกันให้ผู้เช่าแล้ว
create or replace function public.mark_deposit_refunded(p_id uuid, p_note text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  update public.move_outs
     set refund_status = 'done', refunded_at = now(), refund_note = left(btrim(coalesce(p_note, '')), 500)
   where id = p_id and refund_status = 'pending';
  if not found then
    raise exception 'ไม่มียอดเงินประกันที่รอคืนในรายการนี้';
  end if;
end;
$$;

revoke all on function public.record_move_out(text, date, jsonb, text) from public, anon;
revoke all on function public.mark_deposit_refunded(uuid, text) from public, anon;
grant execute on function public.record_move_out(text, date, jsonb, text) to authenticated;
grant execute on function public.mark_deposit_refunded(uuid, text) to authenticated;
