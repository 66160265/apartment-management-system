import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { USERNAME_EMAIL_DOMAIN } from './tenantAccount'

// ชื่อสิทธิ์ภาษาไทยสำหรับแสดงผล
export const roleLabels = { admin: 'ผู้ดูแลระบบ', user: 'ผู้เช่า' }

// อีเมลภายในระบบ (t311@โดเมน) -> ชื่อผู้ใช้ T311
export const emailToUsername = (email = '') =>
    email.endsWith(`@${USERNAME_EMAIL_DOMAIN}`) ? email.split('@')[0].toUpperCase() : email

// เก็บผลไว้ระดับโมดูล ให้ Sidebar, เมนู avatar และหน้าต่าง ๆ ใช้ร่วมกัน
// ไม่ต้องยิง API ซ้ำทุกครั้งที่เปลี่ยนหน้า
let cached = null
let pending = null

// ล้างแคชให้โหลดข้อมูลผู้ใช้ใหม่ครั้งถัดไป (เช่น หลังเปลี่ยนรหัสผ่านครั้งแรก)
export function resetCurrentUser() {
    cached = null
    pending = null
}

// ล้างแคชเมื่อสถานะ login เปลี่ยน (login/logout/เปลี่ยนบัญชี)
supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        cached = null
        pending = null
    }
})

// อ่านสิทธิ์และเครื่องหมายบังคับเปลี่ยนรหัสผ่านจาก profiles
// ถ้ายังไม่ได้รัน ส่วน hardening ของไฟล์ migration (ไม่มีคอลัมน์ must_change_password) ให้อ่านแค่สิทธิ์ ระบบทำงานตามเดิม
async function fetchProfile(userId) {
    const full = await supabase.from('profiles').select('role, must_change_password').eq('id', userId).single()
    if (!full.error) return full.data
    const basic = await supabase.from('profiles').select('role').eq('id', userId).single()
    return basic.data
}

// ดึงข้อมูลผู้ใช้ที่ login: บัญชี สิทธิ์จาก profiles และข้อมูลผู้เช่า (ถ้ามี)
async function fetchCurrentUser() {
    // getSession อ่านจากเครื่อง ไม่ต้องยิงเซิร์ฟเวอร์เหมือน getUser
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return null
    // ดึงสิทธิ์ (profiles) และข้อมูลผู้เช่าของบัญชีนี้พร้อมกัน
    const [profile, { data: tenant }] = await Promise.all([
        fetchProfile(user.id),
        supabase.from('tenants').select('name, room, phone, start_date, end_date').eq('user_id', user.id).maybeSingle(),
    ])
    return {
        id: user.id,
        email: user.email,
        username: emailToUsername(user.email),
        role: profile?.role,
        mustChangePassword: Boolean(profile?.must_change_password),
        tenant,
    }
}

// ข้อมูลผู้ใช้ที่ login อยู่: บัญชี, role และข้อมูลผู้เช่า (ถ้าเป็นผู้เช่า)
// คืนค่า null ระหว่างโหลด
export function useCurrentUser() {
    // เริ่มด้วยค่าที่แคชไว้ (ถ้ามี) จะได้ไม่ต้องรอโหลดซ้ำ
    const [info, setInfo] = useState(cached)

    // ยังไม่มีแคช: โหลดข้อมูลผู้ใช้ (ใช้คำขอเดียวร่วมกันทุกคอมโพเนนต์)
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
