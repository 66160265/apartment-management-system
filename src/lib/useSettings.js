import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS } from '../data/billing'
import { useRealtimeReload } from './realtime'
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
    slipVerifyMode: 'slip_verify_mode',
    lateFeePerDay: 'late_fee_per_day',
    lateFeeGraceDays: 'late_fee_grace_days',
    lateFeeCap: 'late_fee_cap',
}
// ค่าที่เป็นตัวเลข (ต้องแปลงเป็น Number ทั้งตอนอ่านและบันทึก)
const numeric = new Set(['dueDay', 'rateWater', 'rateElectric', 'commonFee', 'lateFeePerDay', 'lateFeeGraceDays'])

// เพดานค่าปรับ: ว่าง ('' ในฟอร์ม / null ในฐานข้อมูล) = ไม่จำกัด
const capToRow = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

// แปลงแถวจากตาราง app_settings เป็นออบเจ็กต์ตั้งค่า (ช่องที่ว่างใช้ค่าเริ่มต้น)
export function settingsFromRow(row) {
    const result = { ...DEFAULT_SETTINGS }
    if (!row) return result
    for (const [key, column] of Object.entries(columns)) {
        const value = row[column]
        if (value === null || value === undefined) continue
        // ช่องข้อความที่ว่างไว้ ให้ใช้ค่าเริ่มต้นแทน ส่วนตัวเลขยอมรับ 0 ได้
        if (numeric.has(key) || key === 'lateFeeCap') result[key] = Number(value)
        else if (String(value).trim() !== '') result[key] = value
    }
    return result
}

// แปลงออบเจ็กต์ตั้งค่ากลับเป็นแถวสำหรับบันทึก (ตัวเลขแปลงเป็น Number ข้อความตัดช่องว่าง)
export function settingsToRow(values) {
    const row = {}
    for (const [key, column] of Object.entries(columns)) {
        if (values[key] === undefined) continue
        if (key === 'lateFeeCap') row[column] = capToRow(values[key])
        else row[column] = numeric.has(key) ? Number(values[key]) : String(values[key]).trim()
    }
    return row
}

// แคชระดับโมดูล: ค่าที่โหลดแล้ว, คำขอที่กำลังโหลด และคอมโพเนนต์ที่รอฟังค่าใหม่
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
            cached = settingsFromRow(data)
            return cached
        })
    return pending
}

// คอลัมน์ของ app_settings ที่มาจากไฟล์ SQL รุ่นหลัง: ค่าเริ่มต้น (ใช้ตัดสินว่าข้ามได้ไหม) และไฟล์ที่ต้องรัน
const optionalColumns = {
    slip_verify_mode: { isDefault: (v) => v === undefined || v === 'off', sql: 'supabase/slip-verify.sql' },
    late_fee_per_day: { isDefault: (v) => v === undefined || Number(v) === 0, sql: 'supabase/payments.sql' },
    late_fee_grace_days: { isDefault: (v) => v === undefined || Number(v) === 0, sql: 'supabase/payments.sql' },
    late_fee_cap: { isDefault: (v) => v === undefined || v === null, sql: 'supabase/payments.sql' },
}

// บันทึกการตั้งค่า (เฉพาะแอดมิน) คืนค่า null เมื่อสำเร็จ หรือข้อความ error
export async function saveSettings(values) {
    const row = { id: 1, ...settingsToRow(values), updated_at: new Date().toISOString() }
    let { error } = await supabase.from('app_settings').upsert(row)
    // คอลัมน์ที่เพิ่มทีหลัง (ต้องรัน SQL ก่อน) ถ้ายังไม่มีในฐานข้อมูลและค่าที่บันทึกเป็นค่าเริ่มต้น ให้ข้ามคอลัมน์นั้นแล้วบันทึกที่เหลือต่อ
    // ถ้าผู้ใช้ตั้งค่าที่ไม่ใช่ค่าเริ่มต้น (เช่น เปิดโหมดตรวจสลิป ตั้งค่าปรับ) ให้แจ้งว่าต้องรัน SQL ก่อน ไม่บันทึกแบบเงียบ ๆ
    for (let attempt = 0; error && attempt < 5; attempt++) {
        const column = Object.keys(optionalColumns).find((c) => error.message.includes(c))
        if (!column) break
        const { isDefault, sql } = optionalColumns[column]
        if (!isDefault(row[column])) return `บันทึกไม่ได้ เพราะฐานข้อมูลยังไม่มีคอลัมน์ ${column} กรุณารัน ${sql} ใน SQL Editor ก่อน`
        delete row[column]
        ;({ error } = await supabase.from('app_settings').upsert(row))
    }
    if (error) return `บันทึกไม่สำเร็จ: ${error.message}`
    // บันทึกสำเร็จ: อัปเดตแคชและแจ้งทุกหน้าที่ใช้ useSettings ให้แสดงค่าใหม่ทันที
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

// โหลดค่าตั้งค่าใหม่แล้วแจ้งทุกหน้า (หลายหน้าฟังพร้อมกัน แต่โหลดครั้งเดียว) ใช้ตอนมีคนแก้การตั้งค่าที่เครื่องอื่น
let reloading = null
function reloadSettings() {
    reloading ??= loadSettings(true)
        .then((result) => {
            listeners.forEach((l) => l(result))
            return result
        })
        .catch(() => {})
        .finally(() => {
            reloading = null
        })
    return reloading
}

// hook อ่านค่าตั้งค่าหอพัก และอัปเดตอัตโนมัติเมื่อมีการบันทึกใหม่
export function useSettings() {
    const [settings, setSettings] = useState(cached ?? DEFAULT_SETTINGS)

    // โหลดค่าตั้งค่า และฟังการเปลี่ยนแปลงหลังบันทึก
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

    // อัปเดตเองเมื่อแอดมินแก้การตั้งค่า (เช่น เปลี่ยนบัญชีรับเงิน อัตราค่าน้ำไฟ) ผู้เช่าที่เปิดหน้าอยู่เห็นค่าใหม่ทันที
    useRealtimeReload(['app_settings'], reloadSettings)

    return settings
}
