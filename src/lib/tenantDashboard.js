import { baht, formatShortDate } from './billing'
import { invoiceDueDate } from './dashboard'

// ตรรกะแสดงผลของหน้าภาพรวมผู้เช่า (pages/UserDashboardPage.jsx) แยกไว้ให้ทดสอบได้

// วันที่ครบกำหนดชำระของใบ เช่น "5 ต.ค. 69" (ตาม due_date ของใบ หรือวันครบกำหนดในหน้าตั้งค่า)
export const formatDueDate = (invoice, dueDay) => (invoice ? formatShortDate(invoiceDueDate(invoice, dueDay)) : '-')

// ข้อความเตือนค่าปรับชำระล่าช้า (ใช้อัตราที่จำไว้ในใบ ถ้าใบไม่มีใช้ค่าจากหน้าตั้งค่า) อัตรา 0 = ไม่คิดค่าปรับ คืนข้อความว่าง
export function lateFeeNotice(invoice, settings) {
    const rate = Number(invoice?.late_fee_rate ?? settings.lateFeePerDay ?? 0)
    if (!(rate > 0)) return ''
    const grace = Number(invoice?.late_fee_grace ?? settings.lateFeeGraceDays ?? 0)
    return `หากเกินกำหนด${grace > 0 ? ` ${grace} วัน` : ''} คิดค่าปรับเพิ่มวันละ ${baht(rate)}`
}

// รายการคำนวณค่าน้ำ-ค่าไฟของใบ (หน่วยที่ใช้ อัตรา และยอด) คืน null ถ้าไม่มีใบ
export function invoiceBreakdownOf(invoice) {
    if (!invoice) return null
    const waterUnits = Math.max(0, (invoice.water_curr || 0) - (invoice.water_prev || 0))
    const elecUnits = Math.max(0, (invoice.elec_curr || 0) - (invoice.elec_prev || 0))
    return {
        rent: Number(invoice.rent || 0),
        waterUnits,
        waterRate: Number(invoice.water_rate || 0),
        waterCost: waterUnits * Number(invoice.water_rate || 0),
        elecUnits,
        elecRate: Number(invoice.elec_rate || 0),
        elecCost: elecUnits * Number(invoice.elec_rate || 0),
        commonFee: Number(invoice.common_fee || 0),
        total: Number(invoice.total || 0),
    }
}
