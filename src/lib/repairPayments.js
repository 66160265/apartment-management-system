import { thaiDateOf } from './billing'

// เรื่องแจ้งซ่อมนี้มีค่าซ่อมที่ผู้เช่าต้องชำระหรือไม่ (supabase/migrations/20261022000000_initial_schema.sql (ส่วน repair-payments))
// เงื่อนไข: ซ่อมเสร็จแล้ว (done) ผู้ดูแลระบุให้ผู้เช่าเป็นผู้ชำระ (cost_payer = tenant) มียอด (cost > 0)
// และยังไม่เคยถูกรวมในใบแจ้งหนี้ค่าห้อง (invoice_id ว่าง เรื่องเก่าช่วงที่ค่าซ่อมรวมในใบแจ้งหนี้ ไม่ต้องจ่ายแยกซ้ำ)
// วันครบกำหนดชำระค่าซ่อม (YYYY-MM-DD เวลาไทย) = วันที่ซ่อมเสร็จ + days วัน (ยังไม่เสร็จ = null)
export function repairPayDueDate(repair, days) {
    if (!repair.completed_at) return null
    const d = new Date(Date.parse(`${thaiDateOf(new Date(repair.completed_at))}T00:00:00Z`) + days * 86400000)
    return d.toISOString().slice(0, 10)
}

export const owesRepairCost = (repair) => repair.status === 'done' && repair.cost_payer === 'tenant' && Number(repair.cost) > 0 && !repair.invoice_id

// เรื่องที่ผู้เช่ายังต้องชำระค่าซ่อม: เข้าเงื่อนไข owesRepairCost และยังไม่มีสลิปที่รอตรวจหรือชำระแล้ว
// payments = แถวจาก repair_payments (ใช้ repair_id กับ status) เรื่องที่สลิปเคยถูกปฏิเสธนับว่ายังค้าง
export function unpaidRepairCosts(repairs, payments) {
    const settled = new Set(payments.filter((p) => p.status === 'review' || p.status === 'paid').map((p) => p.repair_id))
    return repairs.filter((r) => owesRepairCost(r) && !settled.has(r.id))
}
