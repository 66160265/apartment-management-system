import { describe, expect, it, vi } from 'vitest'

// billing.js นำเข้า supabaseClient ซึ่งต้องมีค่าใน .env จึงจำลองขึ้นมาแทน (เทสต์ไม่ต้องต่อเน็ต)
vi.mock('./supabaseClient', () => ({ supabase: {} }))

const { calcInvoice, dueDateOf, invoiceCode, thaiBahtText, baht, paidOf, balanceOf, isPartiallyPaid } = await import('./billing')

const base = { rent: 3500, waterPrev: 100, waterCurr: 110, elecPrev: 500, elecCurr: 560, waterRate: 18, elecRate: 7, commonFee: 100 }

describe('calcInvoice', () => {
    it('รวมค่าเช่า น้ำ ไฟ และค่าส่วนกลาง', () => {
        expect(calcInvoice(base)).toEqual({ waterUnits: 10, elecUnits: 60, water: 180, elec: 420, total: 4200 })
    })

    it('ไม่ใช้น้ำไฟ คิดเฉพาะค่าเช่าและค่าส่วนกลาง', () => {
        const r = calcInvoice({ ...base, waterCurr: 100, elecCurr: 500 })
        expect(r.total).toBe(3600)
    })

    it('มิเตอร์ปัจจุบันน้อยกว่าก่อนหน้า (กรอกผิด) ไม่ทำให้ยอดติดลบ', () => {
        const r = calcInvoice({ ...base, waterCurr: 50, elecCurr: 100 })
        expect(r.waterUnits).toBe(0)
        expect(r.elecUnits).toBe(0)
        expect(r.total).toBe(3600)
    })

    it('รองรับอัตราค่าบริการที่เป็นทศนิยม', () => {
        const r = calcInvoice({ ...base, waterRate: 17.5, elecRate: 6.5 })
        expect(r.water).toBe(175)
        expect(r.elec).toBe(390)
    })
})

describe('dueDateOf', () => {
    it('คืนวันที่ dueDay ของเดือนถัดไป', () => {
        const d = dueDateOf('2026-10', 5)
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 5])
    })

    it('ใช้วันที่ 5 เมื่อไม่ระบุ', () => {
        expect(dueDateOf('2026-03').getDate()).toBe(5)
    })

    it('เดือนธันวาคมข้ามไปมกราคมปีถัดไป', () => {
        const d = dueDateOf('2026-12', 10)
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2027, 0, 10])
    })
})

describe('invoiceCode', () => {
    it('ประกอบเลขที่จากห้องและเดือน', () => {
        expect(invoiceCode({ room: '101', month: '2026-10' })).toBe('INV-101-202610')
    })
})

describe('baht', () => {
    it('ใส่ ฿ และคั่นหลักพัน', () => {
        expect(baht(4531)).toBe('฿4,531')
    })
})

describe('ยอดชำระบางส่วน', () => {
    it('ใบที่ยังไม่มีการชำระ คงเหลือเท่ายอดบิล', () => {
        const inv = { total: 4531, status: 'pending' }
        expect(paidOf(inv)).toBe(0)
        expect(balanceOf(inv)).toBe(4531)
        expect(isPartiallyPaid(inv)).toBe(false)
    })

    it('ชำระบางส่วน คงเหลือคือส่วนต่าง', () => {
        const inv = { total: 4531, paid_amount: '3000.00', status: 'pending' }
        expect(balanceOf(inv)).toBe(1531)
        expect(isPartiallyPaid(inv)).toBe(true)
    })

    it('ชำระบางส่วนแล้วส่งสลิปเพิ่ม (รอตรวจ) ยังนับเป็นชำระบางส่วน', () => {
        expect(isPartiallyPaid({ total: 4531, paid_amount: 3000, status: 'review' })).toBe(true)
    })

    it('ชำระครบแล้วไม่นับเป็นชำระบางส่วน และคงเหลือเป็น 0', () => {
        const inv = { total: 4531, paid_amount: 4531, status: 'paid' }
        expect(isPartiallyPaid(inv)).toBe(false)
        expect(balanceOf(inv)).toBe(0)
    })

    it('จ่ายเกิน คงเหลือไม่ติดลบ', () => {
        expect(balanceOf({ total: 4000, paid_amount: 4500, status: 'paid' })).toBe(0)
    })

    it('ไม่คลาดเคลื่อนจากทศนิยม', () => {
        expect(balanceOf({ total: 0.3, paid_amount: 0.1 + 0.1 })).toBe(0.1)
    })
})

describe('thaiBahtText', () => {
    it.each([
        [0, 'ศูนย์บาทถ้วน'],
        [1, 'หนึ่งบาทถ้วน'],
        [10, 'สิบบาทถ้วน'],
        [11, 'สิบเอ็ดบาทถ้วน'],
        [20, 'ยี่สิบบาทถ้วน'],
        [21, 'ยี่สิบเอ็ดบาทถ้วน'],
        [101, 'หนึ่งร้อยเอ็ดบาทถ้วน'],
        [3500, 'สามพันห้าร้อยบาทถ้วน'],
        [4531, 'สี่พันห้าร้อยสามสิบเอ็ดบาทถ้วน'],
        [12000, 'หนึ่งหมื่นสองพันบาทถ้วน'],
    ])('%s -> %s', (n, text) => {
        expect(thaiBahtText(n)).toBe(text)
    })

    it('มีสตางค์', () => {
        expect(thaiBahtText(100.5)).toBe('หนึ่งร้อยบาทห้าสิบสตางค์')
    })

    it('ค่าที่ไม่ใช่ตัวเลขถือเป็นศูนย์', () => {
        expect(thaiBahtText(undefined)).toBe('ศูนย์บาทถ้วน')
        expect(thaiBahtText('abc')).toBe('ศูนย์บาทถ้วน')
    })
})
