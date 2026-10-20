import { describe, expect, it } from 'vitest'
import { owesRepairCost } from './repairPayments'

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
