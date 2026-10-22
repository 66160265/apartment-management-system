-- ตัวนับโควตาตรวจสลิป (EasySlip): บันทึกทุกครั้งที่ระบบจองสิทธิ์ตรวจ แล้วให้หน้าตั้งค่า/ภาพรวมแสดงจำนวนที่ใช้ในเดือนนี้
-- นับตอนจองสิทธิ์ตรวจ (ก่อนเรียก EasySlip) จึงอาจมากกว่าที่ EasySlip นับเล็กน้อย เช่น รูปใหญ่เกิน 4MB ที่ถูกข้ามก่อนเรียก
-- รันซ้ำได้ ข้อมูลเดิมไม่หาย

create table if not exists public.slip_verify_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('invoice', 'repair'))
);

create index if not exists slip_verify_log_at_idx on public.slip_verify_log (at);

alter table public.slip_verify_log enable row level security;
drop policy if exists "slip verify log admin read" on public.slip_verify_log;
create policy "slip verify log admin read" on public.slip_verify_log for select to authenticated
  using (public.is_admin());
revoke insert, update, delete on table public.slip_verify_log from anon, authenticated;

-- โควตาต่อเดือนที่หอพักซื้อไว้ (ว่าง = ไม่ตั้ง ไม่แสดงคำเตือน)
alter table public.app_settings add column if not exists slip_quota int;
alter table public.app_settings drop constraint if exists app_settings_slip_quota_check;
alter table public.app_settings add constraint app_settings_slip_quota_check check (slip_quota is null or slip_quota >= 0);

-- จองสิทธิ์ตรวจ (เหมือนเดิมทุกอย่าง เพิ่มแค่บันทึกลง slip_verify_log เมื่อจองสำเร็จ)
create or replace function public.claim_slip_verify(p_invoice uuid)
returns table (id uuid, user_id uuid, slip_path text, total numeric, paid_amount numeric, created_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
begin
  return query
  update public.invoices i
     set verify_status = 'checking', verify_attempts = i.verify_attempts + 1
   where i.id = p_invoice
     and i.status = 'review'
     and i.slip_path is not null
     and (i.verify_status is null or i.verify_status = 'error')
     and i.verify_attempts < 3
  returning i.id, i.user_id, i.slip_path, i.total, i.paid_amount, i.created_at;
  if found then
    insert into public.slip_verify_log (kind) values ('invoice');
  end if;
end;
$$;

-- created_at = เวลาที่ซ่อมเสร็จ (ถ้ามี) ใช้เทียบวันที่โอนในสลิปว่าไม่เก่ากว่าเวลาที่รู้ยอดค่าซ่อม
create or replace function public.claim_repair_slip_verify(p_payment uuid)
returns table (id uuid, user_id uuid, slip_path text, total numeric, paid_amount numeric, created_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
begin
  return query
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
  if found then
    insert into public.slip_verify_log (kind) values ('repair');
  end if;
end;
$$;
