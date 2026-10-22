// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// ---- จำลอง lib/contracts เฉพาะส่วนที่ติดต่อฐานข้อมูล (ฟังก์ชันคำนวณวันที่ใช้ของจริง) ----
const renewCalls = []
let renewResult = null
let renewalsResult = []
const loadCalls = []
vi.mock('../lib/contracts', async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual,
        renewContract: async (room, newEnd, note) => { renewCalls.push({ room, newEnd, note }); return renewResult },
        loadRenewals: async (room) => { loadCalls.push(room); return renewalsResult },
    }
})
vi.mock('../lib/supabaseClient', () => ({ supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: () => Promise.resolve({ data: { session: null } }) } } }))
// ไม่ต้องต่อ Realtime จริงในเทสต์นี้
vi.mock('../lib/realtime', () => ({ useRealtimeReload: () => {} }))

const { default: RenewContractModal } = await import('./RenewContractModal.jsx')
const { default: ContractSection } = await import('./ContractSection.jsx')

let container
let root
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }
const click = async (el) => { await act(async () => { el.click() }); await flush() }
const buttonWith = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(text))
const submitForm = async () => { await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }); await flush() }
const typeInto = async (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })) })
}

beforeEach(() => {
    renewCalls.length = 0
    loadCalls.length = 0
    renewResult = null
    renewalsResult = []
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})
afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
})

describe('RenewContractModal', () => {
    const mount = async (props = {}) => {
        const onRenewed = vi.fn(async () => {})
        const onClose = vi.fn()
        await act(async () => { root.render(<RenewContractModal room="101" tenantName="สมชาย" currentEnd="2026-12-31" onRenewed={onRenewed} onClose={onClose} {...props} />) })
        await flush()
        return { onRenewed, onClose }
    }

    it('แสดงตัวเลือกต่อ 6 เดือน / 1 ปี / กำหนดเอง พร้อมวันที่ใหม่ และเลือก 1 ปีไว้ก่อน', async () => {
        await mount()
        expect(container.textContent).toContain('ต่อสัญญา ห้อง 101')
        expect(container.textContent).toContain('ต่อ 6 เดือน')
        expect(container.textContent).toContain('ต่อ 1 ปี')
        expect(container.textContent).toContain('กำหนดเอง')
        expect(buttonWith('ต่อ 1 ปี').getAttribute('aria-pressed')).toBe('true')
        expect(buttonWith('ต่อ 6 เดือน').getAttribute('aria-pressed')).toBe('false')
        expect(container.textContent).toContain('เพิ่ม 12 เดือน')
    })

    it('บอกชัดว่าต่ออย่างเดียว เงินประกันใช้ก้อนเดิม', async () => {
        await mount()
        expect(container.textContent).toContain('เงินประกันไม่เปลี่ยน')
    })

    it('ยืนยันต่อ 1 ปี: ส่งห้อง วันใหม่ (31 ธ.ค. 2027) และหมายเหตุ แล้วแจ้งหน้าแม่', async () => {
        const { onRenewed } = await mount()
        await typeInto(container.querySelector('textarea'), 'ผู้เช่าขอต่อ')
        await submitForm()
        expect(renewCalls).toEqual([{ room: '101', newEnd: '2027-12-31', note: 'ผู้เช่าขอต่อ' }])
        expect(onRenewed).toHaveBeenCalledWith('2027-12-31')
    })

    it('เลือกต่อ 6 เดือน: วันใหม่เป็น 30 มิ.ย. 2027', async () => {
        const { onRenewed } = await mount()
        await click(buttonWith('ต่อ 6 เดือน'))
        expect(container.textContent).toContain('เพิ่ม 6 เดือน')
        await submitForm()
        expect(renewCalls[0].newEnd).toBe('2027-06-30')
        expect(onRenewed).toHaveBeenCalledWith('2027-06-30')
    })

    it('กำหนดเอง: ยังไม่เลือกวัน กดยืนยันไม่ได้ และไม่ส่งคำสั่ง', async () => {
        await mount()
        await click(buttonWith('กำหนดเอง'))
        expect(buttonWith('ยืนยันต่อสัญญา').disabled).toBe(true)
        await submitForm()
        expect(renewCalls).toHaveLength(0)
        expect(container.textContent).toContain('กรุณาเลือกวันสิ้นสุดสัญญาใหม่')
    })

    it('ฐานข้อมูลปฏิเสธ: แสดงข้อความ ไม่เรียก onRenewed และหน้าต่างยังเปิดอยู่', async () => {
        renewResult = 'ไม่มีสิทธิ์'
        const { onRenewed } = await mount()
        await submitForm()
        expect(container.querySelector('[role="alert"]').textContent).toBe('ไม่มีสิทธิ์')
        expect(onRenewed).not.toHaveBeenCalled()
        expect(container.querySelector('form')).toBeTruthy()
    })

    it('กดยกเลิก: ปิดหน้าต่างโดยไม่ส่งคำสั่ง', async () => {
        const { onClose } = await mount()
        await click(buttonWith('ยกเลิก'))
        expect(onClose).toHaveBeenCalled()
        expect(renewCalls).toHaveLength(0)
    })
})

describe('ContractSection', () => {
    const tenant = { room: '101', name: 'สมชาย', startDate: '2026-01-01' }
    const mount = async (props = {}) => {
        const onRenewed = vi.fn(async () => {})
        await act(async () => { root.render(<MemoryRouter><ContractSection tenant={tenant} endDate="2026-12-31" onRenewed={onRenewed} {...props} /></MemoryRouter>) })
        await flush()
        return { onRenewed }
    }

    it('ยังไม่เคยต่อสัญญา: บอกว่ายังไม่เคย', async () => {
        await mount()
        expect(loadCalls).toEqual(['101'])
        expect(container.textContent).toContain('ยังไม่เคยต่อสัญญาในระบบ')
    })

    it('แสดงประวัติการต่อสัญญา (วันเดิม → วันใหม่ และหมายเหตุ)', async () => {
        renewalsResult = [{ id: 'r1', previous_end_date: '2026-06-30', new_end_date: '2026-12-31', note: 'ต่อรอบแรก', created_at: '2026-06-01T03:00:00Z' }]
        await mount()
        expect(container.textContent).toContain('ต่อจาก')
        expect(container.textContent).toContain('ต่อรอบแรก')
        expect(container.querySelectorAll('li')).toHaveLength(1)
    })

    it('ฐานข้อมูลยังไม่มีส่วนต่อสัญญา (โหลดประวัติไม่ได้): บอกผู้ใช้ ไม่ error และยังกดต่อสัญญาได้', async () => {
        renewalsResult = null
        await mount()
        expect(container.textContent).toContain('ยังดูประวัติไม่ได้')
        expect(buttonWith('ต่อสัญญา')).toBeTruthy()
    })

    it('กด "ต่อสัญญา" แล้วเปิดหน้าต่าง ต่อสำเร็จ: ปิดหน้าต่าง แจ้งหน้าแม่ และโหลดประวัติใหม่', async () => {
        const { onRenewed } = await mount()
        await click([...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'ต่อสัญญา'))
        expect(container.querySelector('[role="dialog"]')).toBeTruthy()
        await submitForm()
        expect(onRenewed).toHaveBeenCalledWith('2027-12-31')
        expect(container.querySelector('[role="dialog"]')).toBeNull()
        expect(loadCalls).toEqual(['101', '101'])
    })
})
