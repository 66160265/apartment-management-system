import { supabase } from './supabaseClient'

// เรียก Edge Function admin-users (เฉพาะแอดมิน) แล้วคืนค่า { data } หรือ { error }
export async function callAdminUsers(body) {
    const { data, error } = await supabase.functions.invoke('admin-users', { body })
    if (error) {
        const detail = await error.context?.json?.().catch(() => null)
        return { error: detail?.error || error.message }
    }
    return data?.error ? { error: data.error } : { data }
}
