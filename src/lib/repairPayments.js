// เรื่องแจ้งซ่อมนี้มีค่าซ่อมที่ผู้เช่าต้องชำระหรือไม่ (supabase/repair-payments.sql)
// เงื่อนไข: ซ่อมเสร็จแล้ว (done) ผู้ดูแลระบุให้ผู้เช่าเป็นผู้ชำระ (cost_payer = tenant) และมียอด (cost > 0)
export const owesRepairCost = (repair) => repair.status === 'done' && repair.cost_payer === 'tenant' && Number(repair.cost) > 0
