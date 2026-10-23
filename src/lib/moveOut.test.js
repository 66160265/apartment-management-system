import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

const { settlement, unpaidInvoicesOf, reviewingInvoicesOf, validateCustoms, buildDeductions, moveOutOutcome, forfeitsDeposit, forfeitDeduction, firstYearEnd } = await import('./moveOut')

describe('ไม่คืนเงินประกันถ้าย้ายออกก่อนครบปีแรก', () => {
    it('ครบปีแรก = วันเริ่มสัญญา + 12 เดือน', () => {
        expect(firstYearEnd('2026-01-31')).toBe('2027-01-31')
        expect(firstYearEnd(null)).toBe(null)
    })

    it('ย้ายออกก่อนวันครบปี = ไม่คืน, ตั้งแต่วันครบปี = คืนตามปกติ', () => {
        expect(forfeitsDeposit('2026-01-15', '2027-01-14')).toBe(true)
        expect(forfeitsDeposit('2026-01-15', '2027-01-15')).toBe(false)
        expect(forfeitsDeposit(null, '2026-05-01')).toBe(false)
    })

    it('หักส่วนที่เหลือหลังหักรายการอื่น ยอดคืนจึงเป็น 0', () => {
        const others = [{ label: 'ค่าเช่า', amount: 1500 }]
        const rows = forfeitDeduction(4000, others)
        expect(rows).toEqual([{ label: 'ไม่คืนเงินประกัน (ย้ายออกก่อนครบสัญญา 1 ปี)', amount: 2500 }])
        expect(settlement(4000, [...others, ...rows])).toEqual({ deposit: 4000, total: 4000, refund: 0, owed: 0 })
        expect(forfeitDeduction(4000, [{ label: 'ค่าเช่า', amount: 5450 }])).toEqual([])
    })
})

describe('settlement (ต้องตรงกับ record_move_out ในฐานข้อมูล)', () => {
    it('คืนส่วนที่เหลือ: 5000 หัก 500+700 = คืน 3800', () => {
        expect(settlement(5000, [{ amount: 500 }, { amount: '700' }])).toEqual({ deposit: 5000, total: 1200, refund: 3800, owed: 0 })
    })

    it('ไม่หักอะไร = คืนเต็ม', () => {
        expect(settlement(3000, [])).toEqual({ deposit: 3000, total: 0, refund: 3000, owed: 0 })
    })

    it('หักเกินเงินประกัน = คืน 0 ผู้เช่าต้องจ่ายเพิ่ม (1000 หัก 1800 = เพิ่ม 800)', () => {
        expect(settlement(1000, [{ amount: 1800 }])).toEqual({ deposit: 1000, total: 1800, refund: 0, owed: 800 })
    })

    it('หักพอดีเงินประกัน = คืน 0 และไม่ต้องจ่ายเพิ่ม', () => {
        expect(settlement(1000, [{ amount: 1000 }])).toMatchObject({ refund: 0, owed: 0 })
    })

    it('เงินประกัน 0/ไม่มีค่า และทศนิยม ไม่คลาดเคลื่อน', () => {
        expect(settlement(0, [{ amount: 100 }])).toMatchObject({ refund: 0, owed: 100 })
        expect(settlement(undefined, [])).toMatchObject({ deposit: 0, refund: 0 })
        expect(settlement(1, [{ amount: 0.1 }, { amount: 0.2 }])).toMatchObject({ total: 0.3, refund: 0.7 })
    })
})

describe('unpaidInvoicesOf', () => {
    const now = new Date('2026-11-10T10:00:00+07:00')
    const inv = (id, room, month, over = {}) => ({ id, room, month, user_id: 'u1', total: 1000, paid_amount: 0, status: 'pending', ...over })
    const owner = { room: '101', userId: 'u1' }

    it('เฉพาะใบรอชำระของห้องนั้น เรียงเดือนเก่าก่อน', () => {
        const list = unpaidInvoicesOf([inv('b', '101', '2026-10'), inv('a', '101', '2026-09'), inv('c', '102', '2026-09'), inv('d', '101', '2026-08', { status: 'paid' })], owner, now)
        expect(list.map((i) => i.id)).toEqual(['a', 'b'])
    })

    it('ไม่นับใบของผู้เช่าคนก่อนในห้องเดียวกัน', () => {
        const previous = [inv('old', '101', '2026-09', { user_id: 'u0' }), inv('gone', '101', '2026-08', { user_id: null })]
        expect(unpaidInvoicesOf([...previous, inv('mine', '101', '2026-10')], owner, now).map((i) => i.id)).toEqual(['mine'])
        expect(unpaidInvoicesOf(previous, { room: '101', userId: null }, now)).toEqual([])
    })

    it('ยอดคือยอดค้างรวมค่าปรับวันนี้ และหักที่ได้รับแล้ว', () => {
        const late = inv('x', '101', '2026-10', { due_date: '2026-11-05', late_fee_rate: 50, late_fee_grace: 0, paid_amount: 400 })
        expect(unpaidInvoicesOf([late], owner, now)[0].balance).toBe(850)
    })

    it('ใบที่ค้าง 0 ไม่แสดง และใบที่รอตรวจสลิปไม่อยู่ในรายการหักได้', () => {
        expect(unpaidInvoicesOf([inv('z', '101', '2026-10', { paid_amount: 1000 }), inv('r', '101', '2026-09', { status: 'review' })], owner, now)).toEqual([])
    })

    it('reviewingInvoicesOf หาใบที่รอตรวจสลิป', () => {
        expect(reviewingInvoicesOf([inv('r', '101', '2026-09', { status: 'review' }), inv('p', '101', '2026-10'), inv('o', '101', '2026-08', { status: 'review', user_id: 'u0' })], owner).map((i) => i.id)).toEqual(['r'])
    })
})

describe('validateCustoms', () => {
    it('ถูกต้อง/แถวว่างทั้งคู่ ไม่มี error', () => {
        expect(validateCustoms([{ label: 'ค่าทำความสะอาด', amount: '500' }, { label: '', amount: '' }])).toBe('')
        expect(validateCustoms([])).toBe('')
    })

    it('มีชื่อไม่มียอด / มียอดไม่มีชื่อ / ยอดไม่ถูก / ชื่อยาวเกิน', () => {
        expect(validateCustoms([{ label: 'x', amount: '' }])).toContain('ต้องมากกว่า 0')
        expect(validateCustoms([{ label: '', amount: '100' }])).toContain('ชื่อรายการ')
        expect(validateCustoms([{ label: 'x', amount: '0' }])).toContain('ต้องมากกว่า 0')
        expect(validateCustoms([{ label: 'x', amount: '-5' }])).toContain('ต้องมากกว่า 0')
        expect(validateCustoms([{ label: 'x', amount: 'abc' }])).toContain('ต้องมากกว่า 0')
        expect(validateCustoms([{ label: 'ก'.repeat(101), amount: '1' }])).toContain('ยาวเกิน')
    })
})

describe('buildDeductions', () => {
    it('ผูก invoice_id กับใบที่เลือก ส่วนรายการกรอกเองตัดช่องว่างและข้ามแถวว่าง', () => {
        const out = buildDeductions(
            [{ id: 'inv1', label: 'ค่าเช่า ต.ค.', balance: 1250.5 }],
            [{ label: '  ทำความสะอาด ', amount: '500' }, { label: '', amount: '' }],
        )
        expect(out).toEqual([
            { label: 'ค่าเช่า ต.ค.', amount: 1250.5, invoice_id: 'inv1' },
            { label: 'ทำความสะอาด', amount: 500 },
        ])
    })

    it('ไม่เลือกอะไรเลย = ว่าง', () => {
        expect(buildDeductions([], [])).toEqual([])
    })
})

describe('moveOutOutcome', () => {
    it('จัดกลุ่มผลลัพธ์', () => {
        expect(moveOutOutcome({ owed_amount: 800, refund_amount: 0, refund_status: 'none' })).toEqual({ key: 'owed', amount: 800 })
        expect(moveOutOutcome({ owed_amount: 0, refund_amount: 3800, refund_status: 'pending' })).toEqual({ key: 'refund_pending', amount: 3800 })
        expect(moveOutOutcome({ owed_amount: 0, refund_amount: 3800, refund_status: 'done' })).toEqual({ key: 'refund_done', amount: 3800 })
        expect(moveOutOutcome({ owed_amount: 0, refund_amount: 0, refund_status: 'none' })).toEqual({ key: 'none', amount: 0 })
    })
})
