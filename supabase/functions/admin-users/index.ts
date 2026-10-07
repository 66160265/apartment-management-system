import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const MIN_PASSWORD = 6

// จัดการบัญชีผู้ใช้ทั้งหมด (เฉพาะแอดมิน): list / update / delete
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ตรวจว่าผู้เรียกเป็นแอดมินที่ login อยู่
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return json({ error: 'ไม่ได้เข้าสู่ระบบ' }, 401)
  const { data: caller } = await admin.auth.getUser(token)
  if (!caller.user) return json({ error: 'ไม่ได้เข้าสู่ระบบ' }, 401)
  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', caller.user.id).single()
  if (callerProfile?.role !== 'admin') return json({ error: 'ไม่มีสิทธิ์' }, 403)

  const body = await req.json()

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

  const userId = String(body.userId ?? '')
  if (!userId) return json({ error: 'ไม่พบบัญชีที่ต้องการ' }, 400)

  if (body.action === 'update') {
    const { password, name, phone, startDate, endDate } = body

    if (password) {
      if (String(password).length < MIN_PASSWORD) {
        return json({ error: `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD} ตัวอักษร` }, 400)
      }
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: `เปลี่ยนรหัสผ่านไม่สำเร็จ: ${error.message}` }, 400)
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

  if (body.action === 'delete') {
    if (userId === caller.user.id) return json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' }, 400)

    // ถ้าเป็นผู้เช่า ลบข้อมูลผู้เช่าและคืนสถานะห้องเป็นว่างด้วย
    const { data: tenant } = await admin.from('tenants').select('room').eq('user_id', userId).maybeSingle()
    if (tenant) {
      const { error } = await admin.from('tenants').delete().eq('user_id', userId)
      if (error) return json({ error: `ลบข้อมูลผู้เช่าไม่สำเร็จ: ${error.message}` }, 500)
      await admin.from('rooms').update({ status: 'vacant' }).eq('number', tenant.room)
    }
    await admin.from('profiles').delete().eq('id', userId)
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return json({ error: `ลบบัญชีไม่สำเร็จ: ${error.message}` }, 500)
    return json({ ok: true })
  }

  return json({ error: 'ไม่รู้จักคำสั่ง' }, 400)
})
