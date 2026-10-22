// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// ผลที่ฐานข้อมูลตอบ (เปลี่ยนต่อเทสต์) profiles: ค่าเมื่ออ่านพร้อมคอลัมน์ must_change_password, profilesBasic: ค่าเมื่ออ่านแค่ role
let session
let profilesFull
let profilesBasic
let tenantRow
const selects = []

vi.mock('./supabaseClient', () => ({
    supabase: {
        auth: {
            getSession: () => Promise.resolve({ data: { session } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        },
        from: (table) => ({
            select: (cols) => {
                selects.push(`${table}:${cols}`)
                const result = table === 'tenants'
                    ? { data: tenantRow, error: null }
                    : cols.includes('must_change_password') ? profilesFull : profilesBasic
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
        session = { user: { id: 'u1', email: 't101@apartment.app' } }
        profilesFull = { data: { role: 'user', must_change_password: true }, error: null }
        profilesBasic = { data: { role: 'user' }, error: null }
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
        profilesFull = { data: { role: 'admin', must_change_password: false }, error: null }
        const { get } = await render()
        expect(get()).toMatchObject({ role: 'admin', mustChangePassword: false })
    })

    it('ยังไม่ได้รัน migration hardening (ไม่มีคอลัมน์): อ่านแค่สิทธิ์ ไม่บังคับ และระบบยังใช้ได้', async () => {
        profilesFull = { data: null, error: { message: 'column profiles.must_change_password does not exist' } }
        const { get } = await render()
        expect(get()).toMatchObject({ role: 'user', mustChangePassword: false })
        expect(selects).toContain('profiles:role')
    })

    it('ยังไม่ login: ไม่มีข้อมูลผู้ใช้', async () => {
        session = null
        const { get } = await render()
        expect(get()).toBeNull()
    })
})
