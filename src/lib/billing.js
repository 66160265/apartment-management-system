import { supabase } from './supabaseClient'

// ใช้เวลาท้องถิ่นของเครื่อง (toISOString เป็น UTC ทำให้ช่วง 00:00-07:00 ของวันที่ 1 ในไทยได้เดือนก่อนหน้า)
export const currentMonth = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 2026-06 -> มิ.ย. 69
export const formatMonth = (month) =>
    new Date(`${month}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })

export const formatDateTime = (iso) =>
    iso
        ? new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '-'

export const baht = (n) => `฿${Number(n).toLocaleString('th-TH')}`

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
    const numbers = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
    const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']
    const [intPart, decPart = ''] = Number(num).toFixed(2).split('.')

    function readSection(str) {
        let result = ''
        const len = str.length
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

    let result = readSection(intPart) + 'บาท'
    if (!decPart || decPart === '00') result += 'ถ้วน'
    else result += readSection(decPart) + 'สตางค์'
    return result
}
