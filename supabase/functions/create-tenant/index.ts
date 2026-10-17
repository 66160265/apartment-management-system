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

// ต้องตรงกับ usernameToEmail ใน src/lib/tenantAccount.js
const EMAIL_DOMAIN = Deno.env.get('USERNAME_EMAIL_DOMAIN') ?? 'apartment.app'

// เพิ่มผู้เช่าใหม่ (เฉพาะแอดมิน): สร้างบัญชี login, บันทึกสิทธิ์ user, เพิ่มแถว tenants และตั้งห้องเป็น occupied
Deno.serve(async (req) => {
  // เบราว์เซอร์ถามสิทธิ์ CORS ก่อนส่งคำขอจริง ตอบ ok กลับไป
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // client สิทธิ์ service role (ข้าม RLS ได้) ใช้เฉพาะในฟังก์ชันนี้ ห้ามอยู่ฝั่งเว็บ
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

  // อ่านข้อมูลผู้เช่าที่ส่งมา และตรวจว่าครบ/ถูกรูปแบบ
  const { room, name, phone, startDate, endDate } = await req.json()
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!/^[A-Za-z0-9]{1,10}$/.test(String(room ?? '')) || digits.length < 4 || !name || !startDate || !endDate) {
    return json({ error: 'ข้อมูลผู้เช่าไม่ครบหรือไม่ถูกต้อง' }, 400)
  }

  // สร้างบัญชี login: ชื่อผู้ใช้ T+เลขห้อง รหัสผ่าน TP+เลขห้อง+เบอร์ 4 ตัวท้าย (ยืนยันอีเมลให้เลย)
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

  // กำหนดสิทธิ์บัญชีนี้เป็นผู้เช่า (user)
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({ id: data.user.id, role: 'user' })
  if (profileError) return rollback(`บันทึกสิทธิ์ไม่สำเร็จ: ${profileError.message}`)

  // เพิ่มข้อมูลผู้เช่าและผูกกับบัญชี (ห้องซ้ำจะได้ error 23505)
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

  // สำเร็จแล้วเปลี่ยนสถานะห้องเป็นมีผู้เช่า และส่งชื่อผู้ใช้กลับไปแสดง
  await admin.from('rooms').update({ status: 'occupied' }).eq('number', String(room))

  return json({ username })
})
