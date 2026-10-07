import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { USERNAME_EMAIL_DOMAIN } from './tenantAccount'

export const roleLabels = { admin: 'ผู้ดูแลระบบ', user: 'ผู้เช่า' }

// อีเมลภายในระบบ (t311@โดเมน) -> ชื่อผู้ใช้ T311
export const emailToUsername = (email = '') =>
    email.endsWith(`@${USERNAME_EMAIL_DOMAIN}`) ? email.split('@')[0].toUpperCase() : email

// เก็บผลไว้ระดับโมดูล ให้ Sidebar, เมนู avatar และหน้าต่าง ๆ ใช้ร่วมกัน
// ไม่ต้องยิง API ซ้ำทุกครั้งที่เปลี่ยนหน้า
let cached = null
let pending = null

// ล้างแคชเมื่อสถานะ login เปลี่ยน (login/logout/เปลี่ยนบัญชี)
supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        cached = null
        pending = null
    }
})

async function fetchCurrentUser() {
    // getSession อ่านจากเครื่อง ไม่ต้องยิงเซิร์ฟเวอร์เหมือน getUser
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return null
    const [{ data: profile }, { data: tenant }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', user.id).single(),
        supabase.from('tenants').select('name, room, phone, start_date, end_date').eq('user_id', user.id).maybeSingle(),
    ])
    return {
        id: user.id,
        email: user.email,
        username: emailToUsername(user.email),
        role: profile?.role,
        tenant,
    }
}

// ข้อมูลผู้ใช้ที่ login อยู่: บัญชี, role และข้อมูลผู้เช่า (ถ้าเป็นผู้เช่า)
// คืนค่า null ระหว่างโหลด
export function useCurrentUser() {
    const [info, setInfo] = useState(cached)

    useEffect(() => {
        if (cached) return
        let active = true
        pending ??= fetchCurrentUser().then((result) => {
            cached = result
            return result
        })
        pending.then((result) => {
            if (active && result) setInfo(result)
        })
        return () => {
            active = false
        }
    }, [])

    return info
}
