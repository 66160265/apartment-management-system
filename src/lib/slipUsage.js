import { supabase } from './supabaseClient'
import { thaiDateOf } from './billing'

// ตัวนับการตรวจสลิปด้วย EasySlip ของเดือนนี้ (ตาราง slip_verify_log ดู supabase/migrations/20261022030000_slip_quota.sql)
// นับตอนจองสิทธิ์ตรวจ จึงอาจมากกว่าที่ EasySlip นับเล็กน้อย (เช่น รูปใหญ่เกิน 4MB ที่ข้ามก่อนเรียก)

// เวลาเริ่มต้นเดือนปัจจุบันตามเวลาไทย (ISO UTC) ใช้เป็นขอบล่างของการนับ
export function monthStartIso(now = new Date()) {
    return new Date(`${thaiDateOf(now).slice(0, 7)}-01T00:00:00+07:00`).toISOString()
}

// จำนวนครั้งที่ตรวจในเดือนนี้ คืน null ถ้ายังไม่มีตาราง (ยังไม่ได้รัน migration) หรืออ่านไม่ได้ (ไม่ใช่แอดมิน)
export async function fetchSlipUsage(now = new Date()) {
    try {
        const { count, error } = await supabase
            .from('slip_verify_log')
            .select('id', { count: 'exact', head: true })
            .gte('at', monthStartIso(now))
        return error ? null : (count ?? 0)
    } catch {
        return null
    }
}

// สถานะโควตา: none = ไม่ตั้งโควตาหรือไม่รู้จำนวนที่ใช้, ok, low = ใช้ไปตั้งแต่ 80%, out = เต็มแล้ว
export function quotaStatus(used, quota) {
    const q = Number(quota)
    if (used === null || used === undefined || quota === '' || quota === null || quota === undefined || !(q > 0)) {
        return { level: 'none', remaining: null }
    }
    const remaining = Math.max(0, q - used)
    if (used >= q) return { level: 'out', remaining }
    if (used >= q * 0.8) return { level: 'low', remaining }
    return { level: 'ok', remaining }
}
