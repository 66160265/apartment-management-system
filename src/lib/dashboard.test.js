import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

const { overdueInvoices, notYetDueCount, uniqueRooms, attentionItems, tenantUnpaid, invoiceDueDate, expiringContracts, uninvoicedRooms } = await import('./dashboard')

const now = new Date('2026-11-10T10:00:00+07:00')
const inv = (over = {}) => ({ id: 'i', room: '101', tenant_name: 'สมชาย', month: '2026-10', total: 1000, paid_amount: 0, status: 'pending', ...over })

describe('overdueInvoices', () => {
    it('ใบที่เลยวันครบกำหนดแล้ว (ใช้ due_date ของใบ)', () => {
        const rows = overdueInvoices([inv({ due_date: '2026-11-05' })], now)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ room: '101', daysLate: 5, balance: 1000 })
    })

    it('ใบที่ไม่มี due_date (ออกตอนไม่ได้เปิดค่าปรับ) ใช้วันครบกำหนดจากหน้าตั้งค่า', () => {
        // เดือน 2026-10 ครบกำหนดวันที่ 5 ของเดือนถัดไป = 2026-11-05 วันนี้ 11-10 เกิน 5 วัน
        expect(overdueInvoices([inv()], now, 5)[0].daysLate).toBe(5)
        // ไม่ส่ง dueDay และไม่มี due_date = ไม่รู้วันครบกำหนด ไม่นับว่าเกินกำหนด
        expect(overdueInvoices([inv()], now)).toEqual([])
    })

    it('ยังไม่ถึงวันครบกำหนด ไม่นับ (ออกบิลวันที่ 1 ไม่ขึ้นว่าค้างทันที)', () => {
        expect(overdueInvoices([inv({ month: '2026-11' })], now, 5)).toEqual([])
        expect(overdueInvoices([inv({ due_date: '2026-11-10' })], now)).toEqual([])
    })

    it('ใบที่ผู้เช่าส่งสลิปรอตรวจ (review) และใบที่ชำระแล้ว ไม่นับว่าเกินกำหนด', () => {
        expect(overdueInvoices([inv({ status: 'review', due_date: '2026-11-01' }), inv({ id: 'p', status: 'paid', due_date: '2026-11-01', paid_amount: 1000 })], now)).toEqual([])
    })

    it('ยอดค้างรวมค่าปรับของวันนี้ และหักที่ได้รับแล้ว', () => {
        const late = inv({ due_date: '2026-11-05', late_fee_rate: 50, late_fee_grace: 0, late_fee_cap: null, paid_amount: 400 })
        expect(overdueInvoices([late], now)[0].balance).toBe(850)
    })

    it('ใบที่ค้าง 0 ไม่แสดง', () => {
        expect(overdueInvoices([inv({ due_date: '2026-11-05', paid_amount: 1000 })], now)).toEqual([])
    })

    it('เรียงเกินกำหนดนานสุดก่อน แล้วเลขห้อง (แบบตัวเลข)', () => {
        const rows = overdueInvoices(
            [
                inv({ id: 'a', room: '102', due_date: '2026-11-08' }),
                inv({ id: 'b', room: '20', due_date: '2026-11-08' }),
                inv({ id: 'c', room: '101', due_date: '2026-10-20' }),
            ],
            now,
        )
        expect(rows.map((r) => r.room)).toEqual(['101', '20', '102'])
    })
})

describe('notYetDueCount / uniqueRooms', () => {
    it('นับใบที่รอชำระแต่ยังไม่ถึงกำหนด', () => {
        const list = [
            inv({ id: 'a', month: '2026-11' }),
            inv({ id: 'b', month: '2026-10' }),
            inv({ id: 'c', month: '2026-11', status: 'review' }),
            inv({ id: 'd', month: '2026-11', status: 'paid', paid_amount: 1000 }),
        ]
        expect(notYetDueCount(list, now, 5)).toBe(1)
    })

    it('uniqueRooms นับห้องไม่ซ้ำ', () => {
        expect(uniqueRooms([{ room: '101' }, { room: '101' }, { room: '102' }])).toBe(2)
        expect(uniqueRooms([])).toBe(0)
    })
})

describe('attentionItems', () => {
    it('ไม่มีอะไรต้องจัดการ = รายการว่าง', () => {
        expect(attentionItems({})).toEqual([])
        expect(attentionItems({ reviewInvoices: 0, refundInvoices: { count: 0, amount: 0 } })).toEqual([])
    })

    it('แสดงเฉพาะรายการที่มี เรียงตามความเร่งด่วน (สลิปก่อน ซ่อม แล้วเงินที่ต้องคืน)', () => {
        const items = attentionItems({
            reviewInvoices: 3,
            repairReviews: 1,
            pendingRepairs: 2,
            refundInvoices: { count: 1, amount: 300 },
            depositRefunds: { count: 2, amount: 6000 },
        })
        expect(items.map((i) => i.key)).toEqual(['invoice-slips', 'repair-slips', 'repairs', 'refunds', 'deposits'])
        expect(items[0]).toMatchObject({ count: 3, to: '/invoices' })
        expect(items[3]).toMatchObject({ count: 1, amount: 300 })
        expect(items[4]).toMatchObject({ count: 2, amount: 6000, to: '/tenants' })
    })

    it('ข้ามรายการที่เป็นศูนย์ ไม่ทำให้รายการอื่นหาย', () => {
        const items = attentionItems({ reviewInvoices: 0, repairReviews: 4, pendingRepairs: 0, depositRefunds: { count: 1, amount: 100 } })
        expect(items.map((i) => i.key)).toEqual(['repair-slips', 'deposits'])
    })

    it('ทุกรายการลิงก์ไปหน้าที่มีอยู่จริงในระบบ', () => {
        const items = attentionItems({ reviewInvoices: 1, repairReviews: 1, pendingRepairs: 1, refundInvoices: { count: 1, amount: 1 }, depositRefunds: { count: 1, amount: 1 } })
        for (const i of items) expect(['/invoices', '/repairs', '/tenants']).toContain(i.to)
    })
})

describe('tenantUnpaid / invoiceDueDate', () => {
    it('invoiceDueDate ใช้ due_date ของใบ ไม่มีก็คำนวณจากวันครบกำหนดในตั้งค่า', () => {
        expect(invoiceDueDate(inv({ due_date: '2026-11-07' }), 5)).toBe('2026-11-07')
        expect(invoiceDueDate(inv(), 10)).toBe('2026-11-10')
        expect(invoiceDueDate(inv())).toBe('2026-11-05')
    })

    it('เก็บเฉพาะใบรอชำระที่ยังมียอดเหลือ เรียงเก่าสุดก่อน พร้อมวันเกินกำหนด', () => {
        const rows = tenantUnpaid([
            inv({ id: 'new', month: '2026-10', total: 1000 }),
            inv({ id: 'old', month: '2026-09', total: 800, paid_amount: 300 }),
            inv({ id: 'rv', month: '2026-08', status: 'review' }),
            inv({ id: 'pd', month: '2026-07', status: 'paid', paid_amount: 1000 }),
        ], now, 5)
        expect(rows.map((r) => r.id)).toEqual(['old', 'new'])
        expect(rows[0]).toMatchObject({ balance: 500, daysLate: 36, dueDate: '2026-10-05' })
        expect(rows[1]).toMatchObject({ balance: 1000, daysLate: 5 })
    })
})

describe('expiringContracts / uninvoicedRooms', () => {
    it('สัญญาที่หมดแล้วหรือใกล้หมดภายใน 30 วัน เรียงหมดเร็วสุดก่อน', () => {
        const rows = expiringContracts([
            { room: '101', end_date: '2026-12-10' },
            { room: '102', end_date: '2026-11-01' },
            { room: '103', end_date: '2026-11-10' },
            { room: '104', end_date: '2026-12-11' },
            { room: '105', end_date: null },
        ], now)
        expect(rows.map((r) => [r.room, r.daysLeft])).toEqual([['102', -9], ['103', 0], ['101', 30]])
    })

    it('ห้องมีผู้เช่าที่ยังไม่มีใบของเดือนนั้น (ไม่นับห้องว่าง/ปรับปรุง)', () => {
        const rooms = [
            { number: '101', status: 'occupied' },
            { number: '102', status: 'occupied' },
            { number: '103', status: 'vacant' },
            { number: '104', status: 'maintenance' },
        ]
        const rows = uninvoicedRooms(rooms, [inv({ room: '101', month: '2026-11' }), inv({ room: '102', month: '2026-10' })], '2026-11')
        expect(rows.map((r) => r.number)).toEqual(['102'])
    })

    it('attentionItems รวมสองรายการใหม่ และตัดออกถ้าเป็นศูนย์', () => {
        const keys = attentionItems({ uninvoicedRooms: 2, expiringContracts: 1 }).map((i) => i.key)
        expect(keys).toEqual(['uninvoiced', 'contracts'])
        expect(attentionItems({ uninvoicedRooms: 0, expiringContracts: 0 })).toEqual([])
    })
})

describe('attentionItems: โควตาตรวจสลิป', () => {
    const q = (over) => ({ level: 'low', used: 43, quota: 50, remaining: 7, ...over })

    it('ใกล้หมด: แสดงจำนวนครั้งที่เหลือ ลิงก์ไปหน้าตั้งค่า', () => {
        const items = attentionItems({ slipQuota: q() })
        expect(items).toHaveLength(1)
        expect(items[0]).toMatchObject({ key: 'slip-quota', count: 7, to: '/settings' })
        expect(items[0].label).toContain('ใช้ไป 43 จาก 50')
    })

    it('หมดแล้ว: ยังแสดงทั้งที่เหลือ 0', () => {
        const items = attentionItems({ slipQuota: q({ level: 'out', used: 50, remaining: 0 }) })
        expect(items).toHaveLength(1)
        expect(items[0].count).toBe(0)
        expect(items[0].label).toContain('หมดแล้ว')
    })

    it('ปกติหรือไม่ได้ตั้งโควตา: ไม่แสดง', () => {
        expect(attentionItems({ slipQuota: q({ level: 'ok' }) })).toEqual([])
        expect(attentionItems({ slipQuota: q({ level: 'none' }) })).toEqual([])
        expect(attentionItems({})).toEqual([])
    })
})
