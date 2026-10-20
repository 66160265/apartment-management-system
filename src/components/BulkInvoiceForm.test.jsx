import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))

const { default: BulkInvoiceForm } = await import('./BulkInvoiceForm')

// เรนเดอร์ครั้งแรกบนเซิร์ฟเวอร์ (ไม่มีการคลิก) ตรวจว่าตารางแสดงห้อง มิเตอร์ก่อนหน้า และสถานะต่าง ๆ ถูกต้อง
describe('BulkInvoiceForm (แสดงผลครั้งแรก)', () => {
    const settings = { rateWater: 18, rateElectric: 7, commonFee: 100, lateFeePerDay: 0, dueDay: 5 }
    const tenants = [
        { room: '102', name: 'สมชาย', user_id: 'u2' },
        { room: '101', name: 'สมหญิง', user_id: 'u1' },
        { room: '103', name: 'ไม่มีบัญชี', user_id: null },
    ]
    const rents = { 101: 3500, 102: 4000, 103: 3000 }
    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const invoices = [
        { room: '101', month: '2020-01', water_curr: 110, elec_curr: 560 },
        { room: '102', month: thisMonth, water_curr: 1, elec_curr: 1 },
    ]
    const html = renderToString(<BulkInvoiceForm tenants={tenants} rents={rents} invoices={invoices} settings={settings} onDone={() => {}} onCancel={() => {}} />).replace(/<!-- -->/g, '')

    it('แสดงทุกห้องเรียงตามเลขห้อง', () => {
        expect(html.indexOf('101')).toBeGreaterThan(-1)
        expect(html.indexOf('101')).toBeLessThan(html.indexOf('102'))
        expect(html).toContain('สมหญิง')
        expect(html).toContain('สมชาย')
    })

    it('ใส่มิเตอร์ก่อนหน้าจากใบล่าสุดให้ในช่อง', () => {
        expect(html).toContain('value="110"')
        expect(html).toContain('value="560"')
    })

    it('ห้องที่มีใบเดือนนี้แล้วและห้องไม่มีบัญชี ถูกปิดและบอกเหตุผล', () => {
        expect(html).toContain('มีใบแจ้งหนี้เดือนนี้แล้ว')
        expect(html).toContain('ยังไม่มีบัญชีผู้เช่า')
    })

    it('ยังไม่กรอกอะไร: ปุ่มสร้างถูกปิด และบอกว่าพร้อมสร้าง 0 ใบ', () => {
        expect(html).toContain('พร้อมสร้าง 0 ใบ')
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*>สร้างใบแจ้งหนี้ 0 ใบ/)
    })

    it('ใส่อัตราเริ่มต้นจากหน้าตั้งค่า', () => {
        expect(html).toContain('value="18"')
        expect(html).toContain('value="7"')
        expect(html).toContain('value="100"')
    })
})
