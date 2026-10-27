// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// ข้อมูลจำลองของแต่ละตาราง (เปลี่ยนต่อเทสต์)
const db = {}
vi.mock('../lib/supabaseClient', () => {
    const builder = (table) => {
        const b = {
            select: () => b,
            order: () => b,
            eq: () => b,
            gt: () => b,
            limit: () => b,
            in: () => b,
            neq: () => b,
            maybeSingle: () => Promise.resolve({ data: db[table] ?? null, error: null }),
            then: (resolve, reject) => Promise.resolve({ data: Array.isArray(db[table]) ? db[table] : [], error: null }).then(resolve, reject),
        }
        return b
    }
    const channel = () => {
        const ch = { on: () => ch, subscribe: () => ch }
        return ch
    }
    return {
        supabase: {
            from: (t) => builder(t),
            channel,
            removeChannel: () => {},
            auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }), getSession: () => Promise.resolve({ data: { session: null } }) },
        },
    }
})
// ต้องคืนอ็อบเจ็กต์เดิมทุกครั้ง (หน้าโหลดข้อมูลใหม่เมื่อ me เปลี่ยน ถ้าสร้างใหม่ทุกรอบจะวนไม่จบ)
const meRef = vi.hoisted(() => ({ me: { id: 'u1', role: 'user', tenant: { room: '101', name: 'สมชาย', phone: '0800000000' } } }))
vi.mock('../lib/useCurrentUser', () => ({ useCurrentUser: () => meRef.me }))

const { default: UserDashboardPage } = await import('./UserDashboardPage.jsx')

const monthsAgo = (n) => {
    const d = new Date(Date.now() + 7 * 3600000)
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() - n)
    return d.toISOString().slice(0, 7)
}
const inv = (over) => ({
    id: Math.random().toString(36).slice(2), room: '101', month: monthsAgo(1), rent: 3000, total: 3000, paid_amount: 0, status: 'pending',
    water_prev: 0, water_curr: 0, elec_prev: 0, elec_curr: 0, water_rate: 0, elec_rate: 0, common_fee: 0, late_fee_rate: 0, ...over,
})

let container
let root
async function mount() {
    await act(async () => {
        root.render(
            <MemoryRouter>
                <UserDashboardPage />
            </MemoryRouter>,
        )
    })
    for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() })
}
const text = () => container.textContent

describe('หน้าภาพรวมผู้เช่า (เรนเดอร์จริง)', () => {
    beforeEach(() => {
        for (const k of Object.keys(db)) delete db[k]
        db.rooms = { number: '101', floor: 2 }
        delete meRef.me.tenant.end_date
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })
    afterEach(async () => {
        await act(async () => root.unmount())
        container.remove()
    })

    it('ค้างหลายใบ: แสดงแถบรวมยอดค้าง เรียงเก่าสุดก่อน และเลือกใบเก่าสุดเป็นใบที่กำลังดู', async () => {
        db.invoices = [
            inv({ id: 'new', month: monthsAgo(0), total: 1000 }),
            inv({ id: 'old', month: monthsAgo(2), total: 2500 }),
        ]
        await mount()
        const t = text()
        expect(t).toContain('มี 2 ใบที่ยังต้องชำระ · รวม ฿3,500')
        expect(container.querySelectorAll('section button').length).toBe(2)
        // การ์ดยอดแสดงใบเก่าสุด
        expect(container.querySelector('.tabular-nums.font-bold').textContent.trim()).toBe('฿2,500')
    })

    it('ค้างใบเดียว: ไม่แสดงแถบรวม (การ์ดการดำเนินการครอบคลุมแล้ว)', async () => {
        db.invoices = [inv({})]
        await mount()
        expect(text()).not.toContain('ที่ยังต้องชำระ')
        expect(text()).toContain('ชำระเงิน / อัปโหลดสลิป')
    })

    it('วันครบกำหนดมาจากใบหรือหน้าตั้งค่า ไม่ใช่วันที่ 5 ตายตัว', async () => {
        db.invoices = [inv({ month: monthsAgo(1), due_date: '2030-01-20' })]
        await mount()
        expect(text()).toContain(new Date('2030-01-20T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }))
    })

    it('ไม่มีการ์ดน้ำ-ไฟซ้ำ และไม่มีลิงก์ประวัติใบแจ้งหนี้ (ดูได้จากเมนูข้าง)', async () => {
        db.invoices = [inv({ water_curr: 10, water_rate: 18, elec_curr: 20, elec_rate: 8 })]
        await mount()
        expect(text()).not.toContain('การใช้น้ำและไฟฟ้าเดือนนี้')
        expect(text()).toContain('ค่าน้ำ 10 หน่วย')
        expect(text()).not.toContain('ดูประวัติใบแจ้งหนี้ทั้งหมด')
    })

    it('ชำระครบทุกใบ: ไม่มีแถบค้างชำระ', async () => {
        db.invoices = [inv({ status: 'paid', paid_amount: 3000 }), inv({ status: 'paid', paid_amount: 3000, month: monthsAgo(2) })]
        await mount()
        expect(text()).not.toContain('ที่ยังต้องชำระ')
        expect(text()).toContain('ชำระเงินเรียบร้อยแล้ว')
    })

    it('สัญญาจะสิ้นสุดภายใน 30 วัน: เตือนผู้เช่าให้ติดต่อผู้ดูแลหอพัก', async () => {
        meRef.me.tenant.end_date = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
        db.invoices = [inv({})]
        await mount()
        expect(text()).toContain('สัญญาเช่าของคุณจะสิ้นสุดในอีก')
        expect(text()).toContain('ติดต่อผู้ดูแลหอพัก')
    })

    it('สัญญาหมดแล้ว: ขึ้นข้อความว่าสิ้นสุดแล้ว', async () => {
        meRef.me.tenant.end_date = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10)
        db.invoices = [inv({})]
        await mount()
        expect(text()).toContain('สัญญาเช่าของคุณสิ้นสุดแล้ว')
    })

    it('สัญญายังเหลือมากกว่า 30 วัน: ไม่เตือน', async () => {
        meRef.me.tenant.end_date = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10)
        db.invoices = [inv({})]
        await mount()
        expect(text()).not.toContain('สัญญาเช่าของคุณ')
    })
})
