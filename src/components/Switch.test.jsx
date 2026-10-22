// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Switch from './Switch.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})
afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
})
const button = () => container.querySelector('button')

describe('Switch', () => {
    it('บอกสถานะผ่าน role=switch และ aria-checked', async () => {
        await act(async () => { root.render(<Switch checked={false} onChange={() => {}}>แสดงเพิ่ม</Switch>) })
        expect(button().getAttribute('role')).toBe('switch')
        expect(button().getAttribute('aria-checked')).toBe('false')
        await act(async () => { root.render(<Switch checked onChange={() => {}}>แสดงเพิ่ม</Switch>) })
        expect(button().getAttribute('aria-checked')).toBe('true')
    })

    it('กดแล้วส่งค่าตรงข้ามกับสถานะปัจจุบัน', async () => {
        const onChange = vi.fn()
        await act(async () => { root.render(<Switch checked={false} onChange={onChange}>แสดงเพิ่ม</Switch>) })
        await act(async () => { button().click() })
        expect(onChange).toHaveBeenLastCalledWith(true)
        await act(async () => { root.render(<Switch checked onChange={onChange}>แสดงเพิ่ม</Switch>) })
        await act(async () => { button().click() })
        expect(onChange).toHaveBeenLastCalledWith(false)
    })

    it('แสดงป้ายและตัวเลข (badge) เมื่อกำหนด ไม่แสดงเมื่อไม่กำหนด', async () => {
        await act(async () => { root.render(<Switch checked={false} onChange={() => {}} badge={3}>แสดงห้องที่มีใบแล้ว</Switch>) })
        expect(button().textContent).toBe('แสดงห้องที่มีใบแล้ว3')
        await act(async () => { root.render(<Switch checked={false} onChange={() => {}}>แสดงห้องที่มีใบแล้ว</Switch>) })
        expect(button().textContent).toBe('แสดงห้องที่มีใบแล้ว')
    })

    it('ปิดการใช้งานแล้วกดไม่ได้', async () => {
        const onChange = vi.fn()
        await act(async () => { root.render(<Switch checked={false} onChange={onChange} disabled>x</Switch>) })
        await act(async () => { button().click() })
        expect(onChange).not.toHaveBeenCalled()
    })
})
