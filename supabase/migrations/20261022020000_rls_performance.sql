-- ปรับประสิทธิภาพ RLS ตามคำเตือน Performance Advisor ของ Supabase (ผลลัพธ์เหมือนเดิมทุกอย่าง ต่างแค่เร็วขึ้นเมื่อข้อมูลเยอะ)
-- รันซ้ำได้ ข้อมูลเดิมไม่หาย
-- หมายเหตุ: ถ้ารันไฟล์ initial_schema ซ้ำภายหลัง policy จะกลับเป็นแบบเดิม ให้รันไฟล์นี้ตามอีกครั้ง

-- ============================================================
-- 1) policy ที่เรียก auth.uid() ตรง ๆ จะถูกคำนวณซ้ำทุกแถว ห่อด้วย (select ...) ให้คำนวณครั้งเดียวต่อคำสั่ง
--    แก้ทุก policy ในโครงสร้าง public ที่ยังไม่ได้ห่อ (ไม่แตะบทบาทหรือคำสั่งของ policy)
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
     where schemaname = 'public'
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
-- 2) ดัชนีให้ foreign key ที่ยังไม่มี (ลบ/แก้แถวต้นทางจะไม่ต้องสแกนทั้งตาราง)
-- ============================================================

create index if not exists chat_messages_sender_idx on public.chat_messages (sender_id);
create index if not exists invoice_payments_confirmed_by_idx on public.invoice_payments (confirmed_by);
create index if not exists move_outs_created_by_idx on public.move_outs (created_by);
create index if not exists repair_payments_reviewed_by_idx on public.repair_payments (reviewed_by);
