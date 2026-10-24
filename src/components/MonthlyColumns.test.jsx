// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { niceMax } from '../lib/chart'
import MonthlyColumns from './MonthlyColumns.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const rows = (values) => values.map((value, i) => ({ key: `2026-${String(i + 1).padStart(2, '0')}`, label: `เดือน${i + 1}`, value }))

let container
let root
async function mount(props) {
    await act(async () => { root.render(<MonthlyColumns title="หน่วยน้ำ" unit="หน่วย" color="#2a78d6" {...props} />) })
}

describe('niceMax', () => {
    it('ปัดเพดานแกนเป็นเลขกลมที่ครึ่งหนึ่งยังกลม ไม่ปัดสูงเกินจำเป็น', () => {
        expect(niceMax(0)).toBe(10)
        expect(niceMax(7)).toBe(8)
        expect(niceMax(11)).toBe(20)
        expect(niceMax(37)).toBe(40)
        expect(niceMax(120)).toBe(200)
        expect(niceMax(210)).toBe(400)
        expect(niceMax(500)).toBe(500)
        expect(niceMax(501)).toBe(600)
        expect(niceMax(1810)).toBe(2000)
    })
})

describe('MonthlyColumns', () => {
    beforeEach(() => {
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })
    afterEach(async () => {
        await act(async () => root.unmount())
        container.remove()
    })

    it('วาดแท่งเฉพาะเดือนที่มีข้อมูล และมีคำอธิบายสำหรับโปรแกรมอ่านหน้าจอ', async () => {
        await mount({ rows: rows([10, 0, 30]) })
        expect(container.querySelectorAll('svg path').length).toBe(2)
        expect(container.querySelector('svg').getAttribute('aria-label')).toContain('ล่าสุด 30 หน่วย')
    })

    it('ใส่ตัวเลขบนหัวแท่งเฉพาะเดือนล่าสุด', async () => {
        await mount({ rows: rows([10, 20, 30]) })
        const labelled = [...container.querySelectorAll('svg text')].filter((t) => t.getAttribute('font-weight') === '600')
        expect(labelled.map((t) => t.textContent)).toEqual(['30'])
    })

    it('ชี้เดือนไหนแสดง tooltip ของเดือนนั้น ออกจากเดือนแล้วหาย', async () => {
        await mount({ rows: rows([10, 20, 30]) })
        const hits = container.querySelectorAll('[data-testid="hit"]')
        await act(async () => { hits[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) })
        const tip = container.querySelector('[role="tooltip"]')
        expect(tip.textContent).toContain('เดือน2')
        expect(tip.textContent).toContain('20 หน่วย')
        await act(async () => { hits[1].dispatchEvent(new MouseEvent('mouseout', { bubbles: true })) })
        expect(container.querySelector('[role="tooltip"]')).toBeNull()
    })

    it('มีตารางตัวเลขครบทุกเดือน', async () => {
        await mount({ rows: rows([10, 20, 30]) })
        const cells = [...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent)
        expect(cells).toEqual(['เดือน110', 'เดือน220', 'เดือน330'])
    })

    it('ไม่มีข้อมูลเลย: แสดงข้อความว่าง ไม่วาดแท่ง', async () => {
        await mount({ rows: rows([0, 0, 0]) })
        expect(container.querySelectorAll('svg path').length).toBe(0)
        expect(container.textContent).toContain('ยังไม่มีข้อมูลในช่วงนี้')
    })

    it('แท่งไม่หนาเกิน 24px แม้มีไม่กี่เดือน', async () => {
        await mount({ rows: rows([10, 20]) })
        const d = container.querySelector('svg path').getAttribute('d')
        const xs = [...d.matchAll(/[MHQV ]([\d.]+)/g)].length
        expect(xs).toBeGreaterThan(0)
        // M x,bottom ... H (x+width-r): ความกว้างจริง = จุด x ซ้ายสุดถึงขวาสุดของเส้นทาง
        const nums = [...d.matchAll(/(\d+(?:\.\d+)?),/g)].map((m) => Number(m[1]))
        expect(Math.max(...nums) - Math.min(...nums)).toBeLessThanOrEqual(24)
    })
})
