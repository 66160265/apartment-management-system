import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// supabase จำลอง: channel() คืนออบเจ็กต์ที่เก็บ handler ไว้ให้เทสต์ยิงเหตุการณ์เข้าไป
const channels = []
const authHandlers = []
vi.mock('./supabaseClient', () => ({
    supabase: {
        channel: vi.fn((name) => {
            const ch = { name, handlers: [], subscribed: false }
            ch.on = vi.fn((type, filter, handler) => {
                ch.filter = filter
                ch.handlers.push(handler)
                return ch
            })
            ch.subscribe = vi.fn(() => {
                ch.subscribed = true
                return ch
            })
            channels.push(ch)
            return ch
        }),
        removeChannel: vi.fn((ch) => {
            ch.removed = true
        }),
        auth: { onAuthStateChange: vi.fn((cb) => authHandlers.push(cb)) },
    },
}))

const { supabase } = await import('./supabaseClient')
// สถานะของโมดูล (ช่องทางที่เปิดอยู่) ตกค้างข้ามข้อทดสอบได้ จึงโหลดโมดูลใหม่ทุกข้อ
let subscribeTable
let createLiveTrigger
let CLOSE_DELAY_MS
async function freshModule() {
    vi.resetModules()
    authHandlers.length = 0
    ;({ subscribeTable, createLiveTrigger, CLOSE_DELAY_MS } = await import('./realtime'))
}

const fire = (ch, payload = { eventType: 'UPDATE' }) => ch.handlers.forEach((h) => h(payload))

describe('subscribeTable', () => {
    beforeEach(async () => {
        await freshModule()
        vi.useFakeTimers()
        channels.length = 0
        supabase.channel.mockClear()
        supabase.removeChannel.mockClear()
    })
    afterEach(() => vi.useRealTimers())

    it('ฟังทุกเหตุการณ์ของตารางนั้นในสคีมา public และเริ่มสมัครรับทันที', () => {
        subscribeTable('invoices', () => {})
        expect(channels).toHaveLength(1)
        expect(channels[0].filter).toEqual({ event: '*', schema: 'public', table: 'invoices' })
        expect(channels[0].subscribed).toBe(true)
    })

    it('หลายตัวฟังตารางเดียวกัน ใช้ช่องทางเดียว และทุกตัวได้รับเหตุการณ์', () => {
        const a = vi.fn()
        const b = vi.fn()
        subscribeTable('repairs', a)
        subscribeTable('repairs', b)
        expect(channels).toHaveLength(1)
        fire(channels[0], { id: 1 })
        expect(a).toHaveBeenCalledWith({ id: 1 })
        expect(b).toHaveBeenCalledWith({ id: 1 })
    })

    it('คนละตารางแยกช่องทางกัน และไม่ส่งเหตุการณ์ข้ามตาราง', () => {
        const inv = vi.fn()
        const rep = vi.fn()
        subscribeTable('invoices', inv)
        subscribeTable('rooms', rep)
        expect(channels).toHaveLength(2)
        fire(channels.find((c) => c.name === 'live-rooms'))
        expect(rep).toHaveBeenCalledTimes(1)
        expect(inv).not.toHaveBeenCalled()
    })

    it('เลิกฟัง: ตัวที่เลิกแล้วไม่ได้รับ ตัวที่เหลือยังได้รับ และช่องทางยังเปิด', () => {
        const a = vi.fn()
        const b = vi.fn()
        const offA = subscribeTable('tenants', a)
        subscribeTable('tenants', b)
        offA()
        fire(channels[0])
        expect(a).not.toHaveBeenCalled()
        expect(b).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(CLOSE_DELAY_MS * 2)
        expect(supabase.removeChannel).not.toHaveBeenCalled()
    })

    it('คนสุดท้ายเลิกฟัง: รอสักครู่ค่อยปิดช่องทาง', () => {
        const off = subscribeTable('rooms', () => {})
        off()
        expect(supabase.removeChannel).not.toHaveBeenCalled()
        vi.advanceTimersByTime(CLOSE_DELAY_MS + 10)
        expect(supabase.removeChannel).toHaveBeenCalledTimes(1)
        expect(channels[0].removed).toBe(true)
    })

    it('เลิกแล้วสมัครใหม่ภายในเวลารอ (เปลี่ยนหน้า/StrictMode) ใช้ช่องทางเดิม ไม่เปิดซ้ำและไม่ปิด', () => {
        const off = subscribeTable('rooms', () => {})
        off()
        vi.advanceTimersByTime(CLOSE_DELAY_MS - 100)
        const listener = vi.fn()
        subscribeTable('rooms', listener)
        vi.advanceTimersByTime(CLOSE_DELAY_MS * 3)
        expect(channels).toHaveLength(1)
        expect(supabase.removeChannel).not.toHaveBeenCalled()
        fire(channels[0])
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('ปิดช่องทางแล้วสมัครใหม่ สร้างช่องทางใหม่', () => {
        subscribeTable('rooms', () => {})()
        vi.advanceTimersByTime(CLOSE_DELAY_MS + 10)
        subscribeTable('rooms', () => {})
        expect(channels).toHaveLength(2)
    })

    it('ออกจากระบบ: ปิดทุกช่องทางทันที', () => {
        subscribeTable('invoices', () => {})
        subscribeTable('repairs', () => {})
        authHandlers.forEach((cb) => cb('SIGNED_OUT'))
        expect(supabase.removeChannel).toHaveBeenCalledTimes(2)
        // สมัครใหม่หลังออกจากระบบ ต้องเปิดช่องทางใหม่ (ไม่ใช้ของเดิมที่ถูกปิดไปแล้ว)
        const before = channels.length
        subscribeTable('invoices', () => {})
        expect(channels.length).toBe(before + 1)
    })

    it('เหตุการณ์ auth อื่น (เช่น ต่ออายุโทเค็น) ไม่ปิดช่องทาง', () => {
        subscribeTable('invoices', () => {})
        supabase.removeChannel.mockClear()
        authHandlers.forEach((cb) => cb('TOKEN_REFRESHED'))
        expect(supabase.removeChannel).not.toHaveBeenCalled()
    })
})

describe('createLiveTrigger', () => {
    beforeEach(async () => {
        await freshModule()
        vi.useFakeTimers()
    })
    afterEach(() => vi.useRealTimers())

    it('เหตุการณ์ติดกันหลายครั้ง รวมเป็นการโหลดครั้งเดียวหลังเหตุการณ์สุดท้าย', () => {
        const reload = vi.fn()
        const t = createLiveTrigger({ reload, wait: 400 })
        t.onChange()
        vi.advanceTimersByTime(300)
        t.onChange()
        vi.advanceTimersByTime(300)
        t.onChange()
        expect(reload).not.toHaveBeenCalled()
        vi.advanceTimersByTime(399)
        expect(reload).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('เหตุการณ์ที่ห่างกันเกินเวลารอ โหลดแยกรอบ', () => {
        const reload = vi.fn()
        const t = createLiveTrigger({ reload, wait: 400 })
        t.onChange()
        vi.advanceTimersByTime(500)
        t.onChange()
        vi.advanceTimersByTime(500)
        expect(reload).toHaveBeenCalledTimes(2)
    })

    it('กลับมาที่แท็บหลังซ่อมนาน: โหลดตามทันที แต่ซ่อมแป๊บเดียวไม่โหลด', () => {
        const reload = vi.fn()
        let clock = 1_000_000
        const t = createLiveTrigger({ reload, wait: 100, catchUpMs: 20000, now: () => clock })
        t.onHidden()
        clock += 5000
        t.onVisible()
        vi.advanceTimersByTime(200)
        expect(reload).not.toHaveBeenCalled()

        t.onHidden()
        clock += 25000
        t.onVisible()
        vi.advanceTimersByTime(200)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('onVisible โดยไม่เคยซ่อน ไม่โหลด', () => {
        const reload = vi.fn()
        const t = createLiveTrigger({ reload, wait: 100 })
        t.onVisible()
        vi.advanceTimersByTime(500)
        expect(reload).not.toHaveBeenCalled()
    })

    it('กลับมาออนไลน์: โหลดตาม', () => {
        const reload = vi.fn()
        const t = createLiveTrigger({ reload, wait: 100 })
        t.onOnline()
        vi.advanceTimersByTime(100)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('dispose ยกเลิกการโหลดที่รออยู่', () => {
        const reload = vi.fn()
        const t = createLiveTrigger({ reload, wait: 400 })
        t.onChange()
        t.dispose()
        vi.advanceTimersByTime(1000)
        expect(reload).not.toHaveBeenCalled()
    })
})
