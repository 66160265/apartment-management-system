// 2026-03-01 -> 1 มี.ค. 69 (วันที่ล้วนอ่านเป็นเวลาท้องถิ่น กันวันเลื่อนในเขตเวลาที่ติดลบ)
export const formatDate = (iso) =>
    iso
        ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
        : '-'

const EXPIRING_DAYS = 30

// สถานะสัญญาเช่าจากวันสิ้นสุดสัญญา: ปกติ / ใกล้หมด (ภายใน 30 วัน) / หมดสัญญา
export function contractStatus(endDate) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days = Math.round((new Date(`${endDate}T00:00:00`) - today) / 86400000)
    if (days < 0) return { key: 'expired', label: 'หมดสัญญา', hint: `เกินมา ${-days} วัน`, days }
    if (days <= EXPIRING_DAYS) return { key: 'expiring', label: 'ใกล้หมดสัญญา', hint: days === 0 ? 'หมดวันนี้' : `อีก ${days} วัน`, days }
    return { key: 'active', label: 'สัญญาปกติ', hint: `อีก ${days} วัน`, days }
}

export const contractStyles = {
    active: { color: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
    expiring: { color: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', dot: 'bg-amber-500' },
    expired: { color: 'bg-red-50 text-red-800 ring-1 ring-red-200', dot: 'bg-red-500' },
}

// เอกสารหลักที่ผู้เช่าต้องมีครบ
export const REQUIRED_DOCS = [
    { type: 'id_card', title: 'สำเนาบัตรประชาชน' },
    { type: 'contract', title: 'สัญญาเช่า' },
    { type: 'deposit_slip', title: 'สลิปมัดจำ' },
]
