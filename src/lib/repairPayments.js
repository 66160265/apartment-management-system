import { supabase } from './supabaseClient'

// เรื่องแจ้งซ่อมนี้มีค่าซ่อมที่ผู้เช่าต้องชำระหรือไม่ (supabase/repair-payments.sql)
// เงื่อนไข: ซ่อมเสร็จแล้ว (done) ผู้ดูแลระบุให้ผู้เช่าเป็นผู้ชำระ (cost_payer = tenant) และมียอด (cost > 0)
export const owesRepairCost = (repair) => repair.status === 'done' && repair.cost_payer === 'tenant' && Number(repair.cost) > 0

// เรื่องที่ผู้เช่ายังต้องชำระค่าซ่อม: เข้าเงื่อนไข owesRepairCost และยังไม่มีสลิปที่รอตรวจหรือชำระแล้ว
// payments = แถวจาก repair_payments (ใช้ repair_id กับ status) เรื่องที่สลิปเคยถูกปฏิเสธนับว่ายังค้าง
export function unpaidRepairCosts(repairs, payments) {
    const settled = new Set(payments.filter((p) => p.status === 'review' || p.status === 'paid').map((p) => p.repair_id))
    return repairs.filter((r) => owesRepairCost(r) && !settled.has(r.id))
}

// ค่าซ่อมที่ยังไม่ได้เรียกเก็บ แยกตามห้อง { ห้อง: ยอดรวม } (ต้องตรงกับ repair_unbilled ใน supabase/repair-billing.sql)
// = ค่าซ่อมที่ผู้เช่ายังค้าง และยังไม่ถูกรวมในใบแจ้งหนี้ใบไหน (invoice_id ว่าง) ใช้แสดงยอดตัวอย่างก่อนสร้างใบแจ้งหนี้
export function unbilledRepairFees(repairs, payments) {
    const fees = {}
    for (const r of unpaidRepairCosts(repairs, payments)) {
        if (r.invoice_id) continue
        fees[r.room] = (fees[r.room] ?? 0) + Number(r.cost)
    }
    return fees
}

// โหลดค่าซ่อมที่ยังไม่ได้เรียกเก็บของทุกห้อง (แอดมิน) โหลดไม่ได้ (เช่น ยังไม่ได้รัน SQL) คืน {}
export async function loadUnbilledRepairFees() {
    const [repairsRes, paymentsRes] = await Promise.all([
        supabase.from('repairs').select('id, room, status, cost, cost_payer, invoice_id').eq('status', 'done').eq('cost_payer', 'tenant').gt('cost', 0).is('invoice_id', null),
        supabase.from('repair_payments').select('repair_id, status').in('status', ['review', 'paid']),
    ])
    if (repairsRes.error || paymentsRes.error) return {}
    return unbilledRepairFees(repairsRes.data ?? [], paymentsRes.data ?? [])
}
