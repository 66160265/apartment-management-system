import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS } from '../data/billing'
import { supabase } from './supabaseClient'

// ตั้งค่าหอพักจากตาราง app_settings แถวเดียว (id = 1) ใช้ค่าเริ่มต้นถ้ายังไม่มีตาราง/ยังไม่ได้ตั้งค่า
// เก็บไว้ระดับโมดูลให้ทุกหน้าใช้ร่วมกัน ไม่ต้องดึงซ้ำทุกครั้งที่เปลี่ยนหน้า

const columns = {
    apartmentName: 'apartment_name',
    apartmentNameEn: 'apartment_name_en',
    address: 'address',
    phone: 'phone',
    email: 'email',
    bankName: 'bank_name',
    bankAccount: 'bank_account',
    bankHolder: 'bank_holder',
    promptpayId: 'promptpay_id',
    dueDay: 'due_day',
    rateWater: 'rate_water',
    rateElectric: 'rate_electric',
    commonFee: 'common_fee',
}
const numeric = new Set(['dueDay', 'rateWater', 'rateElectric', 'commonFee'])

function fromRow(row) {
    const result = { ...DEFAULT_SETTINGS }
    if (!row) return result
    for (const [key, column] of Object.entries(columns)) {
        const value = row[column]
        if (value === null || value === undefined) continue
        // ช่องข้อความที่ว่างไว้ ให้ใช้ค่าเริ่มต้นแทน ส่วนตัวเลขยอมรับ 0 ได้
        if (numeric.has(key)) result[key] = Number(value)
        else if (String(value).trim() !== '') result[key] = value
    }
    return result
}

function toRow(values) {
    const row = {}
    for (const [key, column] of Object.entries(columns)) {
        if (values[key] !== undefined) row[column] = numeric.has(key) ? Number(values[key]) : String(values[key]).trim()
    }
    return row
}

let cached = null
let pending = null
const listeners = new Set()

// โหลดครั้งเดียวแล้วจำไว้ (force = true เพื่อดึงใหม่)
export function loadSettings(force = false) {
    if (force) {
        cached = null
        pending = null
    }
    pending ??= supabase
        .from('app_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle()
        .then(({ data }) => {
            cached = fromRow(data)
            return cached
        })
    return pending
}

// บันทึกการตั้งค่า (เฉพาะแอดมิน) คืนค่า null เมื่อสำเร็จ หรือข้อความ error
export async function saveSettings(values) {
    const { error } = await supabase.from('app_settings').upsert({ id: 1, ...toRow(values), updated_at: new Date().toISOString() })
    if (error) return `บันทึกไม่สำเร็จ: ${error.message}`
    cached = { ...DEFAULT_SETTINGS, ...values }
    pending = Promise.resolve(cached)
    listeners.forEach((l) => l(cached))
    return null
}

// ออกจากระบบ/เปลี่ยนบัญชี: ล้างค่าที่จำไว้
supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        cached = null
        pending = null
    }
})

export function useSettings() {
    const [settings, setSettings] = useState(cached ?? DEFAULT_SETTINGS)

    useEffect(() => {
        let active = true
        loadSettings().then((result) => {
            if (active) setSettings(result)
        })
        listeners.add(setSettings)
        return () => {
            active = false
            listeners.delete(setSettings)
        }
    }, [])

    return settings
}
