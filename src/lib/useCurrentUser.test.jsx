// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// ผลที่ฐานข้อมูลตอบตอนอ่าน profiles (เปลี่ยนต่อเทสต์)
let session
let profiles
let tenantRow
const selects = []
// ตัวฟังเหตุการณ์ real-time ของตาราง tenants
const tenantEvents = []

vi.mock('./supabaseClient', () => ({
    supabase: {
        auth: {
            getSession: () => Promise.resolve({ data: { session } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        },
        channel: () => {
            const ch = { on: (_t, _f, cb) => { tenantEvents.push(cb); return ch }, subscribe: () => ch }
            return ch
        },
        removeChannel: () => {},
        from: (table) => ({
            select: (cols) => {
                selects.push(`${table}:${cols}`)
                const result = table === 'tenants'
                    ? { data: tenantRow, error: null }
                    : profiles
                const b = { eq: () => b, single: () => Promise.resolve(result), maybeSingle: () => Promise.resolve(result) }
                return b
            },
        }),
    },
}))

let container
let root
// useCurrentUser เก็บแคชระดับโมดูล ต้องโหลดโมดูลใหม่ทุกเทสต์
async function render() {
    vi.resetModules()
    const { useCurrentUser, resetCurrentUser } = await import('./useCurrentUser')
    let latest
    function Probe() {
        latest = useCurrentUser()
        return null
    }
    await act(async () => { root.render(<Probe />) })
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve() })
    return { get: () => latest, resetCurrentUser }
}

describe('useCurrentUser', () => {
    beforeEach(() => {
        selects.length = 0
        tenantEvents.length = 0
        session = { user: { id: 'u1', email: 't101@apartment.app' } }
        profiles = { data: { role: 'user', must_change_password: true }, error: null }
        tenantRow = { name: 'สมชาย', room: '101', phone: '0800001234', start_date: '2026-01-01', end_date: '2026-12-31' }
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })
    afterEach(async () => {
        await act(async () => root.unmount())
        container.remove()
    })

    it('อ่านสิทธิ์ ชื่อผู้ใช้ ผู้เช่า และเครื่องหมายบังคับเปลี่ยนรหัสผ่าน', async () => {
        const { get } = await render()
        expect(get()).toMatchObject({ id: 'u1', username: 'T101', role: 'user', mustChangePassword: true })
        expect(get().tenant.room).toBe('101')
    })

    it('เปลี่ยนรหัสแล้ว (เครื่องหมายเป็น false) ไม่บังคับ', async () => {
        profiles = { data: { role: 'admin', must_change_password: false }, error: null }
        const { get } = await render()
        expect(get()).toMatchObject({ role: 'admin', mustChangePassword: false })
    })

    it('ยังไม่ login: ไม่มีข้อมูลผู้ใช้', async () => {
        session = null
        const { get } = await render()
        expect(get()).toBeNull()
    })

    it('แอดมินแก้สัญญา/ห้องของผู้เช่า: ข้อมูลผู้ใช้อัปเดตเองโดยไม่ต้องรีเฟรช', async () => {
        const { get } = await render()
        expect(get().tenant.end_date).toBe('2026-12-31')
        tenantRow = { ...tenantRow, end_date: '2027-06-30' }
        await act(async () => { tenantEvents.forEach((cb) => cb({})) })
        await act(async () => { await new Promise((r) => setTimeout(r, 500)) })
        for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() })
        expect(get().tenant.end_date).toBe('2027-06-30')
    })

    it('เหตุการณ์ที่เนื้อหาไม่เปลี่ยน: ไม่สร้างออบเจ็กต์ใหม่ (หน้าที่ผูกกับข้อมูลนี้ไม่โหลดซ้ำเปล่า ๆ)', async () => {
        const { get } = await render()
        const before = get()
        await act(async () => { tenantEvents.forEach((cb) => cb({})) })
        await act(async () => { await new Promise((r) => setTimeout(r, 500)) })
        for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() })
        expect(get()).toBe(before)
    })
})
