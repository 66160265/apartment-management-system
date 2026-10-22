// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const calls = []
const users = [
    { id: 'a1', email: 'admin@test.com', role: 'admin', createdAt: '2026-10-01T00:00:00Z', lastSignInAt: null, tenant: null },
    { id: 't1', email: 't101@apartment.app', role: 'user', createdAt: '2026-10-01T00:00:00Z', lastSignInAt: null, tenant: { room: '101', name: 'สมชาย', phone: '0800001234', startDate: '2026-01-01', endDate: '2026-12-31' } },
]

vi.mock('../lib/adminUsers', () => ({
    callAdminUsers: async (body) => {
        calls.push(body)
        return body.action === 'list' ? { data: { users, currentUserId: 'a1' } } : { data: { ok: true } }
    },
}))
vi.mock('../lib/useCurrentUser', () => ({
    roleLabels: { admin: 'ผู้ดูแลระบบ', user: 'ผู้เช่า' },
    emailToUsername: (e) => e.split('@')[0].toUpperCase(),
    useCurrentUser: () => ({ id: 'a1', role: 'admin' }),
}))
vi.mock('../lib/supabaseClient', () => ({
    supabase: {
        auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: () => Promise.resolve({ data: { session: null } }) },
        channel: () => { const ch = { on: () => ch, subscribe: () => ch }; return ch },
        removeChannel: () => {},
        from: () => { const b = { select: () => b, eq: () => b, order: () => b, limit: () => b, then: (r) => Promise.resolve({ data: [], error: null }).then(r) }; return b },
    },
}))

const { default: AdminUsersPage } = await import('./AdminUsersPage.jsx')

let container
let root
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }
const click = async (el) => { await act(async () => { el.click() }); await flush() }
const buttonWith = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
const updateCalls = () => calls.filter((c) => c.action === 'update')

async function openTenantEditor() {
    await act(async () => { root.render(<MemoryRouter><AdminUsersPage /></MemoryRouter>) })
    await flush()
    // แถวของ @t101: กดปุ่ม "แก้ไข" ตัวที่อยู่ในแถวเดียวกับ T101
    const row = [...container.querySelectorAll('tr')].find((r) => r.textContent.includes('@t101'))
    await click([...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'แก้ไข'))
}

describe('หน้าจัดการบัญชี: การตั้งรหัสผ่าน', () => {
    beforeEach(() => {
        calls.length = 0
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })
    afterEach(async () => {
        await act(async () => root.unmount())
        container.remove()
    })

    it('เปิดหน้าอย่างเดียว: เรียกแค่ list ไม่มีคำสั่งแก้บัญชี', async () => {
        await act(async () => { root.render(<MemoryRouter><AdminUsersPage /></MemoryRouter>) })
        await flush()
        expect(calls.map((c) => c.action)).toEqual(['list'])
    })

    it('เปิดหน้าต่างแก้ไข: ไม่มีช่องรหัสผ่านให้เบราว์เซอร์เติม มีแต่ปุ่มตั้งรหัสผ่านใหม่', async () => {
        await openTenantEditor()
        expect(container.querySelector('input[name="new-password"]')).toBeNull()
        expect(buttonWith('ตั้งรหัสผ่านใหม่ให้บัญชีนี้')).toBeTruthy()
        expect(buttonWith('ใช้รหัสผ่านเริ่มต้น')).toBeUndefined()
    })

    it('กดบันทึกโดยไม่แตะรหัสผ่าน: ส่งแค่ข้อมูลผู้เช่า ไม่ส่งรหัสผ่าน', async () => {
        await openTenantEditor()
        await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
        await flush()
        const sent = updateCalls()
        expect(sent).toHaveLength(1)
        expect(sent[0]).toMatchObject({ userId: 't1', name: 'สมชาย', phone: '0800001234' })
        expect('password' in sent[0]).toBe(false)
    })

    it('กดตั้งรหัสผ่านแล้วไม่กรอกอะไร: บันทึกไม่ได้ ไม่ส่งคำสั่ง', async () => {
        await openTenantEditor()
        await click(buttonWith('ตั้งรหัสผ่านใหม่ให้บัญชีนี้'))
        await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
        await flush()
        expect(updateCalls()).toHaveLength(0)
        expect(container.textContent).toContain('กรอกรหัสผ่านใหม่')
    })

    it('กด "ไม่ตั้งรหัสผ่านใหม่" แล้วบันทึก: ไม่ส่งรหัสผ่านแม้เคยกรอกไว้', async () => {
        await openTenantEditor()
        await click(buttonWith('ตั้งรหัสผ่านใหม่ให้บัญชีนี้'))
        await click(buttonWith('ใช้รหัสผ่านเริ่มต้น'))
        expect(container.querySelector('input[name="new-password"]').value).toBe('TP1011234')
        await click(buttonWith('ไม่ตั้งรหัสผ่านใหม่'))
        expect(container.querySelector('input[name="new-password"]')).toBeNull()
        await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
        await flush()
        expect('password' in updateCalls()[0]).toBe(false)
    })

    it('ตั้งรหัสผ่านใหม่ตั้งใจ: ส่งรหัสที่กรอกไปพร้อมข้อมูลผู้เช่า', async () => {
        await openTenantEditor()
        await click(buttonWith('ตั้งรหัสผ่านใหม่ให้บัญชีนี้'))
        await click(buttonWith('ใช้รหัสผ่านเริ่มต้น'))
        await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
        await flush()
        expect(updateCalls()[0]).toMatchObject({ userId: 't1', password: 'TP1011234' })
    })

    it('รหัสผ่านที่ตั้งสั้นเกิน 6 ตัวอักษร: ไม่ส่ง', async () => {
        await openTenantEditor()
        await click(buttonWith('ตั้งรหัสผ่านใหม่ให้บัญชีนี้'))
        const input = container.querySelector('input[name="new-password"]')
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        await act(async () => { setter.call(input, 'abc'); input.dispatchEvent(new Event('input', { bubbles: true })) })
        await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
        await flush()
        expect(updateCalls()).toHaveLength(0)
        expect(container.textContent).toContain('อย่างน้อย 6 ตัวอักษร')
    })
})
