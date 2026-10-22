// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    Skeleton, SkeletonApp, SkeletonCard, SkeletonCardGrid, SkeletonCards, SkeletonForm, SkeletonList, SkeletonPage, SkeletonRegion, SkeletonTable, SkeletonText,
} from './Skeleton.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
const render = async (el) => { await act(async () => { root.render(el) }) }
beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})
afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
})

describe('Skeleton: การเข้าถึง', () => {
    it('กรอบนอกบอกโปรแกรมอ่านหน้าจอว่ากำลังโหลด (role=status, aria-busy) พร้อมข้อความซ่อน', async () => {
        await render(<SkeletonRegion><Skeleton className="h-4 w-10" /></SkeletonRegion>)
        const region = container.querySelector('[role="status"]')
        expect(region.getAttribute('aria-busy')).toBe('true')
        expect(region.querySelector('.sr-only').textContent).toBe('กำลังโหลด...')
    })

    it('ข้อความที่ซ่อนเปลี่ยนได้ และบล็อกย่อยซ่อนจากโปรแกรมอ่านหน้าจอ', async () => {
        await render(<SkeletonRegion label="กำลังโหลดใบแจ้งหนี้"><Skeleton className="h-4" /></SkeletonRegion>)
        expect(container.querySelector('.sr-only').textContent).toBe('กำลังโหลดใบแจ้งหนี้')
        expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
    })

    it('ทุกชิ้นกระพริบเฉพาะเมื่อไม่ได้ตั้งค่าลดการเคลื่อนไหว (motion-safe)', async () => {
        await render(<SkeletonRegion><Skeleton className="h-4" /><SkeletonText /></SkeletonRegion>)
        const animated = [...container.querySelectorAll('[class*="animate-pulse"]')]
        expect(animated.length).toBeGreaterThan(0)
        expect(animated.every((el) => el.className.includes('motion-safe:animate-pulse'))).toBe(true)
    })
})

describe('Skeleton: รูปทรง', () => {
    it('SkeletonText: จำนวนบรรทัดตามที่กำหนด บรรทัดสุดท้ายสั้นกว่า', async () => {
        await render(<SkeletonText lines={4} />)
        const bars = container.firstChild.children
        expect(bars).toHaveLength(4)
        expect(bars[3].className).toContain('w-2/3')
        expect(bars[0].className).toContain('w-full')
    })

    it('SkeletonList: จำนวนแถวตามที่กำหนด และปิดวงกลมซ้ายได้', async () => {
        await render(<SkeletonList rows={4} />)
        expect(container.querySelectorAll('[role="status"] > div[aria-hidden="true"]')).toHaveLength(4)
        expect(container.querySelectorAll('.h-10.w-10.shrink-0')).toHaveLength(4)
        await render(<SkeletonList rows={2} avatar={false} />)
        expect(container.querySelectorAll('.h-10.w-10.shrink-0')).toHaveLength(0)
    })

    it('SkeletonTable: หัวตาราง 1 แถว + แถวข้อมูลตามกำหนด คอลัมน์ตามกำหนด', async () => {
        await render(<SkeletonTable rows={3} cols={4} />)
        const [head, body] = container.querySelectorAll('[role="status"] > div[aria-hidden="true"]')
        expect(head.children).toHaveLength(4)
        expect(body.children).toHaveLength(3)
        expect(body.children[0].children).toHaveLength(4)
    })

    it('SkeletonCardGrid / SkeletonCards / SkeletonCard จำนวนตามกำหนด', async () => {
        await render(<SkeletonCardGrid count={5} />)
        expect(container.querySelectorAll('[role="status"] > div[aria-hidden="true"]')).toHaveLength(5)
        await render(<SkeletonCards count={2} lines={2} />)
        expect(container.querySelectorAll('[role="status"] > div[aria-hidden="true"]')).toHaveLength(2)
        await render(<SkeletonCard lines={1} />)
        expect(container.querySelectorAll('.shadow-card')).toHaveLength(1)
    })

    it('SkeletonForm: การ์ดตามจำนวนส่วน ช่องตามจำนวนช่อง', async () => {
        await render(<SkeletonForm sections={2} fields={3} />)
        expect(container.querySelectorAll('[role="status"] > div[aria-hidden="true"]')).toHaveLength(2)
        expect(container.querySelectorAll('.h-10.w-full')).toHaveLength(6)
    })

    it('SkeletonPage / SkeletonApp: มีโครงหน้าครบและมีสถานะกำลังโหลด', async () => {
        await render(<SkeletonPage />)
        expect(container.querySelector('[role="status"]')).toBeTruthy()
        expect(container.querySelector('.border-l-primary')).toBeTruthy()
        await render(<SkeletonApp />)
        expect(container.querySelector('main')).toBeTruthy()
        expect(container.querySelector('.sr-only').textContent).toBe('กำลังโหลด...')
    })
})
