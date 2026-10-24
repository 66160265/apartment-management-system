// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// supabase จำลอง: เก็บช่องทางที่เปิดไว้ ให้เทสต์ยิงเหตุการณ์เข้าไปเหมือนมีคนแก้ข้อมูลที่เครื่องอื่น
const channels = []
vi.mock('./supabaseClient', () => ({
    supabase: {
        channel: vi.fn((name) => {
            const ch = { name, handlers: [], removed: false }
            ch.on = (_type, _filter, handler) => {
                ch.handlers.push(handler)
                return ch
            }
            ch.subscribe = () => ch
            channels.push(ch)
            return ch
        }),
        removeChannel: vi.fn((ch) => {
            ch.removed = true
        }),
        auth: { onAuthStateChange: vi.fn() },
    },
}))

let useRealtimeReload
let CLOSE_DELAY_MS

// คอมโพเนนต์ทดสอบเล็ก ๆ ที่ใช้ hook เหมือนหน้าจริง: แสดงจำนวนครั้งที่โหลด
function makeProbe() {
    return function Probe({ tables, reload, enabled = true }) {
        useRealtimeReload(tables, reload, { enabled, wait: 400 })
        return <div id="probe" />
    }
}

const emit = (table, payload = { eventType: 'UPDATE' }) =>
    channels.filter((c) => c.name === `live-${table}` && !c.removed).forEach((c) => c.handlers.forEach((h) => h(payload)))

let container
let root
const render = async (el) => {
    await act(async () => {
        root.render(el)
    })
}

describe('useRealtimeReload (เรนเดอร์จริง)', () => {
    beforeEach(async () => {
        vi.useFakeTimers()
        vi.resetModules()
        channels.length = 0
        ;({ useRealtimeReload, CLOSE_DELAY_MS } = { ...(await import('./realtime')) })
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })
    afterEach(async () => {
        await act(async () => root.unmount())
        container.remove()
        vi.useRealTimers()
    })

    it('มีเหตุการณ์จากตารางที่ฟัง: โหลดซ้ำหนึ่งครั้งหลังรอสั้น ๆ', async () => {
        const reload = vi.fn()
        const Probe = makeProbe()
        await render(<Probe tables={['invoices']} reload={reload} />)
        expect(reload).not.toHaveBeenCalled()
        emit('invoices')
        expect(reload).not.toHaveBeenCalled()
        await act(async () => vi.advanceTimersByTime(400))
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('เหตุการณ์หลายแถวติดกัน (การกระทำเดียว) รวมเป็นการโหลดครั้งเดียว', async () => {
        const reload = vi.fn()
        const Probe = makeProbe()
        await render(<Probe tables={['invoices', 'invoice_payments']} reload={reload} />)
        emit('invoices')
        emit('invoice_payments')
        emit('invoices')
        await act(async () => vi.advanceTimersByTime(1000))
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('ตารางที่ไม่ได้ฟัง ไม่ทำให้โหลด', async () => {
        const reload = vi.fn()
        const Probe = makeProbe()
        await render(<Probe tables={['invoices']} reload={reload} />)
        emit('rooms')
        await act(async () => vi.advanceTimersByTime(1000))
        expect(reload).not.toHaveBeenCalled()
    })

    it('ใช้ฟังก์ชันโหลดล่าสุดเสมอ โดยไม่สมัครใหม่ (หน้าส่งฟังก์ชันใหม่ทุกครั้งที่เรนเดอร์)', async () => {
        const first = vi.fn()
        const second = vi.fn()
        const Probe = makeProbe()
        await render(<Probe tables={['repairs']} reload={first} />)
        const opened = channels.length
        await render(<Probe tables={['repairs']} reload={second} />)
        expect(channels.length).toBe(opened)
        emit('repairs')
        await act(async () => vi.advanceTimersByTime(400))
        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledTimes(1)
    })

    it('ถอดหน้า (unmount): ยกเลิกการโหลดที่รออยู่ และเหตุการณ์ต่อจากนั้นไม่ทำอะไร', async () => {
        const reload = vi.fn()
        const Probe = makeProbe()
        await render(<Probe tables={['invoices']} reload={reload} />)
        emit('invoices')
        await act(async () => root.unmount())
        await act(async () => vi.advanceTimersByTime(2000))
        emit('invoices')
        await act(async () => vi.advanceTimersByTime(2000))
        expect(reload).not.toHaveBeenCalled()
        // ช่องทางถูกปิดหลังหน่วงเวลา
        await act(async () => vi.advanceTimersByTime(CLOSE_DELAY_MS + 100))
        expect(channels.every((c) => c.removed)).toBe(true)
        // สร้าง root ใหม่เพื่อให้ afterEach ถอดได้
        root = createRoot(container)
    })

    it('enabled = false: ไม่สมัครรับเหตุการณ์เลย เปิดเป็น true แล้วค่อยสมัคร', async () => {
        const reload = vi.fn()
        const Probe = makeProbe()
        await render(<Probe tables={['invoices']} reload={reload} enabled={false} />)
        expect(channels).toHaveLength(0)
        await render(<Probe tables={['invoices']} reload={reload} enabled />)
        expect(channels).toHaveLength(1)
        emit('invoices')
        await act(async () => vi.advanceTimersByTime(400))
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('กลับมาที่แท็บหลังซ่อมนาน: โหลดตามให้ทัน แต่ซ่อมแป๊บเดียวไม่โหลด', async () => {
        const reload = vi.fn()
        const Probe = makeProbe()
        await render(<Probe tables={['invoices']} reload={reload} />)
        const setVisibility = (state) => {
            Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
            document.dispatchEvent(new Event('visibilitychange'))
        }
        setVisibility('hidden')
        await act(async () => vi.advanceTimersByTime(5000))
        setVisibility('visible')
        await act(async () => vi.advanceTimersByTime(500))
        expect(reload).not.toHaveBeenCalled()

        setVisibility('hidden')
        await act(async () => vi.advanceTimersByTime(30000))
        setVisibility('visible')
        await act(async () => vi.advanceTimersByTime(500))
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('เน็ตกลับมา (online): โหลดตามให้ทัน', async () => {
        const reload = vi.fn()
        const Probe = makeProbe()
        await render(<Probe tables={['invoices']} reload={reload} />)
        window.dispatchEvent(new Event('online'))
        await act(async () => vi.advanceTimersByTime(400))
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('หลายหน้าฟังตารางเดียวกัน ใช้ช่องทางเดียว และทุกหน้าโหลดซ้ำพร้อมกัน', async () => {
        const a = vi.fn()
        const b = vi.fn()
        const Probe = makeProbe()
        await render(
            <>
                <Probe tables={['invoices']} reload={a} />
                <Probe tables={['invoices']} reload={b} />
            </>,
        )
        expect(channels.filter((c) => c.name === 'live-invoices')).toHaveLength(1)
        emit('invoices')
        await act(async () => vi.advanceTimersByTime(400))
        expect(a).toHaveBeenCalledTimes(1)
        expect(b).toHaveBeenCalledTimes(1)
    })
})
