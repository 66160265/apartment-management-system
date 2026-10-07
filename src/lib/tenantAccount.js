import { supabase } from './supabaseClient'

// Supabase Auth ต้องใช้อีเมล จึงแปลงชื่อผู้ใช้ (เช่น T311) เป็นอีเมลภายในระบบ
// ต้องตรงกับ USERNAME_EMAIL_DOMAIN ของ Edge Function create-tenant
export const USERNAME_EMAIL_DOMAIN = import.meta.env.VITE_USERNAME_EMAIL_DOMAIN || 'apartment.app'

export const usernameToEmail = (username) => `${username.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`

export const makeUsername = (room) => `T${room}`

// เพิ่มผู้เช่า + สร้างบัญชี (ชื่อผู้ใช้ T+เลขห้อง, รหัสผ่าน TP+เลขห้อง+เลขท้ายเบอร์ 4 ตัว)
// ทำใน Edge Function create-tenant เพราะต้องใช้สิทธิ์ admin
// คืนค่า null เมื่อสำเร็จ หรือข้อความ error
export async function createTenantAccount(tenant) {
    const { data, error } = await supabase.functions.invoke('create-tenant', { body: tenant })
    if (error) {
        const body = await error.context?.json?.().catch(() => null)
        return body?.error || `สร้างบัญชีไม่สำเร็จ: ${error.message}`
    }
    return data?.error || null
}
