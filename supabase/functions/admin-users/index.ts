import { createClient } from 'npm:@supabase/supabase-js@2'

// อนุญาตให้หน้าเว็บ (คนละโดเมน) เรียกฟังก์ชันนี้ได้
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// สร้าง response แบบ JSON พร้อม header CORS
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ความยาวรหัสผ่านขั้นต่ำตอนแอดมินตั้งรหัสใหม่ให้
const MIN_PASSWORD = 6

// ลบไฟล์ส่วนตัวของผู้เช่าออกจากที่เก็บ: เอกสารห้อง (tenant-docs) และรูปแชท (chat/<userId>/) คืนข้อความ error หรือ null
// deno-lint-ignore no-explicit-any
async function removePersonalFiles(admin: any, userId: string, room: string): Promise<string | null> {
  const { data: docs, error: docsError } = await admin.from('tenant_documents').select('file_path').eq('room', room)
  if (docsError) return `อ่านรายการเอกสารไม่สำเร็จ: ${docsError.message}`
  const docPaths = (docs ?? []).map((d: { file_path: string }) => d.file_path)
  if (docPaths.length) {
    const { error } = await admin.storage.from('tenant-docs').remove(docPaths)
    if (error) return `ลบไฟล์เอกสารผู้เช่าไม่สำเร็จ: ${error.message}`
  }
  const { data: chatFiles, error: listError } = await admin.storage.from('chat').list(userId, { limit: 1000 })
  if (listError) return `อ่านรายการรูปแชทไม่สำเร็จ: ${listError.message}`
  const chatPaths = (chatFiles ?? []).filter((f: { id: string | null }) => f.id).map((f: { name: string }) => `${userId}/${f.name}`)
  if (chatPaths.length) {
    const { error } = await admin.storage.from('chat').remove(chatPaths)
    if (error) return `ลบรูปแชทไม่สำเร็จ: ${error.message}`
  }
  return null
}

// จัดการบัญชีผู้ใช้ทั้งหมด (เฉพาะแอดมิน): list / update / delete
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // client สิทธิ์ service role (ข้าม RLS ได้) ใช้เฉพาะในฟังก์ชันนี้
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ตรวจว่าผู้เรียกเป็นแอดมินที่ login อยู่
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return json({ error: 'ไม่ได้เข้าสู่ระบบ' }, 401)
  const { data: caller } = await admin.auth.getUser(token)
  if (!caller.user) return json({ error: 'ไม่ได้เข้าสู่ระบบ' }, 401)
  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', caller.user.id).single()
  if (callerProfile?.role !== 'admin') return json({ error: 'ไม่มีสิทธิ์' }, 403)

  const body = await req.json()

  // list: รายชื่อบัญชีทั้งหมด พร้อมสิทธิ์และข้อมูลผู้เช่าที่ผูกอยู่
  if (body.action === 'list') {
    const { data: users, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) return json({ error: error.message }, 500)
    const [{ data: profiles }, { data: tenants }] = await Promise.all([
      admin.from('profiles').select('id, role'),
      admin.from('tenants').select('room, name, phone, start_date, end_date, user_id'),
    ])
    const rows = users.users.map((u) => {
      const t = tenants?.find((x) => x.user_id === u.id)
      return {
        id: u.id,
        email: u.email,
        role: profiles?.find((p) => p.id === u.id)?.role ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        tenant: t
          ? { room: t.room, name: t.name, phone: t.phone, startDate: t.start_date, endDate: t.end_date }
          : null,
      }
    })
    return json({ users: rows, currentUserId: caller.user.id })
  }

  // คำสั่งที่เหลือต้องระบุบัญชีเป้าหมาย
  const userId = String(body.userId ?? '')
  if (!userId) return json({ error: 'ไม่พบบัญชีที่ต้องการ' }, 400)

  // update: ตั้งรหัสผ่านใหม่ (ถ้าส่งมา) และแก้ข้อมูลผู้เช่า
  if (body.action === 'update') {
    const { password, name, phone, startDate, endDate } = body

    if (password) {
      if (String(password).length < MIN_PASSWORD) {
        return json({ error: `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD} ตัวอักษร` }, 400)
      }
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: `เปลี่ยนรหัสผ่านไม่สำเร็จ: ${error.message}` }, 400)
      // รหัสที่แอดมินตั้งให้คนอื่นแอดมินรู้อยู่ ให้เจ้าของบัญชีตั้งรหัสใหม่เองตอนเข้าครั้งถัดไป (ตั้งรหัสของตัวเองไม่ต้อง)
      if (userId !== caller.user.id) {
        const { error: flagError } = await admin.from('profiles').update({ must_change_password: true }).eq('id', userId)
        if (flagError) return json({ error: `ตั้งรหัสแล้วแต่บันทึกการบังคับเปลี่ยนรหัสไม่สำเร็จ: ${flagError.message}` }, 500)
      }
    }

    // ข้อมูลผู้เช่า (มีเฉพาะบัญชีที่ผูกกับผู้เช่า)
    if (name !== undefined) {
      if (!name || !phone || !startDate || !endDate || endDate < startDate) {
        return json({ error: 'ข้อมูลผู้เช่าไม่ครบหรือไม่ถูกต้อง' }, 400)
      }
      const { error } = await admin
        .from('tenants')
        .update({ name, phone, start_date: startDate, end_date: endDate })
        .eq('user_id', userId)
      if (error) return json({ error: `บันทึกไม่สำเร็จ: ${error.message}` }, 500)
    }
    return json({ ok: true })
  }

  // delete: ลบบัญชี (ลบบัญชีตัวเองไม่ได้)
  if (body.action === 'delete') {
    if (userId === caller.user.id) return json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' }, 400)

    // ถ้าเป็นผู้เช่า ลบข้อมูลผู้เช่าและคืนสถานะห้องเป็นว่างด้วย
    const { data: tenant } = await admin.from('tenants').select('room').eq('user_id', userId).maybeSingle()
    if (tenant) {
      // ลบไฟล์ส่วนตัวจริงออกจากที่เก็บก่อน (สำเนาบัตรประชาชน สัญญา และรูปในแชท) ไม่ปล่อยให้ค้างหลังบัญชีถูกลบ
      // ลบไม่สำเร็จ = หยุดและยังไม่ลบบัญชี ให้ลองใหม่ได้ ส่วนสลิปโอนเงินและรูปแจ้งซ่อมเก็บไว้เป็นหลักฐานทางบัญชี
      const cleanup = await removePersonalFiles(admin, userId, tenant.room)
      if (cleanup) return json({ error: cleanup }, 500)
      const { error } = await admin.from('tenants').delete().eq('user_id', userId)
      if (error) return json({ error: `ลบข้อมูลผู้เช่าไม่สำเร็จ: ${error.message}` }, 500)
      await admin.from('rooms').update({ status: 'vacant' }).eq('number', tenant.room)
    }
    // ลบสิทธิ์และบัญชี login
    await admin.from('profiles').delete().eq('id', userId)
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return json({ error: `ลบบัญชีไม่สำเร็จ: ${error.message}` }, 500)
    return json({ ok: true })
  }

  return json({ error: 'ไม่รู้จักคำสั่ง' }, 400)
})
