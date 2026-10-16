import { supabase } from './supabaseClient'

// เรียก Edge Function admin-users (เฉพาะแอดมิน) แล้วคืนค่า { data } หรือ { error }
export async function callAdminUsers(body) {
    const { data, error } = await supabase.functions.invoke('admin-users', { body })
    // เรียกไม่สำเร็จ: พยายามอ่านข้อความ error ที่ฟังก์ชันส่งกลับมา ถ้าอ่านไม่ได้ใช้ข้อความของ client
    if (error) {
        const detail = await error.context?.json?.().catch(() => null)
        return { error: detail?.error || error.message }
    }
    return data?.error ? { error: data.error } : { data }
}
