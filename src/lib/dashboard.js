import { balanceOf, daysLate, dueDateIso, thaiDateOf } from './billing'

// ตรรกะของหน้าภาพรวมแอดมิน (pages/AdminDashboardPage.jsx) แยกไว้ให้ทดสอบได้

// ใบแจ้งหนี้ที่ "เกินกำหนดชำระ" และผู้เช่ายังต้องจ่าย: สถานะรอชำระ (pending) และเลยวันครบกำหนดแล้ว
// ไม่รวมใบที่ผู้เช่าส่งสลิปแล้วรอแอดมินตรวจ (review) เพราะผู้เช่าจ่ายแล้ว งานค้างอยู่ที่แอดมิน ไม่ใช่ที่ผู้เช่า (ไปอยู่ในแถบ "ต้องจัดการ")
// dueDay = วันครบกำหนดในหน้าตั้งค่า ใช้คำนวณวันครบกำหนดของใบที่ไม่ได้บันทึก due_date ไว้ (ใบที่ออกตอนไม่ได้เปิดค่าปรับ)
// เรียงเกินกำหนดนานสุดก่อน แล้วเลขห้อง
export function overdueInvoices(invoices, now = new Date(), dueDay) {
    return invoices
        .filter((i) => i.status === 'pending')
        .map((i) => ({
            id: i.id,
            room: i.room,
            tenant: i.tenant_name,
            month: i.month,
            balance: balanceOf(i, now),
            daysLate: daysLate(i, now, dueDay),
        }))
        .filter((r) => r.balance > 0 && r.daysLate > 0)
        .sort((a, b) => b.daysLate - a.daysLate || a.room.localeCompare(b.room, undefined, { numeric: true }))
}

// ใบที่ยังรอชำระแต่ยังไม่ถึงวันครบกำหนด (ไม่ใช่ปัญหา แค่บอกให้รู้ว่ามี)
export function notYetDueCount(invoices, now = new Date(), dueDay) {
    return invoices.filter((i) => i.status === 'pending' && balanceOf(i, now) > 0 && daysLate(i, now, dueDay) === 0).length
}

// จำนวนห้องที่ไม่ซ้ำ
export const uniqueRooms = (rows) => new Set(rows.map((r) => r.room)).size

// สัญญาที่หมดแล้วหรือจะหมดภายใน days วัน (tenants = [{ room, end_date }]) เรียงหมดเร็วสุดก่อน
export function expiringContracts(tenants, now = new Date(), days = 30) {
    const today = Date.parse(`${thaiDateOf(now)}T00:00:00Z`)
    return tenants
        .filter((t) => t.end_date)
        .map((t) => ({ room: t.room, endDate: t.end_date, daysLeft: Math.round((Date.parse(`${t.end_date}T00:00:00Z`) - today) / 86400000) }))
        .filter((t) => t.daysLeft <= days)
        .sort((a, b) => a.daysLeft - b.daysLeft)
}

// ห้องที่มีผู้เช่าแต่ยังไม่มีใบแจ้งหนี้ของเดือนนี้ (month 'ปปปป-ดด')
export function uninvoicedRooms(rooms, invoices, month) {
    const invoiced = new Set(invoices.filter((i) => i.month === month).map((i) => i.room))
    return rooms.filter((r) => r.status === 'occupied' && !invoiced.has(r.number))
}

// รายการ "ต้องจัดการตอนนี้" เรียงตามความเร่งด่วน ตัดรายการที่เป็นศูนย์ออก
// input = { reviewInvoices, repairReviews, pendingRepairs, expiringContracts, uninvoicedRooms, slipQuota: { level, used, quota, remaining } }
export function attentionItems(input) {
    return [
        { key: 'invoice-slips', label: 'สลิปค่าห้องรอตรวจสอบ', count: input.reviewInvoices ?? 0, to: '/invoices', tone: 'sky' },
        { key: 'repair-slips', label: 'สลิปค่าซ่อมรอตรวจสอบ', count: input.repairReviews ?? 0, to: '/repairs', tone: 'sky' },
        { key: 'repairs', label: 'เรื่องแจ้งซ่อมรอดำเนินการ', count: input.pendingRepairs ?? 0, to: '/repairs', tone: 'amber' },
        { key: 'uninvoiced', label: 'ห้องที่ยังไม่ออกบิลเดือนนี้', count: input.uninvoicedRooms ?? 0, to: '/invoices', tone: 'amber' },
        { key: 'contracts', label: 'สัญญาใกล้หมด (ภายใน 30 วัน)', count: input.expiringContracts ?? 0, to: '/tenants', tone: 'amber' },
        slipQuotaItem(input.slipQuota),
    ].filter((item) => item && (item.count > 0 || item.keep))
}

// โควตาตรวจสลิปใกล้หมด/หมดแล้ว (level มาจาก quotaStatus) เต็มแล้วแสดงทั้งที่เหลือ 0
function slipQuotaItem(q) {
    if (!q || (q.level !== 'low' && q.level !== 'out')) return null
    return {
        key: 'slip-quota',
        label: q.level === 'out' ? `โควตาตรวจสลิปเดือนนี้หมดแล้ว (ใช้ ${q.used}/${q.quota}) สลิปต้องตรวจด้วยตา` : `ครั้งที่ตรวจสลิปได้ในเดือนนี้ (ใช้ไป ${q.used} จาก ${q.quota})`,
        count: q.remaining,
        amount: 0,
        to: '/settings',
        tone: 'amber',
        keep: true,
    }
}

// วันครบกำหนดของใบ (YYYY-MM-DD): ใช้ due_date ที่บันทึกไว้ ไม่มีก็คำนวณจากวันครบกำหนดในหน้าตั้งค่า
export const invoiceDueDate = (invoice, dueDay) => invoice.due_date || dueDateIso(invoice.month, dueDay || 5)

// ใบที่ผู้เช่าต้องจ่ายอยู่ (รอชำระและยังมียอดเหลือ) เรียงใบเก่าสุดก่อน ใช้ในหน้าภาพรวมผู้เช่า
export function tenantUnpaid(invoices, now = new Date(), dueDay) {
    return invoices
        .filter((i) => i.status === 'pending' && balanceOf(i, now) > 0)
        .map((i) => ({ id: i.id, month: i.month, balance: balanceOf(i, now), daysLate: daysLate(i, now, dueDay), dueDate: invoiceDueDate(i, dueDay) }))
        .sort((a, b) => a.month.localeCompare(b.month))
}
