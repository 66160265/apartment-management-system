import { balanceOf, daysLate, thaiDateOf } from './billing'

// รายงานและส่งออก CSV (หน้า pages/ReportsPage.jsx) ตรรกะล้วน ๆ ไม่ต่อฐานข้อมูล ทดสอบได้
// รายรับนับตามวันที่ "ได้รับเงินจริง" (วันที่ยืนยันสลิป เวลาไทย) ไม่ใช่เดือนของใบแจ้งหนี้

// เดือนปฏิทินไทย (YYYY-MM) ของเวลาหนึ่ง
export const monthOf = (iso) => (iso ? thaiDateOf(new Date(iso)).slice(0, 7) : '')

// รายการเดือนย้อนหลัง count เดือน นับจาก endMonth (รวมเดือนนั้น) เรียงจากใหม่ไปเก่า
export function recentMonths(endMonth, count = 12) {
    const [y, m] = endMonth.split('-').map(Number)
    return Array.from({ length: count }, (_, i) => {
        const d = new Date(Date.UTC(y, m - 1 - i, 1))
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    })
}

const sum = (list, pick) => Math.round(list.reduce((acc, x) => acc + Number(pick(x) || 0), 0) * 100) / 100

// สรุปรายเดือน
// data = { invoices, invoicePayments, repairPayments } (invoicePayments: invoice_payments, repairPayments: เฉพาะที่ชำระแล้วจาก repair_payments)
export function monthlySummary(data, month, now = new Date()) {
    const issued = data.invoices.filter((i) => i.month === month)
    const unpaid = issued.filter((i) => i.status !== 'paid')
    return {
        month,
        issuedCount: issued.length,
        billed: sum(issued, (i) => i.total),
        // ค่าปรับที่คิดจริงของใบเดือนนี้ที่ชำระครบแล้ว
        lateFees: sum(issued.filter((i) => i.status === 'paid'), (i) => i.late_fee),
        // เงินที่ได้รับจริงในเดือนนี้ (ค่าห้อง รวมค่าปรับ) และค่าซ่อม
        received: sum(data.invoicePayments.filter((p) => monthOf(p.confirmed_at) === month), (p) => p.amount),
        repairReceived: sum(data.repairPayments.filter((p) => p.status === 'paid' && monthOf(p.reviewed_at) === month), (p) => p.amount),
        // โอนคืนยอดเกินที่ทำจริงในเดือนนี้
        refunded: sum(data.invoices.filter((i) => i.refund_status === 'done' && monthOf(i.refunded_at) === month), (i) => i.refund_amount),
        // ยอดค้างของใบเดือนนี้ ณ ตอนนี้ (รวมค่าปรับของวันนี้)
        outstanding: sum(unpaid, (i) => balanceOf(i, now)),
        unpaidCount: unpaid.length,
    }
}

// สรุปหลายเดือน (เรียงตามลำดับ months ที่ส่งมา)
export const monthlyRows = (data, months, now = new Date()) => months.map((m) => monthlySummary(data, m, now))

// ใบแจ้งหนี้ที่ยังต้องชำระ เรียงจากเกินกำหนดนานสุด แล้วเดือนเก่าสุด
// dueDay = วันครบกำหนดจากหน้าตั้งค่า ใช้กับใบที่ไม่ได้บันทึก due_date (ดู daysLate)
export function outstandingRows(invoices, now = new Date(), dueDay) {
    return invoices
        .filter((i) => i.status !== 'paid')
        .map((i) => ({
            room: i.room,
            tenant: i.tenant_name,
            month: i.month,
            total: Number(i.total),
            paid: Number(i.paid_amount ?? 0),
            balance: balanceOf(i, now),
            daysLate: daysLate(i, now, dueDay),
            status: i.status,
        }))
        .filter((r) => r.balance > 0)
        .sort((a, b) => b.daysLate - a.daysLate || a.month.localeCompare(b.month) || a.room.localeCompare(b.room, undefined, { numeric: true }))
}

// ห้องพัก: จำนวนตามสถานะ และอัตราเข้าพัก (ห้องมีผู้เช่า / ห้องทั้งหมดที่ไม่ได้ปิดปรับปรุง)
export function occupancy(rooms) {
    const count = (s) => rooms.filter((r) => r.status === s).length
    const available = rooms.length - count('maintenance')
    return {
        total: rooms.length,
        occupied: count('occupied'),
        vacant: count('vacant'),
        maintenance: count('maintenance'),
        rate: available > 0 ? Math.round((count('occupied') / available) * 1000) / 10 : 0,
    }
}

// ---- การใช้น้ำ-ไฟ ----

// สรุปการใช้น้ำ-ไฟของใบแจ้งหนี้ชุดหนึ่ง (เช่น ของเดือนเดียว) ค่าบาทคิดทีละใบตามอัตราของใบนั้น
export function utilityStats(invoices) {
    let waterUnits = 0
    let elecUnits = 0
    let waterCost = 0
    let elecCost = 0
    for (const i of invoices) {
        const w = Math.max(0, (i.water_curr || 0) - (i.water_prev || 0))
        const e = Math.max(0, (i.elec_curr || 0) - (i.elec_prev || 0))
        waterUnits += w
        elecUnits += e
        waterCost += w * Number(i.water_rate || 0)
        elecCost += e * Number(i.elec_rate || 0)
    }
    const round = (n) => Math.round(n * 100) / 100
    return {
        waterUnits,
        elecUnits,
        waterCost: round(waterCost),
        elecCost: round(elecCost),
        totalCost: round(waterCost + elecCost),
        // อัตราเฉลี่ยต่อหน่วย (ใบต่างอัตรากันได้ จึงแสดงเป็นค่าเฉลี่ย ไม่ใช้อัตราของใบใดใบหนึ่ง) ไม่มีหน่วย = null
        waterAvgRate: waterUnits > 0 ? round(waterCost / waterUnits) : null,
        elecAvgRate: elecUnits > 0 ? round(elecCost / elecUnits) : null,
    }
}

// หน่วยที่ใช้รายห้อง เรียงตามเลขห้อง
export function roomUsage(invoices) {
    return invoices
        .map((i) => ({
            room: i.room,
            tenant: i.tenant_name,
            water: Math.max(0, (i.water_curr || 0) - (i.water_prev || 0)),
            electric: Math.max(0, (i.elec_curr || 0) - (i.elec_prev || 0)),
        }))
        .sort((a, b) => String(a.room).localeCompare(String(b.room), undefined, { numeric: true }))
}

export const utilityColumns = [
    { header: 'ห้อง', value: (r) => r.room },
    { header: 'ผู้เช่า', value: (r) => r.tenant },
    { header: 'น้ำ (หน่วย)', value: (r) => r.water },
    { header: 'ไฟ (หน่วย)', value: (r) => r.electric },
]

// ---- CSV ----

// กัน CSV injection: ข้อความที่ขึ้นต้นด้วย = + - @ หรือแท็บ/ขึ้นบรรทัด Excel จะตีความเป็นสูตร จึงนำหน้าด้วย ' (ตัวเลขจริงไม่ถูกแก้)
const csvCell = (v) => {
    if (v === null || v === undefined) return ''
    let s = typeof v === 'number' ? String(v) : String(v)
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// columns = [{ header, value: (row) => ... }] คืนข้อความ CSV (ขึ้นบรรทัดแบบ CRLF ตามมาตรฐาน ไม่ใส่ BOM ให้ตอนดาวน์โหลดใส่ให้)
export function toCsv(rows, columns) {
    const lines = [columns.map((c) => csvCell(c.header)).join(',')]
    for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','))
    return lines.join('\r\n')
}

const statusLabels = { pending: 'รอชำระ', review: 'รอตรวจสอบ', paid: 'ชำระแล้ว' }

export const invoiceColumns = [
    { header: 'เดือน', value: (i) => i.month },
    { header: 'ห้อง', value: (i) => i.room },
    { header: 'ผู้เช่า', value: (i) => i.tenant_name },
    { header: 'ค่าเช่า', value: (i) => Number(i.rent) },
    { header: 'น้ำ (หน่วย)', value: (i) => Math.max(0, i.water_curr - i.water_prev) },
    { header: 'ค่าน้ำ', value: (i) => Math.max(0, i.water_curr - i.water_prev) * Number(i.water_rate) },
    { header: 'ไฟ (หน่วย)', value: (i) => Math.max(0, i.elec_curr - i.elec_prev) },
    { header: 'ค่าไฟ', value: (i) => Math.max(0, i.elec_curr - i.elec_prev) * Number(i.elec_rate) },
    { header: 'ค่าส่วนกลาง', value: (i) => Number(i.common_fee) },
    { header: 'ยอดบิล', value: (i) => Number(i.total) },
    { header: 'ค่าปรับ', value: (i) => (i.status === 'paid' ? Number(i.late_fee ?? 0) : '') },
    { header: 'รับแล้ว', value: (i) => Number(i.paid_amount ?? 0) },
    { header: 'สถานะ', value: (i) => statusLabels[i.status] ?? i.status },
]

export const outstandingColumns = [
    { header: 'ห้อง', value: (r) => r.room },
    { header: 'ผู้เช่า', value: (r) => r.tenant },
    { header: 'เดือน', value: (r) => r.month },
    { header: 'ยอดบิล', value: (r) => r.total },
    { header: 'รับแล้ว', value: (r) => r.paid },
    { header: 'ค้างชำระ (รวมค่าปรับวันนี้)', value: (r) => r.balance },
    { header: 'เกินกำหนด (วัน)', value: (r) => r.daysLate },
    { header: 'สถานะ', value: (r) => statusLabels[r.status] ?? r.status },
]

export const monthlyColumns = [
    { header: 'เดือน', value: (r) => r.month },
    { header: 'ใบที่ออก', value: (r) => r.issuedCount },
    { header: 'ยอดที่เรียกเก็บ', value: (r) => r.billed },
    { header: 'รับเงินค่าห้อง (รวมค่าปรับ)', value: (r) => r.received },
    { header: 'รับเงินค่าซ่อม', value: (r) => r.repairReceived },
    { header: 'โอนคืนยอดเกิน', value: (r) => r.refunded },
    { header: 'ค่าปรับของใบเดือนนี้ที่ชำระแล้ว', value: (r) => r.lateFees },
    { header: 'ใบที่ยังค้าง', value: (r) => r.unpaidCount },
    { header: 'ยอดค้าง ณ วันนี้', value: (r) => r.outstanding },
]

// การรับเงิน: payments = invoice_payments, invoiceById = แผนที่ id -> ใบแจ้งหนี้ (ใช้ดึงห้อง/ผู้เช่า/เดือน)
export const paymentColumns = (invoiceById) => [
    { header: 'วันที่รับเงิน', value: (p) => thaiDateOf(new Date(p.confirmed_at)) },
    { header: 'ห้อง', value: (p) => invoiceById[p.invoice_id]?.room ?? '' },
    { header: 'ผู้เช่า', value: (p) => invoiceById[p.invoice_id]?.tenant_name ?? '' },
    { header: 'เดือนของใบแจ้งหนี้', value: (p) => invoiceById[p.invoice_id]?.month ?? '' },
    { header: 'ยอดที่ได้รับ', value: (p) => Number(p.amount) },
    { header: 'ยืนยันโดย', value: (p) => (p.auto_approved ? 'ระบบอัตโนมัติ' : 'แอดมิน') },
    { header: 'เลขอ้างอิงสลิป', value: (p) => p.trans_ref ?? '' },
]

// ---- การย้ายออกและเงินประกัน (supabase/migrations/20261022000000_initial_schema.sql (ส่วน move-out)) ----

const refundLabels = { pending: 'รอคืนเงิน', done: 'คืนแล้ว', none: 'ไม่มียอดคืน' }

// เงินประกันที่ยังต้องคืนผู้เช่า (บันทึกย้ายออกที่สถานะรอคืน)
export const pendingDepositRefund = (moveOuts) => sum(moveOuts.filter((m) => m.refund_status === 'pending'), (m) => m.refund_amount)

// ยอดที่ผู้เช่าต้องจ่ายเพิ่มเพราะหักเกินเงินประกัน (ระบบไม่ติดตามต่อ ใช้เตือนให้เรียกเก็บนอกระบบ)
export const owedFromMoveOuts = (moveOuts) => sum(moveOuts, (m) => m.owed_amount)

export const moveOutColumns = [
    { header: 'วันที่ย้ายออก', value: (m) => m.move_out_date },
    { header: 'ห้อง', value: (m) => m.room },
    { header: 'ผู้เช่า', value: (m) => m.tenant_name },
    { header: 'เงินประกัน', value: (m) => Number(m.deposit) },
    { header: 'หักรวม', value: (m) => Number(m.deductions_total) },
    { header: 'คืนผู้เช่า', value: (m) => Number(m.refund_amount) },
    { header: 'ผู้เช่าต้องจ่ายเพิ่ม', value: (m) => Number(m.owed_amount) },
    { header: 'สถานะคืนเงิน', value: (m) => refundLabels[m.refund_status] ?? m.refund_status },
    { header: 'วันที่คืนเงิน', value: (m) => (m.refunded_at ? thaiDateOf(new Date(m.refunded_at)) : '') },
    { header: 'รายการหัก', value: (m) => (m.deductions ?? []).map((d) => `${d.label} ${d.amount}`).join(' / ') },
]

// ชื่อไฟล์ปลอดภัย เช่น ใบแจ้งหนี้-2026-10.csv
export const csvFileName = (name, suffix) => `${name}-${suffix}.csv`
