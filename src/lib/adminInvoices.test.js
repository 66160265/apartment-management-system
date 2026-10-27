import { describe, expect, it } from 'vitest'
import { filterInvoices, formFromInvoice, invoiceAmounts, invoiceFormValues, invoiceStats, invoiceTotals, makeEmptyForm, validateInvoiceForm } from './adminInvoices'

const settings = { rateWater: 18, rateElectric: 8, commonFee: 200 }
const tenants = [{ room: '101', name: 'สมชาย', user_id: 'u1' }, { room: '102', name: 'สมหญิง', user_id: null }]
const inv = (over = {}) => ({
    id: 'i1', room: '101', tenant_name: 'สมชาย', month: '2026-10', status: 'pending', rent: 4500, total: 5000,
    water_prev: 0, water_curr: 10, water_rate: 18, elec_prev: 0, elec_curr: 20, elec_rate: 8, common_fee: 200, ...over,
})

describe('invoiceFormValues', () => {
    it('อัตราที่ยังไม่กำหนดใช้ค่าจากหน้าตั้งค่า และคำนวณยอดจากมิเตอร์', () => {
        const form = { ...makeEmptyForm(), room: '101', waterPrev: 0, waterCurr: '10', elecPrev: 0, elecCurr: '20' }
        const v = invoiceFormValues({ form, settings, tenants, invoices: [], rents: { 101: 4500 }, editingId: null })
        expect(v.tenant.name).toBe('สมชาย')
        expect(v.rent).toBe(4500)
        expect(v.numbers).toMatchObject({ waterRate: 18, elecRate: 8, commonFee: 200 })
        expect(v.calc.total).toBe(4500 + 10 * 18 + 20 * 8 + 200)
    })

    it('ตอนแก้ไขใช้ค่าเช่าที่บันทึกไว้ในใบเดิม ไม่ใช่ค่าเช่าปัจจุบันของห้อง', () => {
        const form = formFromInvoice(inv({ rent: 4000 }))
        const v = invoiceFormValues({ form, settings, tenants, invoices: [inv({ rent: 4000 })], rents: { 101: 4500 }, editingId: 'i1' })
        expect(v.rent).toBe(4000)
        expect(v.editing.id).toBe('i1')
    })
})

describe('validateInvoiceForm', () => {
    const ok = () => {
        const form = { ...makeEmptyForm(), room: '101', waterCurr: '10', elecCurr: '20' }
        const { numbers, tenant } = invoiceFormValues({ form, settings, tenants, invoices: [], rents: {}, editingId: null })
        return { form, numbers, tenant, editingId: null }
    }

    it('ฟอร์มครบและถูกต้อง = ผ่าน', () => {
        expect(validateInvoiceForm(ok())).toBe('')
    })

    it('ไม่เลือกห้อง หรือมิเตอร์ไม่ครบ', () => {
        expect(validateInvoiceForm({ ...ok(), tenant: undefined })).toMatch(/เลือกห้อง/)
        expect(validateInvoiceForm({ ...ok(), form: { ...ok().form, waterCurr: '' } })).toMatch(/เลือกห้อง/)
    })

    it('มิเตอร์ปัจจุบันน้อยกว่าก่อนหน้า', () => {
        const base = ok()
        expect(validateInvoiceForm({ ...base, numbers: { ...base.numbers, waterPrev: 50 } })).toMatch(/ไม่น้อยกว่า/)
    })

    it('อัตราติดลบหรือไม่ใช่ตัวเลข', () => {
        const base = ok()
        expect(validateInvoiceForm({ ...base, numbers: { ...base.numbers, elecRate: -1 } })).toMatch(/ไม่ติดลบ/)
        expect(validateInvoiceForm({ ...base, numbers: { ...base.numbers, commonFee: NaN } })).toMatch(/ไม่ติดลบ/)
    })

    it('ห้องที่ไม่มีบัญชีผู้เช่า สร้างใบใหม่ไม่ได้ แต่แก้ใบเดิมได้', () => {
        const base = ok()
        const noAccount = tenants[1]
        expect(validateInvoiceForm({ ...base, tenant: noAccount })).toMatch(/ไม่มีบัญชีผู้เช่า/)
        expect(validateInvoiceForm({ ...base, tenant: noAccount, editingId: 'i1' })).toBe('')
    })
})

describe('invoiceAmounts', () => {
    it('แปลงตัวเลขในฟอร์มเป็นชื่อคอลัมน์ในฐานข้อมูล', () => {
        const numbers = { waterPrev: 1, waterCurr: 2, waterRate: 18, elecPrev: 3, elecCurr: 4, elecRate: 8, commonFee: 200 }
        expect(invoiceAmounts(numbers, 999)).toEqual({ water_prev: 1, water_curr: 2, water_rate: 18, elec_prev: 3, elec_curr: 4, elec_rate: 8, common_fee: 200, total: 999 })
    })
})

describe('invoiceStats / filterInvoices / invoiceTotals', () => {
    const list = [
        inv({ id: 'a', room: '102', tenant_name: 'ก', month: '2026-09', status: 'paid', total: 3000 }),
        inv({ id: 'b', room: '101', tenant_name: 'ข', month: '2026-10', status: 'pending', total: 5000 }),
        inv({ id: 'c', room: '110', tenant_name: 'ค', month: '2026-10', status: 'review', total: 4000 }),
    ]

    it('นับจำนวนและยอดรวมตามสถานะ', () => {
        const s = invoiceStats(list)
        expect(s.all).toEqual({ count: 3, sum: 12000 })
        expect(s.pending).toEqual({ count: 1, sum: 5000 })
        expect(s.review.count).toBe(1)
        expect(s.paid.sum).toBe(3000)
    })

    it('กรองตามสถานะ เดือน และคำค้นหา เรียงเดือนใหม่สุดก่อน แล้วเลขห้องแบบตัวเลข', () => {
        expect(filterInvoices(list, { filter: 'all', monthFilter: 'all', search: '' }).map((i) => i.id)).toEqual(['b', 'c', 'a'])
        expect(filterInvoices(list, { filter: 'paid', monthFilter: 'all', search: '' }).map((i) => i.id)).toEqual(['a'])
        expect(filterInvoices(list, { filter: 'all', monthFilter: '2026-10', search: '' }).map((i) => i.id)).toEqual(['b', 'c'])
        expect(filterInvoices(list, { filter: 'all', monthFilter: 'all', search: ' 110 ' }).map((i) => i.id)).toEqual(['c'])
        expect(filterInvoices(list, { filter: 'all', monthFilter: 'all', search: 'ก' }).map((i) => i.id)).toEqual(['a'])
    })

    it('ยอดรวมท้ายตาราง', () => {
        const t = invoiceTotals([inv(), inv({ id: 'x', total: 1000, rent: 1000, common_fee: 0 })])
        expect(t.total).toBe(6000)
        expect(t.rent).toBe(5500)
        expect(t.common).toBe(200)
        expect(t.water).toBe(10 * 18 * 2)
    })
})
