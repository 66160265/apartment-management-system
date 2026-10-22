import { thaiDateOf } from './billing'
import { supabase } from './supabaseClient'

// ต่อสัญญาเช่า (ฟังก์ชัน renew_contract ในไฟล์ supabase/migrations/20261022000000_initial_schema.sql ส่วน contracts-announcements)
// แอดมินเป็นผู้ต่อ ต่ออย่างเดียว วันเริ่มสัญญากับเงินประกันไม่เปลี่ยน

// บวกเดือนให้วันที่ (YYYY-MM-DD) ถ้าเดือนปลายทางสั้นกว่า ใช้วันสุดท้ายของเดือนนั้น (31 ม.ค. + 1 เดือน = 28/29 ก.พ.)
export function addMonthsIso(iso, months) {
    const [y, m, d] = iso.split('-').map(Number)
    const target = new Date(Date.UTC(y, m - 1 + months, 1))
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
    target.setUTCDate(Math.min(d, lastDay))
    return target.toISOString().slice(0, 10)
}

// ตัวเลือกต่อสัญญาแบบเร็ว นับต่อจากวันสิ้นสุดเดิม (สัญญาต่อเนื่องกัน)
export const RENEWAL_CHOICES = [
    { key: '6m', label: 'ต่อ 6 เดือน', months: 6 },
    { key: '12m', label: 'ต่อ 1 ปี', months: 12 },
]

export const renewalOptions = (endIso) => RENEWAL_CHOICES.map((c) => ({ ...c, date: addMonthsIso(endIso, c.months) }))

// จำนวนวันจาก a ถึง b (YYYY-MM-DD)
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)

// ตรวจวันสิ้นสุดใหม่ก่อนส่ง (ตรงกับเงื่อนไขใน renew_contract) คืนข้อความ error หรือสตริงว่าง
export function validateRenewal(currentEnd, newEnd, today = thaiDateOf(new Date())) {
    if (!newEnd) return 'กรุณาเลือกวันสิ้นสุดสัญญาใหม่'
    if (newEnd <= currentEnd) return 'วันสิ้นสุดสัญญาใหม่ต้องหลังวันสิ้นสุดเดิม'
    if (daysBetween(today, newEnd) > 3650) return 'วันสิ้นสุดสัญญาใหม่ไกลเกินไป (เกิน 10 ปีนับจากวันนี้)'
    return ''
}

// วันสิ้นสุดใหม่ที่ผ่านมาแล้ว (สัญญาที่หมดไปนานแล้วต่อสั้น ๆ) ยังต่อได้แต่ควรเตือน
export const isAlreadyPast = (newEnd, today = thaiDateOf(new Date())) => newEnd < today

// จำนวนเดือนเต็มที่ต่อเพิ่ม = เดือนมากสุดที่บวกจากวันเดิมแล้วยังไม่เกินวันใหม่ (ใช้การบวกเดือนตัวเดียวกับตัวเลือกต่อสัญญา จึงตรงกัน
// เช่น 31 ธ.ค. -> 30 มิ.ย. ถือว่า 6 เดือน) วันใหม่ไม่หลังวันเดิม = 0
export function monthsAdded(currentEnd, newEnd) {
    if (newEnd <= currentEnd) return 0
    let months = 0
    while (addMonthsIso(currentEnd, months + 1) <= newEnd) months += 1
    return months
}

// ต่อสัญญา: คืนข้อความ error หรือ null เมื่อสำเร็จ
export async function renewContract(room, newEnd, note) {
    const { error } = await supabase.rpc('renew_contract', { p_room: room, p_new_end: newEnd, p_note: note ?? '' })
    return error ? error.message : null
}

// ประวัติการต่อสัญญา (ใหม่ไปเก่า) ของห้องหนึ่ง (แอดมิน) หรือของตัวเอง (ผู้เช่า ส่ง room = undefined) ไม่มีตาราง/อ่านไม่ได้ = null
export async function loadRenewals(room) {
    let query = supabase
        .from('contract_renewals')
        .select('id, room, previous_end_date, new_end_date, note, created_at')
        .order('created_at', { ascending: false })
    if (room) query = query.eq('room', room)
    const { data, error } = await query
    return error ? null : (data ?? [])
}
