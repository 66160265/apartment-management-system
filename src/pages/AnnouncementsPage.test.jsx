// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let role = 'admin'
let list = []
let recipients = 3
let createResult = null
const ops = []
vi.mock('../lib/useCurrentUser', () => ({ useCurrentUser: () => ({ id: 'u', role }) }))
vi.mock('../lib/realtime', () => ({ useRealtimeReload: () => {} }))
vi.mock('../lib/supabaseClient', () => ({ supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: () => Promise.resolve({ data: { session: null } }) } } }))
vi.mock('../components/PageHeader', () => ({ default: ({ title }) => <h1>{title}</h1> }))
vi.mock('../lib/announcements', async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual,
        loadAnnouncements: async () => list,
        countRecipients: async () => recipients,
        createAnnouncement: async (v) => { ops.push(['create', v]); return createResult },
        updateAnnouncement: async (id, v) => { ops.push(['update', id, v]); return null },
        deleteAnnouncement: async (id) => { ops.push(['delete', id]); return null },
    }
})

const { default: AnnouncementsPage } = await import('./AnnouncementsPage.jsx')

const item = (over) => ({ id: 'a1', title: 'งดน้ำ', body: 'พรุ่งนี้ 9-12 น.', important: false, created_at: '2026-10-22T03:00:00Z', updated_at: null, ...over })

let container
let root
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }
const click = async (el) => { await act(async () => { el.click() }); await flush() }
const buttonWith = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text || b.textContent.includes(text))
const typeInto = async (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) })
}
const mount = async () => {
    await act(async () => { root.render(<MemoryRouter><AnnouncementsPage /></MemoryRouter>) })
    await flush()
}

beforeEach(() => {
    role = 'admin'
    list = []
    recipients = 3
    createResult = null
    ops.length = 0
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})
afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
})

describe('หน้าประกาศ: ผู้เช่า', () => {
    beforeEach(() => { role = 'user' })

    it('อ่านได้อย่างเดียว: ไม่มีช่องลงประกาศ ไม่มีปุ่มแก้ไข/ลบ', async () => {
        list = [item()]
        await mount()
        expect(container.textContent).toContain('งดน้ำ')
        expect(container.textContent).toContain('พรุ่งนี้ 9-12 น.')
        expect(container.querySelector('[aria-label="ลงประกาศใหม่"]')).toBeNull()
        expect(buttonWith('แก้ไข')).toBeUndefined()
        expect(buttonWith('ลบ')).toBeUndefined()
    })

    it('ประกาศสำคัญมีป้าย "สำคัญ" และประกาศที่แก้แล้วมีข้อความ "แก้ไขแล้ว"', async () => {
        list = [item({ important: true, updated_at: '2026-10-22T05:00:00Z' })]
        await mount()
        expect(container.querySelector('article').textContent).toContain('สำคัญ')
        expect(container.textContent).toContain('แก้ไขแล้ว')
    })

    it('ยังไม่มีประกาศ: แสดงข้อความว่าง', async () => {
        await mount()
        expect(container.textContent).toContain('ยังไม่มีประกาศ')
    })

    it('โหลดประกาศไม่ได้ (ยังไม่มีตาราง): บอกผู้ใช้ ไม่ error', async () => {
        list = null
        await mount()
        expect(container.textContent).toContain('ยังใช้ระบบประกาศไม่ได้')
    })
})

describe('หน้าประกาศ: แอดมิน ลงประกาศ', () => {
    it('มีช่องลงประกาศ และรายการประกาศพร้อมปุ่มแก้ไข/ลบ', async () => {
        list = [item()]
        await mount()
        expect(container.querySelector('[aria-label="ลงประกาศใหม่"]')).toBeTruthy()
        expect(buttonWith('แก้ไข')).toBeTruthy()
        expect(buttonWith('ลบ')).toBeTruthy()
    })

    it('ไม่กรอกหัวข้อแล้วกดลงประกาศ: แสดง error ไม่ถามยืนยัน ไม่ส่ง', async () => {
        await mount()
        await click(buttonWith('ลงประกาศ'))
        expect(container.querySelector('[role="alert"]').textContent).toContain('หัวข้อ')
        expect(container.textContent).not.toContain('ยืนยันลงประกาศ')
        expect(ops).toHaveLength(0)
    })

    it('กรอกแล้วกดลงประกาศ: ถามยืนยันพร้อมจำนวนผู้เช่าที่จะได้รับแจ้ง ยังไม่ส่งจนกว่าจะยืนยัน', async () => {
        await mount()
        await typeInto(container.querySelector('input'), 'ซ่อมลิฟต์')
        await click(buttonWith('ลงประกาศ'))
        expect(container.textContent).toContain('แจ้งเตือนผู้เช่า 3 คน')
        expect(container.textContent).toContain('เรียกคืนไม่ได้')
        expect(ops).toHaveLength(0)
    })

    it('กด "กลับไปแก้": กลับมาที่ฟอร์ม ไม่ส่ง', async () => {
        await mount()
        await typeInto(container.querySelector('input'), 'ซ่อมลิฟต์')
        await click(buttonWith('ลงประกาศ'))
        await click(buttonWith('กลับไปแก้'))
        expect(container.textContent).not.toContain('ยืนยันลงประกาศ')
        expect(container.querySelector('input').value).toBe('ซ่อมลิฟต์')
        expect(ops).toHaveLength(0)
    })

    it('ยืนยัน: ส่งหัวข้อ เนื้อหา และสถานะสำคัญ แล้วล้างฟอร์ม แจ้งว่าลงแล้ว', async () => {
        await mount()
        await typeInto(container.querySelector('input'), 'ไฟดับ')
        await typeInto(container.querySelector('textarea'), 'ซ่อมหม้อแปลง')
        await click(container.querySelector('[role="switch"]'))
        await click(buttonWith('ลงประกาศ'))
        await click(buttonWith('ยืนยันลงประกาศ'))
        expect(ops).toEqual([['create', { title: 'ไฟดับ', body: 'ซ่อมหม้อแปลง', important: true }]])
        expect(container.querySelector('[role="status"]').textContent).toContain('ลงประกาศแล้ว')
        expect(container.querySelector('input').value).toBe('')
    })

    it('นับผู้รับไม่ได้: ถามยืนยันแบบไม่ระบุจำนวน', async () => {
        recipients = null
        await mount()
        await typeInto(container.querySelector('input'), 'x')
        await click(buttonWith('ลงประกาศ'))
        expect(container.textContent).toContain('ลงประกาศนี้ถึงผู้เช่าทุกคน?')
    })

    it('ฐานข้อมูลปฏิเสธ: แสดง error และไม่ล้างฟอร์ม', async () => {
        createResult = 'ไม่มีสิทธิ์'
        await mount()
        await typeInto(container.querySelector('input'), 'x')
        await click(buttonWith('ลงประกาศ'))
        await click(buttonWith('ยืนยันลงประกาศ'))
        expect(container.querySelector('[role="alert"]').textContent).toBe('ไม่มีสิทธิ์')
        expect(container.querySelector('input').value).toBe('x')
        expect(container.querySelector('[role="status"]')).toBeNull()
    })
})

describe('หน้าประกาศ: แอดมิน แก้ไข/ลบ', () => {
    it('แก้ไข: ฟอร์มมีค่าเดิม บอกว่าไม่แจ้งซ้ำ บันทึกส่งค่าใหม่', async () => {
        list = [item()]
        await mount()
        await click(buttonWith('แก้ไข'))
        const article = container.querySelector('article')
        expect(article.textContent).toContain('ไม่แจ้งเตือนผู้เช่าซ้ำ')
        const input = article.querySelector('input')
        expect(input.value).toBe('งดน้ำ')
        await typeInto(input, 'งดน้ำ (เลื่อน)')
        await click(buttonWith('บันทึก'))
        expect(ops).toEqual([['update', 'a1', { title: 'งดน้ำ (เลื่อน)', body: 'พรุ่งนี้ 9-12 น.', important: false }]])
    })

    it('แก้แล้วกดยกเลิก: ไม่ส่ง และกลับเป็นข้อความเดิม', async () => {
        list = [item()]
        await mount()
        await click(buttonWith('แก้ไข'))
        await typeInto(container.querySelector('article input'), 'ข้อความที่ไม่เอา')
        await click(buttonWith('ยกเลิก'))
        expect(ops).toHaveLength(0)
        expect(container.querySelector('article').textContent).toContain('งดน้ำ')
        expect(container.querySelector('article').textContent).not.toContain('ข้อความที่ไม่เอา')
    })

    it('ลบ: ถามยืนยันก่อน ยืนยันแล้วจึงลบ', async () => {
        list = [item()]
        await mount()
        await click(buttonWith('ลบ'))
        expect(container.querySelector('[role="alertdialog"]')).toBeTruthy()
        expect(ops).toHaveLength(0)
        await click(buttonWith('ลบประกาศ'))
        expect(ops).toEqual([['delete', 'a1']])
    })

    it('ลบ: กด "ไม่ใช่" แล้วไม่ลบ', async () => {
        list = [item()]
        await mount()
        await click(buttonWith('ลบ'))
        await click(buttonWith('ไม่ใช่'))
        expect(ops).toHaveLength(0)
        expect(container.querySelector('[role="alertdialog"]')).toBeNull()
    })
})
