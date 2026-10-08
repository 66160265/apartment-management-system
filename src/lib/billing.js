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
