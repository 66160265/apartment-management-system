// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// ข้อมูลจำลองของแต่ละตาราง (เปลี่ยนต่อเทสต์) tables ที่ตั้งเป็น 'error' = ตารางยังไม่มีในฐานข้อมูล
const db = {}
vi.mock('../lib/supabaseClient', () => {
    const builder = (table, { head } = {}) => {
        const b = {
            select: (_cols, opts) => builder(table, { head: Boolean(opts?.head) }),
            order: () => b,
            range: () => b,
            eq: () => b,
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            then: (resolve, reject) => {
                const entry = db[table]
                const result = entry === 'error'
                    ? { data: null, error: { message: 'relation does not exist' }, count: null }
                    : head
                        ? { data: null, error: null, count: entry ?? 0 }
                        : { data: typeof entry === 'number' ? [] : entry ?? [], error: null }
                return Promise.resolve(result).then(resolve, reject)
            },
        }
        return b
    }
    const channel = () => {
        const ch = { on: () => ch, subscribe: () => ch }
        return ch
    }
    return { supabase: { from: (t) => builder(t), channel, removeChannel: () => {}, auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }), getSession: () => Promise.resolve({ data: { session: null } }) } } }
})

const { default: AdminDashboardPage } = await import('./AdminDashboardPage.jsx')

// วันที่ที่ใช้สร้างข้อมูล อิงวันนี้จริง (หน้าใช้เวลาปัจจุบัน)
const iso = (offsetDays) => new Date(Date.now() + 7 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
const monthNow = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7)
const monthAgo = () => {
    const d = new Date(Date.now() + 7 * 3600000)
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - 1)
    return d.toISOString().slice(0, 7)
}

const inv = (over) => ({
    id: Math.random().toString(36).slice(2), room: '101', tenant_name: 'สมชาย', month: monthAgo(), total: 1000, paid_amount: 0, status: 'pending',
    late_fee_rate: 0, refund_amount: 0, refund_status: null, created_at: new Date().toISOString(), ...over,
})

let container
let root
async function mount() {
    await act(async () => {
        root.render(
            <MemoryRouter>
                <AdminDashboardPage />
            </MemoryRouter>,
        )
    })
    // รอ promise ของการโหลดข้อมูลเสร็จ
    for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() })
}
const text = () => container.textContent
const links = () => [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))

describe('หน้าภาพรวมแอดมิน (เรนเดอร์จริง)', () => {
    beforeEach(() => {
        for (const k of Object.keys(db)) delete db[k]
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })
    afterEach(async () => {
        await act(async () => root.unmount())
        container.remove()
    })

    it('ต้องจัดการตอนนี้: แสดงเฉพาะรายการที่มี พร้อมจำนวน ยอดรวม และลิงก์ไปหน้าที่เกี่ยวข้อง', async () => {
        db.invoices = [
            inv({ status: 'review' }),
            inv({ status: 'review', room: '102' }),
        ]
        db.rooms = [{ number: '101', status: 'occupied' }]
        db.repair_payments = [{ amount: 350, status: 'review', reviewed_at: null }]
        db.repairs = 3
        await mount()
        const t = text()
        expect(t).toContain('สลิปค่าห้องรอตรวจสอบ')
        expect(t).toContain('สลิปค่าซ่อมรอตรวจสอบ')
        expect(t).toContain('เรื่องแจ้งซ่อมรอดำเนินการ')
        expect(t).not.toContain('รอโอนคืน')
        expect(t).not.toContain('เงินประกันรอคืน')
        expect(t).not.toContain('ไม่มีงานค้าง')
        for (const to of ['/invoices', '/repairs']) expect(links()).toContain(to)
    })

    it('ไม่มีงานค้างเลย: แสดงข้อความว่าไม่มีงานค้าง', async () => {
        db.invoices = [inv({ status: 'paid', paid_amount: 1000, month: monthNow() })]
        db.rooms = [{ number: '101', status: 'occupied' }]
        db.tenants = [{ room: '101', end_date: iso(+200) }]
        await mount()
        expect(text()).toContain('ไม่มีงานค้าง')
    })

    it('เตือนห้องที่ยังไม่ออกบิลเดือนนี้ และสัญญาที่หมดหรือใกล้หมด', async () => {
        db.invoices = [inv({ status: 'paid', paid_amount: 1000, month: monthNow(), room: '101' })]
        db.rooms = [{ number: '101', status: 'occupied' }, { number: '102', status: 'occupied' }, { number: '103', status: 'vacant' }]
        db.tenants = [{ room: '101', end_date: iso(+10) }, { room: '102', end_date: iso(-3) }, { room: '104', end_date: iso(+90) }]
        await mount()
        expect(text()).toContain('ห้องที่ยังไม่ออกบิลเดือนนี้')
        expect(text()).toContain('สัญญาใกล้หมด (ภายใน 30 วัน)')
        expect(text()).not.toContain('ไม่มีงานค้าง')
    })

    it('เกินกำหนดชำระ: นับเฉพาะใบรอชำระที่เลยกำหนด ไม่นับใบรอตรวจสลิปหรือใบที่ยังไม่ถึงกำหนด', async () => {
        db.invoices = [
            inv({ room: '101', tenant_name: 'ค้างนาน', due_date: iso(-12), total: 2000 }),
            inv({ room: '102', tenant_name: 'ส่งสลิปแล้ว', status: 'review', due_date: iso(-12) }),
            inv({ room: '103', tenant_name: 'ยังไม่ถึงกำหนด', month: monthNow(), due_date: iso(+10) }),
        ]
        db.rooms = [{ number: '101', status: 'occupied' }, { number: '102', status: 'occupied' }, { number: '103', status: 'occupied' }]
        await mount()
        const t = text()
        expect(t).toContain('ค้างนาน')
        expect(t).toContain('12 วัน')
        expect(t).toContain('฿2,000')
        expect(t).not.toContain('ยังไม่ถึงกำหนด ·')
        expect(t).toContain('ยังไม่ถึงกำหนดอีก 1 ใบ')
        // ห้องที่ส่งสลิปแล้ว ไม่อยู่ในตารางเกินกำหนด (แต่อยู่ในแถบต้องจัดการ)
        expect(t).not.toContain('ส่งสลิปแล้ว')
        expect(t).toContain('สลิปค่าห้องรอตรวจสอบ')
    })

    it('ใบที่ไม่มี due_date: คำนวณวันเกินกำหนดจากวันครบกำหนดในหน้าตั้งค่า (ค่าเริ่มต้นวันที่ 5)', async () => {
        // ใบของเดือนที่แล้ว ครบกำหนดวันที่ 5 ของเดือนนี้ ถ้าวันนี้เลยวันที่ 5 แล้วต้องนับเป็นเกินกำหนด
        const today = Number(iso(0).slice(8, 10))
        db.invoices = [inv({ tenant_name: 'ใบเก่าไม่มีวันครบกำหนด' })]
        db.rooms = [{ number: '101', status: 'occupied' }]
        await mount()
        if (today > 5) expect(text()).toContain('ใบเก่าไม่มีวันครบกำหนด')
        else expect(text()).toContain('ไม่มีใบแจ้งหนี้ที่เกินกำหนดชำระ')
    })

    it('การเงินของเดือน: เรียกเก็บ ได้รับจริง (ค่าห้อง+ค่าซ่อม) และยังค้าง', async () => {
        // หน้านี้แสดงบิลของ "เดือนก่อนหน้า" ที่ออกในเดือนที่เลือก (บิลเดือน ก.ย. ออกในเดือน ต.ค.) ส่วนเงินที่รับจริงนับตามเดือนที่รับ
        const [y, mo] = monthNow().split('-').map(Number)
        const m = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`
        db.invoices = [
            inv({ month: m, total: 1000, status: 'paid', paid_amount: 1000 }),
            inv({ month: m, room: '102', total: 2000, status: 'pending', paid_amount: 500, due_date: iso(+5) }),
            // ใบของเดือนนี้ ทำให้หน้าเลือกเดือนปัจจุบันเป็นเดือนที่แสดง (เดือนก่อนหน้าจึงเป็นบิลที่เรียกเก็บ)
            inv({ month: monthNow(), room: '103', total: 0, status: 'paid', paid_amount: 0 }),
        ]
        db.rooms = [{ number: '101', status: 'occupied' }]
        db.invoice_payments = [
            { amount: 1000, confirmed_at: new Date().toISOString() },
            { amount: 500, confirmed_at: new Date().toISOString() },
        ]
        db.repair_payments = [{ amount: 350, status: 'paid', reviewed_at: new Date().toISOString() }]
        await mount()
        const t = text()
        expect(t).toContain('(2 ใบ)')
        expect(t).toContain('เรียกเก็บ บิลเดือน')
        expect(t).toContain('฿3,000')
        // ได้รับ 1000 + 500 + ค่าซ่อม 350
        expect(t).toContain('฿1,850')
        // ค้าง 2000 - 500
        expect(t).toContain('฿1,500')
    })

    it('อัตราเข้าพัก: นับห้องมีผู้เช่า ไม่รวมห้องปิดปรับปรุง', async () => {
        db.invoices = []
        db.rooms = [
            ...Array.from({ length: 6 }, (_, i) => ({ number: `10${i}`, status: 'occupied' })),
            ...Array.from({ length: 3 }, (_, i) => ({ number: `20${i}`, status: 'vacant' })),
            { number: '300', status: 'maintenance' },
        ]
        await mount()
        expect(text()).toContain('66.7%')
        expect(text()).toContain('มีผู้เช่า 6 จาก 9 ห้อง')
        expect(text()).toContain('ว่าง 3 ห้อง')
    })

    it('ตารางจากไฟล์ SQL รุ่นหลังยังไม่มี: หน้ายังใช้ได้ ไม่ error และไม่แสดงงานค้างจากตารางนั้น', async () => {
        db.invoices = [inv({ status: 'review' })]
        db.rooms = [{ number: '101', status: 'occupied' }]
        db.invoice_payments = 'error'
        db.repair_payments = 'error'
        db.repairs = 'error'
        db.move_outs = 'error'
        await mount()
        expect(text()).toContain('สลิปค่าห้องรอตรวจสอบ')
        expect(text()).not.toContain('เกิดข้อผิดพลาด')
    })

    it('ไม่มีส่วนสถิติน้ำ-ไฟและป้ายซ้ำของเดิม (ย้ายไปหน้ารายงาน) และมีลิงก์ไปหน้ารายงาน', async () => {
        db.invoices = [inv({ water_prev: 0, water_curr: 10, elec_prev: 0, elec_curr: 20 })]
        db.rooms = [{ number: '101', status: 'occupied' }]
        await mount()
        expect(text()).not.toContain('สถิติการใช้น้ำ/ไฟ')
        expect(text()).not.toContain('ค่าน้ำ/ค่าไฟรวม')
        expect(text()).not.toContain('หน่วยละ')
        expect(links()).toContain('/admin/reports')
    })

    it('โหลดใบแจ้งหนี้ไม่ได้: แสดงข้อความผิดพลาดพร้อมปุ่มลองใหม่', async () => {
        db.invoices = 'error'
        db.rooms = []
        await mount()
        expect(text()).toContain('เกิดข้อผิดพลาดในการโหลดข้อมูล')
        expect(text()).toContain('ลองใหม่')
    })

    it('เกินกำหนดเกิน 8 ใบ: แสดง 8 รายการแรกและลิงก์ไปดูทั้งหมดในรายงาน', async () => {
        db.invoices = Array.from({ length: 11 }, (_, i) => inv({ room: String(100 + i), tenant_name: `ผู้เช่า${i}`, due_date: iso(-(20 - i)) }))
        db.rooms = [{ number: '101', status: 'occupied' }]
        await mount()
        expect(container.querySelectorAll('tbody tr').length).toBe(8)
        expect(text()).toContain('จากทั้งหมด 11 ใบ')
        expect(text()).toContain('ดูทั้งหมดและส่งออกในหน้ารายงาน')
    })
})
