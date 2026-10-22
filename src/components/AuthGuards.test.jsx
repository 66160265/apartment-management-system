// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let me
vi.mock('../lib/useCurrentUser', () => ({ useCurrentUser: () => me }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { auth: {} } }))

const { RequireFreshPassword } = await import('./AuthGuards.jsx')

let container
let root
async function renderAt(path) {
    await act(async () => {
        root.render(
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route element={<RequireFreshPassword><div id="shell"><PageSwitch /></div></RequireFreshPassword>}>
                        <Route path="*" element={null} />
                    </Route>
                </Routes>
            </MemoryRouter>,
        )
    })
}
// แสดงเส้นทางปัจจุบันให้เทสต์อ่านได้
function PageSwitch() {
    return <span id="path">{useLocation().pathname}<Outlet /></span>
}

describe('RequireFreshPassword', () => {
    beforeEach(() => {
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })
    afterEach(async () => {
        await act(async () => root.unmount())
        container.remove()
    })

    it('ต้องเปลี่ยนรหัสผ่าน: หน้าอื่นถูกพาไปหน้าบัญชี', async () => {
        me = { role: 'user', mustChangePassword: true }
        await renderAt('/user/dashboard')
        expect(container.querySelector('#path').textContent).toBe('/account')
    })

    it('ต้องเปลี่ยนรหัสผ่าน: อยู่หน้าบัญชีอยู่แล้วก็อยู่ต่อ', async () => {
        me = { role: 'user', mustChangePassword: true }
        await renderAt('/account')
        expect(container.querySelector('#path').textContent).toBe('/account')
    })

    it('ไม่ต้องเปลี่ยนรหัสผ่าน: ไปหน้าที่ขอได้', async () => {
        me = { role: 'user', mustChangePassword: false }
        await renderAt('/invoices')
        expect(container.querySelector('#path').textContent).toBe('/invoices')
    })

    it('ข้อมูลผู้ใช้ยังโหลดไม่เสร็จ: แสดงหน้าไปก่อน ไม่บล็อก', async () => {
        me = null
        await renderAt('/invoices')
        expect(container.querySelector('#path').textContent).toBe('/invoices')
    })
})
