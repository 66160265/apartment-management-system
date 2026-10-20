import { supabase } from './supabaseClient'

// ใช้เวลาท้องถิ่นของเครื่อง (toISOString เป็น UTC ทำให้ช่วง 00:00-07:00 ของวันที่ 1 ในไทยได้เดือนก่อนหน้า)
export const currentMonth = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 2026-06 -> มิ.ย. 69
export const formatMonth = (month) =>
    new Date(`${month}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })

// แสดงวันที่และเวลาแบบไทย เช่น 1 ต.ค. 69 14:30
export const formatDateTime = (iso) =>
    iso
        ? new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '-'

// แสดงจำนวนเงินพร้อมสัญลักษณ์บาท เช่น ฿4,500
export const baht = (n) => `฿${Number(n).toLocaleString('th-TH')}`

// ปัดเป็นสตางค์ กันเลขทศนิยมคลาดเคลื่อน (เช่น 0.1 + 0.2)
const round2 = (n) => Math.round(Number(n) * 100) / 100

// ---- ค่าปรับชำระล่าช้า (ต้องตรงกับ invoice_late_fee ใน supabase/payments.sql) ----
// ใบแจ้งหนี้จำค่าตั้งค่าไว้ตอนออกใบ: due_date วันครบกำหนด, late_fee_rate บาท/วัน, late_fee_grace วันผ่อนผัน, late_fee_cap เพดาน (null = ไม่จำกัด)
// ค่าปรับ = อัตรา x max(0, (วันที่คิด - วันครบกำหนด) - วันผ่อนผัน) ไม่เกินเพดาน อัตรา 0 หรือไม่มี due_date = ไม่คิด

// วันที่ปฏิทินไทย (YYYY-MM-DD) ของเวลาหนึ่ง
export const thaiDateOf = (date) => new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10)

// จำนวนวันจาก a ถึง b (YYYY-MM-DD)
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)

// ค่าปรับ ณ วันที่ asOf (YYYY-MM-DD)
export function lateFeeAt(invoice, asOf) {
    const rate = Number(invoice.late_fee_rate ?? 0)
    if (!(rate > 0) || !invoice.due_date || !asOf) return 0
    const days = Math.max(0, daysBetween(invoice.due_date, asOf) - Number(invoice.late_fee_grace ?? 0))
    let fee = rate * days
    const cap = invoice.late_fee_cap
    if (cap !== null && cap !== undefined && cap !== '') fee = Math.min(fee, Number(cap))
    return Math.round(fee * 100) / 100
}

// ค่าปรับของใบแจ้งหนี้ตอนนี้: ใบที่ชำระครบแล้วใช้ค่าที่คิดจริงตอนชำระ (late_fee) ใบอื่นคำนวณสดตามวันนี้
export function lateFeeOf(invoice, now = new Date()) {
    if (invoice.status === 'paid') return Math.round(Number(invoice.late_fee ?? 0) * 100) / 100
    return lateFeeAt(invoice, thaiDateOf(now))
}

// เกินกำหนดชำระกี่วัน (0 = ยังไม่เกิน หรือชำระแล้ว หรือบิลเก่าที่ไม่มีวันครบกำหนด)
export function daysLate(invoice, now = new Date()) {
    if (invoice.status === 'paid' || !invoice.due_date) return 0
    return Math.max(0, daysBetween(invoice.due_date, thaiDateOf(now)))
}

// วันที่ที่ใช้คิดค่าปรับของสลิปที่ส่งมา = วันที่ส่งสลิป หรือวันที่โอนในผลตรวจสลิป อย่างใดอย่างหนึ่งที่เร็วกว่า (ต้องตรงกับ asof_date ในฐานข้อมูล)
export function slipAsOf(invoice, now = new Date()) {
    const uploaded = invoice.slip_uploaded_at ? new Date(invoice.slip_uploaded_at) : now
    const transfer = invoice.verify_detail?.date ? new Date(invoice.verify_detail.date) : null
    const up = thaiDateOf(uploaded)
    if (!transfer || Number.isNaN(transfer.getTime())) return up
    const tr = thaiDateOf(transfer)
    return tr < up ? tr : up
}

// วันครบกำหนดชำระ (YYYY-MM-DD) = วันที่ dueDay ของเดือนถัดไป (month 'ปปปป-ดด')
export const dueDateIso = (month, dueDay) => {
    const [y, m] = month.split('-').map(Number)
    return new Date(Date.UTC(y, m, dueDay)).toISOString().slice(0, 10)
}

// ค่าที่ต้องจำลงใบแจ้งหนี้ใหม่ ตามการตั้งค่าตอนนั้น (เปิดใช้เมื่ออัตรา > 0 ไม่งั้นคืนว่าง ใบจึงไม่แตะคอลัมน์ใหม่เมื่อไม่ได้ใช้ค่าปรับ)
export function lateFeeSnapshot(settings, month) {
    const rate = Number(settings.lateFeePerDay)
    if (!(rate > 0)) return {}
    const cap = settings.lateFeeCap
    return {
        due_date: dueDateIso(month, Number(settings.dueDay) || 5),
        late_fee_rate: rate,
        late_fee_grace: Math.max(0, Math.floor(Number(settings.lateFeeGraceDays) || 0)),
        late_fee_cap: cap === '' || cap === null || cap === undefined ? null : Number(cap),
    }
}

// ยอดที่ได้รับแล้วของใบแจ้งหนี้ (ผู้เช่าโอนหลายครั้งได้ ดู supabase/payments.sql) ใบเก่าที่ไม่มีช่องนี้ถือว่า 0
export const paidOf = (invoice) => round2(invoice.paid_amount ?? 0)

// ยอดคงเหลือที่ต้องชำระ ณ ตอนนี้ (ไม่ติดลบ) = ยอดบิล + ค่าปรับล่าช้าวันนี้ - ที่ได้รับแล้ว ใช้เป็นยอดใน QR พร้อมเพย์และข้อความ "ยอดที่ต้องชำระ"
export const balanceOf = (invoice, now = new Date()) => Math.max(0, round2(Number(invoice.total) + lateFeeOf(invoice, now) - paidOf(invoice)))

// ยอดที่ต้องชำระสำหรับสลิปที่ส่งมา (คิดค่าปรับ ณ วันที่ slipAsOf) ใช้เป็นยอดตั้งต้นตอนแอดมินยืนยันสลิป
export const balanceAtSlip = (invoice, now = new Date()) =>
    Math.max(0, round2(Number(invoice.total) + lateFeeAt(invoice, slipAsOf(invoice, now)) - paidOf(invoice)))

// ชำระบางส่วน: ได้รับเงินบางส่วนแล้วแต่ยังไม่ครบ (สถานะยังเป็นรอชำระ/รอตรวจสอบ)
export const isPartiallyPaid = (invoice) => invoice.status !== 'paid' && paidOf(invoice) > 0

// คำนวณยอดใบแจ้งหนี้จากค่าเช่า มิเตอร์ และอัตราค่าบริการ
export function calcInvoice({ rent, waterPrev, waterCurr, elecPrev, elecCurr, waterRate, elecRate, commonFee }) {
    const waterUnits = Math.max(0, waterCurr - waterPrev)
    const elecUnits = Math.max(0, elecCurr - elecPrev)
    const water = waterUnits * waterRate
    const elec = elecUnits * elecRate
    return { waterUnits, elecUnits, water, elec, total: rent + water + elec + commonFee }
}

// ลิงก์ชั่วคราวสำหรับดูรูปสลิป (bucket เป็น private)
export async function getSlipUrl(path) {
    const { data } = await supabase.storage.from('slips').createSignedUrl(path, 300)
    return data?.signedUrl ?? null
}

// เลขที่ใบแจ้งหนี้ เช่น INV-101-202610
export const invoiceCode = (invoice) => `INV-${invoice.room}-${invoice.month.replace('-', '')}`

// วันครบกำหนดชำระ: วันที่ dueDay ของเดือนถัดไป
export function dueDateOf(month, dueDay = 5) {
    const [y, m] = month.split('-').map(Number)
    return new Date(y, m, dueDay)
}

// 1 ต.ค. 69 (วันที่ล้วน YYYY-MM-DD อ่านเป็นเวลาท้องถิ่น)
export const formatShortDate = (value) => {
    if (!value) return '-'
    const d = value instanceof Date ? value : new Date(typeof value === 'string' && value.length === 10 ? `${value}T00:00:00` : value)
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

// แปลงตัวเลขเป็นข้อความบาทภาษาไทย เช่น 4531 -> สี่พันห้าร้อยสามสิบเอ็ดบาทถ้วน
export function thaiBahtText(num) {
    if (!num || isNaN(num)) return 'ศูนย์บาทถ้วน'
    // คำอ่านตัวเลขและหลัก (หน่วย สิบ ร้อย ...)
    const numbers = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
    const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']
    // แยกส่วนบาทและสตางค์ (ปัดทศนิยม 2 ตำแหน่ง)
    const [intPart, decPart = ''] = Number(num).toFixed(2).split('.')

    // อ่านตัวเลขหนึ่งช่วง (ไม่เกินหลักล้าน) เป็นคำภาษาไทย
    function readSection(str) {
        let result = ''
        const len = str.length
        // อ่านทีละหลักจากซ้ายไปขวา: หลักหน่วยที่เป็น 1 อ่าน "เอ็ด", หลักสิบที่เป็น 2 อ่าน "ยี่", หลักสิบที่เป็น 1 อ่านแค่ "สิบ"
        for (let i = 0; i < len; i++) {
            const digit = Number(str[i])
            const pos = len - i - 1
            if (digit === 0) continue
            if (pos === 0 && digit === 1 && len > 1) result += 'เอ็ด'
            else if (pos === 1 && digit === 2) result += 'ยี่สิบ'
            else if (pos === 1 && digit === 1) result += 'สิบ'
            else result += numbers[digit] + positions[pos]
        }
        return result
    }

    // ประกอบข้อความ: ไม่มีสตางค์ลงท้ายด้วย "ถ้วน" มีสตางค์อ่านต่อท้าย
    let result = readSection(intPart) + 'บาท'
    if (!decPart || decPart === '00') result += 'ถ้วน'
    else result += readSection(decPart) + 'สตางค์'
    return result
}
