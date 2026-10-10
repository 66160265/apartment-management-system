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

// ต้องตรงกับ usernameToEmail ใน src/lib/tenantAccount.js
const EMAIL_DOMAIN = Deno.env.get('USERNAME_EMAIL_DOMAIN') ?? 'apartment.app'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ตรวจว่าผู้เรียกเป็นแอดมินที่ login อยู่
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return json({ error: 'ไม่ได้เข้าสู่ระบบ' }, 401)
  const { data: caller } = await admin.auth.getUser(token)
  if (!caller.user) return json({ error: 'ไม่ได้เข้าสู่ระบบ' }, 401)
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .single()
  if (callerProfile?.role !== 'admin') return json({ error: 'ไม่มีสิทธิ์' }, 403)

  const { room, name, phone, startDate, endDate } = await req.json()
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!/^[A-Za-z0-9]{1,10}$/.test(String(room ?? '')) || digits.length < 4 || !name || !startDate || !endDate) {
    return json({ error: 'ข้อมูลผู้เช่าไม่ครบหรือไม่ถูกต้อง' }, 400)
  }

  const username = `T${room}`
  const { data, error } = await admin.auth.admin.createUser({
    email: `${username.toLowerCase()}@${EMAIL_DOMAIN}`,
    password: `TP${room}${digits.slice(-4)}`,
    email_confirm: true,
  })
  if (error || !data.user) {
    const taken = error?.message.toLowerCase().includes('already')
    return json({ error: taken ? 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' : `สร้างบัญชีไม่สำเร็จ: ${error?.message}` }, taken ? 409 : 400)
  }

  // ถ้าขั้นไหนพลาด ให้ลบบัญชีที่เพิ่งสร้าง ไม่ให้เหลือบัญชีค้าง
  const rollback = async (message: string, status = 500) => {
    await admin.auth.admin.deleteUser(data.user!.id)
    return json({ error: message }, status)
  }

  const { error: profileError } = await admin
    .from('profiles')
    .upsert({ id: data.user.id, role: 'user' })
  if (profileError) return rollback(`บันทึกสิทธิ์ไม่สำเร็จ: ${profileError.message}`)

  const { error: tenantError } = await admin.from('tenants').insert({
    room: String(room),
    name,
    phone,
    username,
    start_date: startDate,
    end_date: endDate,
    user_id: data.user.id,
  })
  if (tenantError) {
    const dup = tenantError.code === '23505'
    return rollback(dup ? 'ห้องนี้มีผู้เช่าอยู่แล้ว' : `บันทึกผู้เช่าไม่สำเร็จ: ${tenantError.message}`, dup ? 409 : 500)
  }

  await admin.from('rooms').update({ status: 'occupied' }).eq('number', String(room))

  return json({ username })
})
