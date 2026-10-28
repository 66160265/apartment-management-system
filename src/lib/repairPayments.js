// เรื่องแจ้งซ่อมนี้มีค่าซ่อมที่ผู้เช่าต้องชำระหรือไม่ (supabase/migrations/20261022000000_initial_schema.sql (ส่วน repair-payments))
// เงื่อนไข: ซ่อมเสร็จแล้ว (done) ผู้ดูแลระบุให้ผู้เช่าเป็นผู้ชำระ (cost_payer = tenant) มียอด (cost > 0)

export const owesRepairCost = (repair) => repair.status === 'done' && repair.cost_payer === 'tenant' && Number(repair.cost) > 0

// เรื่องที่ผู้เช่ายังต้องชำระค่าซ่อม: เข้าเงื่อนไข owesRepairCost และยังไม่มีสลิปที่รอตรวจหรือชำระแล้ว
// payments = แถวจาก repair_payments (ใช้ repair_id กับ status) เรื่องที่สลิปเคยถูกปฏิเสธนับว่ายังค้าง
export function unpaidRepairCosts(repairs, payments) {
    const settled = new Set(payments.filter((p) => p.status === 'review' || p.status === 'paid').map((p) => p.repair_id))
    return repairs.filter((r) => owesRepairCost(r) && !settled.has(r.id))
}
