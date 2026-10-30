import { describe, expect, it } from 'vitest'
import { invoiceBreakdownOf, lateFeeNotice } from './tenantDashboard'

describe('invoiceBreakdownOf', () => {
    it('ไม่มีใบ = null', () => {
        expect(invoiceBreakdownOf(null)).toBeNull()
    })

    it('คำนวณหน่วยและยอดค่าน้ำ-ค่าไฟจากมิเตอร์', () => {
        const b = invoiceBreakdownOf({
            rent: '4500', water_prev: 10, water_curr: 15, water_rate: '18', elec_prev: 100, elec_curr: 140, elec_rate: '8', common_fee: '200', total: '5390',
        })
        expect(b).toEqual({ rent: 4500, waterUnits: 5, waterRate: 18, waterCost: 90, elecUnits: 40, elecRate: 8, elecCost: 320, commonFee: 200, total: 5390 })
    })

    it('มิเตอร์ปัจจุบันน้อยกว่าครั้งก่อน = 0 หน่วย ไม่ติดลบ', () => {
        const b = invoiceBreakdownOf({ water_prev: 20, water_curr: 5, water_rate: 18 })
        expect(b.waterUnits).toBe(0)
        expect(b.waterCost).toBe(0)
    })
})

describe('lateFeeNotice', () => {
    it('อัตราจากใบมาก่อนค่าจากหน้าตั้งค่า', () => {
        expect(lateFeeNotice({ late_fee_rate: 50, late_fee_grace: 3 }, { lateFeePerDay: 10, lateFeeGraceDays: 1 })).toBe('หากเกินกำหนด 3 วัน คิดค่าปรับเพิ่มวันละ ฿50')
    })

    it('ใบไม่มีอัตรา ใช้ค่าจากหน้าตั้งค่า และไม่มีวันผ่อนผันก็ไม่บอกจำนวนวัน', () => {
        expect(lateFeeNotice({}, { lateFeePerDay: 20, lateFeeGraceDays: 0 })).toBe('หากเกินกำหนด คิดค่าปรับเพิ่มวันละ ฿20')
    })

    it('อัตรา 0 หรือไม่มีใบ = ไม่แสดง', () => {
        expect(lateFeeNotice({ late_fee_rate: 0 }, { lateFeePerDay: 20 })).toBe('')
        expect(lateFeeNotice(null, {})).toBe('')
    })
})
