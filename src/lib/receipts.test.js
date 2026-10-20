import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

const { receiptCode, buildInvoiceReceipt, buildRepairReceipt, receiptFileName } = await import('./receipts')

describe('receiptCode', () => {
    it('RC-ปี-เลข 6 หลัก ปีตามวันที่รับเงินเวลาไทย', () => {
        expect(receiptCode(12, '2026-10-20T10:00:00+07:00')).toBe('RC-2026-000012')
        expect(receiptCode(1, '2026-12-31T17:30:00Z')).toBe('RC-2027-000001') // ไทยข้ามปีแล้ว
    })

    it('ไม่มีเลขหรือไม่มีวันที่ = ว่าง', () => {
        expect(receiptCode(null, '2026-10-20T10:00:00Z')).toBe('')
        expect(receiptCode(undefined, '2026-10-20T10:00:00Z')).toBe('')
        expect(receiptCode(5, null)).toBe('')
    })

    it('เลข 0 ไม่ถือว่าไม่มีเลข', () => {
        expect(receiptCode(0, '2026-10-20T10:00:00+07:00')).toBe('RC-2026-000000')
    })
})

describe('buildInvoiceReceipt', () => {
    const invoice = (over = {}) => ({ id: 'i', room: '101', tenant_name: 'สมชาย', month: '2026-10', total: 1000, status: 'paid', late_fee: 0, refund_amount: 0, refund_status: null, ...over })
    const pay = (id, amount, at, no, over = {}) => ({ id, amount, confirmed_at: at, receipt_no: no, trans_ref: null, auto_approved: false, ...over })

    it('จ่ายครั้งเดียวครบ: ใบเสร็จปิดยอด ไม่มีงวด', () => {
        const p = pay('p1', 1000, '2026-10-20T10:00:00+07:00', 7)
        const r = buildInvoiceReceipt({ payment: p, invoice: invoice(), payments: [p] })
        expect(r).toMatchObject({ code: 'RC-2026-000007', room: '101', amount: 1000, cumulative: 1000, billTotal: 1000, status: 'paid', installment: null, overpaid: 0 })
        expect(r.description).toContain('ต.ค. 69')
        expect(r.reference).toBe('INV-101-202610')
    })

    it('จ่ายหลายครั้ง: ใบแรกเป็นบางส่วน รับสะสมถูก ใบสุดท้ายปิดยอด', () => {
        const p1 = pay('p1', 600, '2026-10-20T10:00:00+07:00', 7)
        const p2 = pay('p2', 400, '2026-10-25T10:00:00+07:00', 9)
        const list = [p2, p1] // ลำดับสลับ ฟังก์ชันต้องเรียงเอง
        const r1 = buildInvoiceReceipt({ payment: p1, invoice: invoice(), payments: list })
        const r2 = buildInvoiceReceipt({ payment: p2, invoice: invoice(), payments: list })
        expect(r1).toMatchObject({ amount: 600, cumulative: 600, status: 'partial', installment: { number: 1, of: 2 } })
        expect(r2).toMatchObject({ amount: 400, cumulative: 1000, status: 'paid', installment: { number: 2, of: 2 } })
    })

    it('บิลที่ยังไม่ชำระครบ ใบเสร็จครั้งล่าสุดก็เป็นบางส่วน', () => {
        const p = pay('p1', 600, '2026-10-20T10:00:00+07:00', 7)
        const r = buildInvoiceReceipt({ payment: p, invoice: invoice({ status: 'pending' }), payments: [p] })
        expect(r.status).toBe('partial')
        expect(r.lateFee).toBe(0)
    })

    it('ใบที่ปิดยอดมีค่าปรับ: แสดงค่าปรับและยอดรวมค่าปรับ', () => {
        const p = pay('p1', 1200, '2026-11-10T10:00:00+07:00', 3)
        const r = buildInvoiceReceipt({ payment: p, invoice: invoice({ late_fee: 200 }), payments: [p] })
        expect(r).toMatchObject({ lateFee: 200, dueTotal: 1200, billTotal: 1000, amount: 1200, status: 'paid' })
    })

    it('โอนเกิน: ใบเสร็จที่ปิดยอดบอกยอดที่ต้องโอนคืน และสถานะโอนคืน', () => {
        const p = pay('p1', 1300, '2026-10-20T10:00:00+07:00', 3)
        const pending = buildInvoiceReceipt({ payment: p, invoice: invoice({ refund_amount: 300, refund_status: 'pending' }), payments: [p] })
        expect(pending).toMatchObject({ overpaid: 300, refunded: false })
        const done = buildInvoiceReceipt({ payment: p, invoice: invoice({ refund_amount: 300, refund_status: 'done' }), payments: [p] })
        expect(done.refunded).toBe(true)
    })

    it('ใบเสร็จที่ออกอัตโนมัติและเลขอ้างอิงธนาคารถูกส่งต่อ', () => {
        const p = pay('p1', 1000, '2026-10-20T10:00:00+07:00', 1, { auto_approved: true, trans_ref: 'TR9' })
        expect(buildInvoiceReceipt({ payment: p, invoice: invoice(), payments: [p] })).toMatchObject({ autoApproved: true, transRef: 'TR9' })
    })

    it('ข้อมูลเดิมที่ไม่มีเลขใบเสร็จ: ได้ใบเสร็จที่ไม่มีเลข (ไม่ error)', () => {
        const p = pay('p1', 1000, '2026-10-20T10:00:00+07:00', null)
        expect(buildInvoiceReceipt({ payment: p, invoice: invoice(), payments: [p] }).code).toBe('')
    })

    it('ไม่พบ payment ในรายการ ใช้ลำดับแรกแทน ไม่ error', () => {
        const p = pay('x', 100, '2026-10-20T10:00:00+07:00', 1)
        expect(() => buildInvoiceReceipt({ payment: p, invoice: invoice(), payments: [] })).not.toThrow()
    })
})

describe('buildRepairReceipt', () => {
    it('ค่าซ่อมจ่ายครั้งเดียว ชำระครบ', () => {
        const r = buildRepairReceipt({
            payment: { amount: '350.00', reviewed_at: '2026-10-20T10:00:00+07:00', receipt_no: 4, trans_ref: 'R1', auto_approved: false },
            repair: { room: '102', tenant_name: 'สมหญิง', problem: 'ก๊อกน้ำรั่ว' },
        })
        expect(r).toMatchObject({ kind: 'repair', code: 'RC-2026-000004', room: '102', amount: 350, billTotal: 350, status: 'paid', description: 'ค่าซ่อม: ก๊อกน้ำรั่ว' })
    })
})

describe('receiptFileName', () => {
    it('ใช้เลขที่ใบเสร็จเป็นชื่อไฟล์ ไม่มีเลขใช้ชื่อสำรอง', () => {
        expect(receiptFileName({ code: 'RC-2026-000007', room: '101', date: '2026-10-20T10:00:00+07:00' })).toBe('RC-2026-000007.pdf')
        expect(receiptFileName({ code: '', room: '101', date: '2026-10-20T10:00:00+07:00' })).toBe('RECEIPT-101-2026-10-20.pdf')
    })
})
