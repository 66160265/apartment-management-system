import { balanceOf, formatMonth } from './billing'
import { addMonthsIso } from './contracts'

// ย้ายออกและคืนเงินประกัน (components/MoveOutSection.jsx, supabase/migrations/20261022000000_initial_schema.sql (ส่วน move-out)): ตรรกะฝั่งเว็บ ใช้แสดงตัวอย่างยอดก่อนบันทึก
// ยอดจริงคำนวณโดยฟังก์ชัน record_move_out ในฐานข้อมูล สูตรต้องตรงกัน (เทสต์เทียบกับค่าที่ฐานข้อมูลให้ไว้ในชุดทดสอบ SQL)

const round2 = (n) => Math.round(Number(n) * 100) / 100

// สรุปยอด: เงินประกัน - ยอดหัก = ยอดคืน (ไม่ต่ำกว่า 0) ถ้าหักเกิน = ยอดที่ผู้เช่าต้องจ่ายเพิ่ม
export function settlement(deposit, deductions) {
    const dep = round2(deposit || 0)
    const total = round2(deductions.reduce((acc, d) => acc + Number(d.amount || 0), 0))
    return {
        deposit: dep,
        total,
        refund: Math.max(0, round2(dep - total)),
        owed: Math.max(0, round2(total - dep)),
    }
}

// ใบแจ้งหนี้เป็นของผู้เช่าคนนี้ไหม: ห้องเดียวกันและผูกกับบัญชีเดียวกัน (ใบของผู้เช่าคนก่อนในห้องเดียวกันไม่นับ)
// owner = { room, userId } ผู้เช่าที่ไม่มีบัญชี = ไม่มีใบของตัวเอง
const ownedBy = (invoice, { room, userId }) => Boolean(userId) && invoice.room === room && invoice.user_id === userId

// ใบแจ้งหนี้ที่ยังค้างของผู้เช่าคนนี้ ที่หักจากเงินประกันได้ (ต้องอยู่ในสถานะรอชำระ ใบที่รอตรวจสลิปต้องจัดการก่อน)
// ยอดคือยอดค้างรวมค่าปรับของวันนี้ เรียงเดือนเก่าก่อน
export function unpaidInvoicesOf(invoices, owner, now = new Date()) {
    return invoices
        .filter((i) => ownedBy(i, owner) && i.status === 'pending')
        .map((i) => ({ id: i.id, month: i.month, label: `ค่าเช่าและค่าบริการ เดือน ${formatMonth(i.month)}`, balance: balanceOf(i, now) }))
        .filter((i) => i.balance > 0)
        .sort((a, b) => a.month.localeCompare(b.month))
}

// ใบแจ้งหนี้ของผู้เช่าคนนี้ที่รอตรวจสลิป (ต้องจัดการก่อนย้ายออก) ใช้เตือนแอดมิน
export const reviewingInvoicesOf = (invoices, owner) => invoices.filter((i) => ownedBy(i, owner) && i.status === 'review')

// ตรวจรายการหักที่กรอกเอง คืนข้อความ error หรือสตริงว่าง (แถวที่ว่างทั้งคู่ไม่นับ)
export function validateCustoms(customs) {
    for (const c of customs) {
        const label = (c.label ?? '').trim()
        const blankAmount = c.amount === '' || c.amount === null || c.amount === undefined
        if (!label && blankAmount) continue
        if (!label) return 'กรุณาระบุชื่อรายการหัก'
        if (label.length > 100) return 'ชื่อรายการหักยาวเกิน 100 ตัวอักษร'
        const amount = Number(c.amount)
        if (blankAmount || !Number.isFinite(amount) || amount <= 0) return `ยอดของรายการ "${label}" ต้องมากกว่า 0`
    }
    return ''
}

// รายการหักที่ส่งให้ record_move_out: ใบแจ้งหนี้ที่เลือก (ผูก invoice_id) + รายการที่กรอกเอง (แถวว่างข้าม)
export function buildDeductions(selectedInvoices, customs) {
    return [
        ...selectedInvoices.map((i) => ({ label: i.label, amount: round2(i.balance), invoice_id: i.id })),
        ...customs
            .filter((c) => (c.label ?? '').trim() !== '' || (c.amount !== '' && c.amount !== null && c.amount !== undefined))
            .map((c) => ({ label: c.label.trim(), amount: round2(c.amount) })),
    ]
}

// ---- ไม่คืนเงินประกันถ้าย้ายออกก่อนครบสัญญาปีแรก ----

// อยู่ครบสัญญาปีแรกเมื่อไหร่ (วันเริ่มสัญญา + 12 เดือน) ไม่มีวันเริ่ม = null
export const firstYearEnd = (startDate) => (startDate ? addMonthsIso(startDate, 12) : null)

// ย้ายออกก่อนครบปีแรก = ไม่คืนเงินประกัน
export const forfeitsDeposit = (startDate, moveOutDate) => {
    const end = firstYearEnd(startDate)
    return Boolean(end && moveOutDate && moveOutDate < end)
}

export const FORFEIT_LABEL = 'ไม่คืนเงินประกัน (ย้ายออกก่อนครบสัญญา 1 ปี)'

// รายการหักส่วนที่ไม่คืน: เงินประกันที่เหลือหลังหักรายการอื่น (ยอดคืนจึงเป็น 0) ไม่มีเหลือ = ไม่มีรายการ
export function forfeitDeduction(deposit, deductions) {
    const left = round2(Number(deposit || 0) - deductions.reduce((acc, d) => acc + Number(d.amount || 0), 0))
    return left > 0 ? [{ label: FORFEIT_LABEL, amount: left }] : []
}

// ผลของการย้ายออกเป็นข้อความสั้นสำหรับรายการ/รายงาน
export function moveOutOutcome(m) {
    if (Number(m.owed_amount) > 0) return { key: 'owed', amount: Number(m.owed_amount) }
    if (m.refund_status === 'pending') return { key: 'refund_pending', amount: Number(m.refund_amount) }
    if (m.refund_status === 'done') return { key: 'refund_done', amount: Number(m.refund_amount) }
    return { key: 'none', amount: 0 }
}
