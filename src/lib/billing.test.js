import { describe, expect, it, vi } from 'vitest'

// billing.js นำเข้า supabaseClient ซึ่งต้องมีค่าใน .env จึงจำลองขึ้นมาแทน (เทสต์ไม่ต้องต่อเน็ต)
vi.mock('./supabaseClient', () => ({ supabase: {} }))

const {
    calcInvoice, dueDateOf, invoiceCode, thaiBahtText, baht, paidOf, balanceOf, isPartiallyPaid,
    lateFeeAt, lateFeeOf, daysLate, slipAsOf, dueDateIso, lateFeeSnapshot, balanceAtSlip, thaiDateOf,
} = await import('./billing')

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

// ชุดตัวอย่างเดียวกับเทสต์ invoice_late_fee ในฐานข้อมูล (สูตรสองที่ต้องให้ผลตรงกัน)
describe('lateFeeAt', () => {
    const inv = (over = {}) => ({ due_date: '2026-11-05', late_fee_rate: 50, late_fee_grace: 0, late_fee_cap: null, ...over })

    it.each([
        ['ยังไม่เกินกำหนด', inv(), '2026-11-05', 0],
        ['เกิน 1 วัน', inv(), '2026-11-06', 50],
        ['เกิน 10 วัน', inv(), '2026-11-15', 500],
        ['ผ่อนผัน 3 วัน เกิน 3 วัน', inv({ late_fee_grace: 3 }), '2026-11-08', 0],
        ['ผ่อนผัน 3 วัน เกิน 4 วัน', inv({ late_fee_grace: 3 }), '2026-11-09', 50],
        ['เพดาน 300', inv({ late_fee_cap: 300 }), '2026-11-15', 300],
        ['เพดาน 0', inv({ late_fee_cap: 0 }), '2026-11-15', 0],
        ['อัตรา 0', inv({ late_fee_rate: 0 }), '2026-12-15', 0],
        ['ไม่มีวันครบกำหนด (บิลเก่า)', inv({ due_date: null }), '2026-12-15', 0],
        ['อัตราทศนิยมปัดสตางค์', inv({ late_fee_rate: 33.333 }), '2026-11-07', 66.67],
        ['ก่อนวันครบกำหนด', inv(), '2026-11-01', 0],
        ['ฟิลด์ใหม่ไม่มีเลย (บิลก่อนมีระบบค่าปรับ)', { total: 1000 }, '2026-12-01', 0],
        ['เพดานเป็นสตริงว่าง = ไม่จำกัด', inv({ late_fee_cap: '' }), '2026-11-15', 500],
        ['ข้ามเดือน', inv({ due_date: '2026-12-30' }), '2027-01-02', 150],
    ])('%s', (_name, invoice, asOf, expected) => {
        expect(lateFeeAt(invoice, asOf)).toBe(expected)
    })
})

describe('ค่าปรับของใบแจ้งหนี้ตอนนี้', () => {
    const now = new Date('2026-11-10T10:00:00+07:00')
    const base = { total: 1000, due_date: '2026-11-05', late_fee_rate: 50, late_fee_grace: 0, late_fee_cap: null, status: 'pending' }

    it('ใบที่ยังไม่ชำระคำนวณสดตามวันนี้ (เวลาไทย)', () => {
        expect(lateFeeOf(base, now)).toBe(250)
        expect(daysLate(base, now)).toBe(5)
        expect(balanceOf(base, now)).toBe(1250)
    })

    it('เที่ยงคืนไทยเปลี่ยนวัน: 00:30 ไทย = วันใหม่', () => {
        expect(lateFeeOf(base, new Date('2026-11-10T00:30:00+07:00'))).toBe(250)
        expect(lateFeeOf(base, new Date('2026-11-09T23:30:00+07:00'))).toBe(200)
        expect(thaiDateOf(new Date('2026-11-09T17:30:00Z'))).toBe('2026-11-10')
    })

    it('ชำระบางส่วนแล้ว ยอดที่ต้องชำระ = ยอดบิล + ค่าปรับ - ที่ได้รับ', () => {
        expect(balanceOf({ ...base, paid_amount: 1000 }, now)).toBe(250)
    })

    it('ชำระครบแล้วใช้ค่าปรับที่คิดจริงตอนชำระ ไม่เปลี่ยนตามวัน และคงเหลือ 0', () => {
        const paid = { ...base, status: 'paid', late_fee: 100, paid_amount: 1100 }
        expect(lateFeeOf(paid, now)).toBe(100)
        expect(lateFeeOf(paid, new Date('2027-05-01T00:00:00Z'))).toBe(100)
        expect(daysLate(paid, now)).toBe(0)
        expect(balanceOf(paid, now)).toBe(0)
    })

    it('ใบที่ไม่คิดค่าปรับ (อัตรา 0 หรือไม่มีวันครบกำหนด) ยอดไม่เปลี่ยน', () => {
        expect(balanceOf({ total: 1000, status: 'pending' }, now)).toBe(1000)
        expect(balanceOf({ ...base, late_fee_rate: 0 }, now)).toBe(1000)
    })

    it('เพดานจำกัดค่าปรับ', () => {
        expect(balanceOf({ ...base, late_fee_cap: 100 }, now)).toBe(1100)
    })
})

describe('daysLate เมื่อใบไม่มี due_date', () => {
    const now = new Date('2026-11-10T10:00:00+07:00')
    const base = { month: '2026-10', status: 'pending' }

    it('ไม่มี due_date และไม่ส่ง dueDay = 0 (ไม่รู้วันครบกำหนด)', () => {
        expect(daysLate(base, now)).toBe(0)
    })

    it('ส่ง dueDay: คำนวณจากวันที่ dueDay ของเดือนถัดไป', () => {
        expect(daysLate(base, now, 5)).toBe(5)
        expect(daysLate(base, now, 10)).toBe(0)
        expect(daysLate(base, now, 28)).toBe(0)
    })

    it('มี due_date ของใบ ใช้ของใบ ไม่สนใจ dueDay', () => {
        expect(daysLate({ ...base, due_date: '2026-11-08' }, now, 5)).toBe(2)
    })

    it('ชำระแล้ว = 0 เสมอ', () => {
        expect(daysLate({ ...base, status: 'paid' }, now, 5)).toBe(0)
    })
})

describe('slipAsOf / balanceAtSlip', () => {
    const base = { total: 1000, due_date: '2026-11-05', late_fee_rate: 50, late_fee_grace: 0, status: 'review' }

    it('ใช้วันที่ส่งสลิป ถ้าไม่รู้วันที่โอน', () => {
        expect(slipAsOf({ ...base, slip_uploaded_at: '2026-11-08T09:00:00+07:00' })).toBe('2026-11-08')
    })

    it('โอนก่อนเที่ยงคืน ส่งสลิปหลังเที่ยงคืน ใช้วันที่โอน (ต้องตรงกับ asof_date)', () => {
        const inv = { ...base, slip_uploaded_at: '2026-11-06T00:10:00+07:00', verify_detail: { date: '2026-11-05T23:58:00+07:00' } }
        expect(slipAsOf(inv)).toBe('2026-11-05')
        expect(balanceAtSlip(inv)).toBe(1000)
    })

    it('วันที่โอนที่อ่านไม่ได้หรือหลังวันส่งสลิป ใช้วันที่ส่งสลิป', () => {
        expect(slipAsOf({ ...base, slip_uploaded_at: '2026-11-06T09:00:00+07:00', verify_detail: { date: 'x' } })).toBe('2026-11-06')
        expect(slipAsOf({ ...base, slip_uploaded_at: '2026-11-06T09:00:00+07:00', verify_detail: { date: '2026-11-09T09:00:00+07:00' } })).toBe('2026-11-06')
    })

    it('ยอดสำหรับสลิป หักที่ได้รับแล้ว', () => {
        expect(balanceAtSlip({ ...base, paid_amount: 600, slip_uploaded_at: '2026-11-07T09:00:00+07:00' })).toBe(500)
    })
})

describe('dueDateIso / lateFeeSnapshot', () => {
    it('วันครบกำหนดคือวันที่ dueDay ของเดือนถัดไป', () => {
        expect(dueDateIso('2026-10', 5)).toBe('2026-11-05')
        expect(dueDateIso('2026-12', 10)).toBe('2027-01-10')
    })

    it('ไม่คิดค่าปรับ (อัตรา 0) = ไม่มีฟิลด์เพิ่มลงใบ', () => {
        expect(lateFeeSnapshot({ lateFeePerDay: 0, dueDay: 5 }, '2026-10')).toEqual({})
    })

    it('เปิดใช้ค่าปรับ: จำอัตรา ผ่อนผัน เพดาน และวันครบกำหนดลงใบ', () => {
        expect(lateFeeSnapshot({ lateFeePerDay: 50, lateFeeGraceDays: 2, lateFeeCap: 500, dueDay: 7 }, '2026-10')).toEqual({
            due_date: '2026-11-07', late_fee_rate: 50, late_fee_grace: 2, late_fee_cap: 500,
        })
        expect(lateFeeSnapshot({ lateFeePerDay: 50, lateFeeGraceDays: 0, lateFeeCap: '', dueDay: 5 }, '2026-10').late_fee_cap).toBeNull()
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
