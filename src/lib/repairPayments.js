import { lateFeeAt, thaiDateOf } from './billing'

// เรื่องแจ้งซ่อมนี้มีค่าซ่อมที่ผู้เช่าต้องชำระหรือไม่ (supabase/migrations/20261022000000_initial_schema.sql (ส่วน repair-payments))
// เงื่อนไข: ซ่อมเสร็จแล้ว (done) ผู้ดูแลระบุให้ผู้เช่าเป็นผู้ชำระ (cost_payer = tenant) มียอด (cost > 0)

// ---- ค่าปรับชำระค่าซ่อมล่าช้า (ต้องตรงกับ repair_late_fee ใน supabase/migrations/20261026000000_repair_late_fee.sql) ----
// ตอนซ่อมเสร็จระบบจำวันครบกำหนด (pay_due_date = วันที่เสร็จ + 1 วัน) และค่าปรับจากหน้าตั้งค่าไว้ในเรื่องนั้น สูตรเดียวกับใบแจ้งหนี้

// เงื่อนไขค่าปรับของเรื่องแจ้งซ่อมในรูปที่ lateFeeAt ใช้
const feeTerms = (repair) => ({
    late_fee_rate: repair.late_fee_rate,
    late_fee_grace: repair.late_fee_grace,
    late_fee_cap: repair.late_fee_cap,
    due_date: repair.pay_due_date,
})

// ค่าปรับค่าซ่อม ณ วันนี้ (ไม่มีวันครบกำหนดหรืออัตรา 0 = 0)
export const repairLateFee = (repair, now = new Date()) => lateFeeAt(feeTerms(repair), thaiDateOf(now))

// ยอดที่ผู้เช่าต้องโอนวันนี้ = ค่าซ่อม + ค่าปรับ
export const repairAmountDue = (repair, now = new Date()) => Math.round((Number(repair.cost) + repairLateFee(repair, now)) * 100) / 100

// เกินกำหนดชำระค่าซ่อมกี่วัน (ติดลบ = ยังไม่ถึงกำหนด, null = ไม่มีวันครบกำหนด)
export function repairDaysLate(repair, now = new Date()) {
    if (!repair.pay_due_date) return null
    return Math.round((Date.parse(`${thaiDateOf(now)}T00:00:00Z`) - Date.parse(`${repair.pay_due_date}T00:00:00Z`)) / 86400000)
}

export const owesRepairCost = (repair) => repair.status === 'done' && repair.cost_payer === 'tenant' && Number(repair.cost) > 0

// เรื่องที่ผู้เช่ายังต้องชำระค่าซ่อม: เข้าเงื่อนไข owesRepairCost และยังไม่มีสลิปที่รอตรวจหรือชำระแล้ว
// payments = แถวจาก repair_payments (ใช้ repair_id กับ status) เรื่องที่สลิปเคยถูกปฏิเสธนับว่ายังค้าง
export function unpaidRepairCosts(repairs, payments) {
    const settled = new Set(payments.filter((p) => p.status === 'review' || p.status === 'paid').map((p) => p.repair_id))
    return repairs.filter((r) => owesRepairCost(r) && !settled.has(r.id))
}
