import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ReceiptDocument from './ReceiptDocument'

const settings = { apartmentName: 'หอพักทดสอบ', apartmentNameEn: 'Test Apartment', address: '1 ถนนทดสอบ', phone: '021234567', email: '' }
const tenant = { name: 'สมชาย', phone: '0812345678' }
const render = (receipt) =>
    renderToString(<ReceiptDocument receipt={receipt} tenant={tenant} floor={1} settings={settings} />).replace(/<!-- -->/g, '')

const base = {
    kind: 'invoice', code: 'RC-2026-000012', date: '2026-10-20T10:30:00+07:00', room: '101', tenantName: 'สมชาย',
    description: 'ค่าเช่าและค่าบริการ เดือน ต.ค. 69', reference: 'INV-101-202610', amount: 1200, cumulative: 1200, billTotal: 1000,
    lateFee: 200, dueTotal: 1200, installment: null, status: 'paid', overpaid: 0, refunded: false, transRef: '', autoApproved: false,
}

describe('ReceiptDocument (แสดงผลครั้งแรก)', () => {
    it('ใบเสร็จที่ปิดยอด: เลขที่ ผู้ชำระ ยอด ตัวอักษร ค่าปรับ และสถานะชำระครบ', () => {
        const html = render(base)
        for (const text of ['ใบเสร็จรับเงิน', 'เลขที่ RC-2026-000012', 'หอพักทดสอบ', 'สมชาย', 'ห้อง 101 (ชั้น 1)', 'INV-101-202610', '฿1,200',
            'หนึ่งพันสองร้อยบาทถ้วน', 'ค่าปรับชำระล่าช้า', '฿200', 'ชำระครบแล้ว', 'ผู้รับเงิน']) {
            expect(html).toContain(text)
        }
        expect(html).not.toContain('รับชำระบางส่วน')
        expect(html).not.toContain('ยังชำระไม่ครบ')
    })

    it('ใบเสร็จรับบางส่วน: บอกงวดและยอดที่ยังไม่ครบ', () => {
        const html = render({ ...base, amount: 600, cumulative: 600, lateFee: 0, dueTotal: 1000, status: 'partial', installment: { number: 1, of: 2 } })
        expect(html).toContain('รับชำระบางส่วน')
        expect(html).toContain('การรับเงินครั้งที่ 1 จาก 2 ครั้ง')
        expect(html).toContain('ยังชำระไม่ครบ')
        expect(html).not.toContain('ชำระครบแล้ว')
    })

    it('โอนเกิน: บอกยอดที่ต้องโอนคืน หรือโอนคืนแล้ว', () => {
        expect(render({ ...base, overpaid: 300 })).toContain('หอพักจะโอนคืนให้')
        expect(render({ ...base, overpaid: 300, refunded: true })).toContain('โอนคืนยอดที่ชำระเกิน ฿300 แล้ว')
    })

    it('ใบเสร็จค่าซ่อม และเลขอ้างอิงธนาคาร ระบบอัตโนมัติ', () => {
        const html = render({ ...base, kind: 'repair', description: 'ค่าซ่อม: ก๊อกน้ำรั่ว', reference: '', amount: 350, billTotal: 350, lateFee: 0, transRef: 'TR123', autoApproved: true })
        expect(html).toContain('ค่าซ่อม: ก๊อกน้ำรั่ว')
        expect(html).toContain('เลขอ้างอิงธนาคาร TR123')
        expect(html).toContain('ตรวจสอบสลิปอัตโนมัติ')
        expect(html).not.toContain('อ้างอิงใบแจ้งหนี้')
    })

    it('ข้อมูลเดิมที่ไม่มีเลขที่ ไม่แสดงบรรทัดเลขที่และไม่ error', () => {
        expect(render({ ...base, code: '' })).not.toContain('เลขที่ ')
    })
})
