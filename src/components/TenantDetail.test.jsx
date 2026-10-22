// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const updates = []
vi.mock('../lib/supabaseClient', () => ({
    supabase: {
        from: (table) => ({
            update: (fields) => ({ eq: (col, val) => { updates.push({ table, fields, where: `${col}=${val}` }); return Promise.resolve({ error: null }) } }),
        }),
    },
}))
vi.mock('../lib/adminUsers', () => ({ callAdminUsers: async () => ({}) }))
// ส่วนประกอบหนักที่ไม่เกี่ยวกับเรื่องที่ทดสอบ
vi.mock('./PageHeader', () => ({ default: ({ title }) => <h1>{title}</h1> }))
vi.mock('./MoveOutSection', () => ({ default: () => null }))
vi.mock('./TenantDocuments', () => ({ default: () => null }))
vi.mock('./DatePicker', () => ({ default: ({ value }) => <input data-testid="date" readOnly value={value} /> }))
// ContractSection จำลอง: ปุ่มที่ทำเหมือนต่อสัญญาสำเร็จแล้วแจ้งหน้าแม่ (ตัวจริงทดสอบในไฟล์ของมันเอง)
vi.mock('./ContractSection', () => ({
    default: ({ endDate, onRenewed }) => (
        <div>
            <span data-testid="section-end">{endDate}</span>
            <button type="button" onClick={() => onRenewed('2027-12-31')}>จำลองต่อสัญญา</button>
        </div>
    ),
}))

const { default: TenantDetail } = await import('./TenantDetail.jsx')

const tenant = { room: '101', name: 'สมชาย', phone: '0800001234', startDate: '2026-01-01', endDate: '2026-12-31', deposit: 5000, userId: 'u1', username: 'T101' }

let container
let root
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }

beforeEach(() => {
    updates.length = 0
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})
afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
})

async function mount() {
    const onChanged = vi.fn(async () => {})
    const onBack = vi.fn()
    await act(async () => { root.render(<MemoryRouter><TenantDetail tenant={tenant} floor="1" onBack={onBack} onChanged={onChanged} /></MemoryRouter>) })
    await flush()
    return { onChanged, onBack }
}

describe('TenantDetail: ต่อสัญญากับฟอร์มบันทึกข้อมูลผู้เช่า', () => {
    it('ส่งวันสิ้นสุดสัญญาปัจจุบันให้การ์ดสัญญา', async () => {
        await mount()
        expect(container.querySelector('[data-testid="section-end"]').textContent).toBe('2026-12-31')
    })

    it('ต่อสัญญาแล้ว วันที่ในหน้าและในฟอร์มเปลี่ยนเป็นวันใหม่ และแจ้งหน้ารายชื่อให้โหลดใหม่', async () => {
        const { onChanged } = await mount()
        await act(async () => { [...container.querySelectorAll('button')].find((b) => b.textContent === 'จำลองต่อสัญญา').click() })
        await flush()
        expect(container.querySelector('[data-testid="section-end"]').textContent).toBe('2027-12-31')
        expect(onChanged).toHaveBeenCalledTimes(1)
        expect(container.querySelector('[data-testid="date"]').value).toBe('2026-01-01')
        const dates = [...container.querySelectorAll('[data-testid="date"]')].map((i) => i.value)
        expect(dates).toEqual(['2026-01-01', '2027-12-31'])
    })

    it('ต่อสัญญาแล้วกดบันทึกฟอร์ม: ต้องไม่เขียนวันสิ้นสุดเดิมทับวันใหม่', async () => {
        await mount()
        await act(async () => { [...container.querySelectorAll('button')].find((b) => b.textContent === 'จำลองต่อสัญญา').click() })
        await flush()
        await act(async () => { container.querySelector('form#tenant-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
        await flush()
        expect(updates).toHaveLength(1)
        expect(updates[0]).toMatchObject({ table: 'tenants', where: 'room=101' })
        expect(updates[0].fields.end_date).toBe('2027-12-31')
        expect(updates[0].fields.start_date).toBe('2026-01-01')
    })

    it('ไม่ได้ต่อสัญญา แล้วกดบันทึกฟอร์ม: ส่งวันสิ้นสุดเดิมตามปกติ', async () => {
        await mount()
        await act(async () => { container.querySelector('form#tenant-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
        await flush()
        expect(updates[0].fields.end_date).toBe('2026-12-31')
    })
})
