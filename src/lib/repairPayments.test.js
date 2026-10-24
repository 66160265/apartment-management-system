import { describe, expect, it } from 'vitest'
import { owesRepairCost, unpaidRepairCosts } from './repairPayments'

describe('owesRepairCost', () => {
    const base = { status: 'done', cost_payer: 'tenant', cost: 500 }

    it('ซ่อมเสร็จ ผู้เช่าชำระ มียอด = ต้องชำระ', () => {
        expect(owesRepairCost(base)).toBe(true)
        expect(owesRepairCost({ ...base, cost: '450.50' })).toBe(true)
    })

    it('ยังซ่อมไม่เสร็จ = ยังไม่ต้องชำระ', () => {
        for (const status of ['pending', 'scheduled', 'in_progress', 'cancelled']) {
            expect(owesRepairCost({ ...base, status })).toBe(false)
        }
    })

    it('หอพักรับผิดชอบ = ไม่ต้องชำระ', () => {
        expect(owesRepairCost({ ...base, cost_payer: 'owner' })).toBe(false)
    })

    it('ไม่มียอดหรือยอดไม่ใช่ตัวเลข = ไม่ต้องชำระ', () => {
        for (const cost of [0, '0', null, undefined, 'abc', -5]) {
            expect(owesRepairCost({ ...base, cost })).toBe(false)
        }
    })
})

describe('unpaidRepairCosts', () => {
    const owed = (id, over = {}) => ({ id, status: 'done', cost_payer: 'tenant', cost: 500, ...over })

    it('เรื่องที่ยังไม่ส่งสลิปนับว่าค้างชำระ', () => {
        expect(unpaidRepairCosts([owed('a'), owed('b')], []).map((r) => r.id)).toEqual(['a', 'b'])
    })

    it('ส่งสลิปแล้ว (รอตรวจ) หรือชำระแล้ว ไม่นับว่าค้าง', () => {
        const payments = [{ repair_id: 'a', status: 'review' }, { repair_id: 'b', status: 'paid' }]
        expect(unpaidRepairCosts([owed('a'), owed('b'), owed('c')], payments).map((r) => r.id)).toEqual(['c'])
    })

    it('สลิปที่ถูกปฏิเสธ ยังนับว่าค้าง (ต้องโอนใหม่)', () => {
        expect(unpaidRepairCosts([owed('a')], [{ repair_id: 'a', status: 'rejected' }])).toHaveLength(1)
    })

    it('เรื่องที่ไม่ต้องชำระ (หอพักรับผิดชอบ ยังไม่เสร็จ ไม่มียอด เคยรวมในใบแจ้งหนี้แล้ว) ไม่นับ', () => {
        const repairs = [owed('a', { cost_payer: 'owner' }), owed('b', { status: 'in_progress' }), owed('c', { cost: 0 }), owed('d', { invoice_id: 'inv-1' })]
        expect(unpaidRepairCosts(repairs, [])).toEqual([])
    })
})
