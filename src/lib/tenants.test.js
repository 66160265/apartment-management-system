import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REQUIRED_DOCS, contractStatus, contractStyles, formatDate } from './tenants'

// ตรึงเวลาเป็น 20 ต.ค. 2026 เที่ยงวัน (เวลาท้องถิ่น)
beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0))
})
afterEach(() => vi.useRealTimers())

describe('formatDate', () => {
    it('วันที่ล้วนไม่เลื่อนวัน และไม่มีค่าแสดงขีด', () => {
        expect(formatDate('2026-03-01')).toBe(new Date(2026, 2, 1).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }))
        expect(formatDate('2026-03-01')).toContain('1')
        expect(formatDate('')).toBe('-')
        expect(formatDate(null)).toBe('-')
    })
})

describe('contractStatus', () => {
    it('สัญญายังเหลือมากกว่า 30 วัน = ปกติ', () => {
        expect(contractStatus('2026-12-31')).toMatchObject({ key: 'active', days: 72, hint: 'อีก 72 วัน' })
        expect(contractStatus('2026-11-20')).toMatchObject({ key: 'active', days: 31 })
    })

    it('เหลือไม่เกิน 30 วัน = ใกล้หมด', () => {
        expect(contractStatus('2026-11-19')).toMatchObject({ key: 'expiring', days: 30 })
        expect(contractStatus('2026-10-27')).toMatchObject({ key: 'expiring', days: 7, hint: 'อีก 7 วัน' })
    })

    it('หมดวันนี้ = ใกล้หมด (ยังไม่เกิน) พร้อมข้อความ "หมดวันนี้"', () => {
        expect(contractStatus('2026-10-20')).toMatchObject({ key: 'expiring', days: 0, hint: 'หมดวันนี้' })
    })

    it('เลยวันสิ้นสุดแล้ว = หมดสัญญา บอกจำนวนวันที่เกิน', () => {
        expect(contractStatus('2026-10-19')).toMatchObject({ key: 'expired', days: -1, hint: 'เกินมา 1 วัน' })
        expect(contractStatus('2026-09-20')).toMatchObject({ key: 'expired', hint: 'เกินมา 30 วัน' })
    })

    it('ทุกสถานะมีสีของป้าย', () => {
        for (const key of ['active', 'expiring', 'expired']) expect(contractStyles[key].color).toBeTruthy()
    })
})

describe('REQUIRED_DOCS', () => {
    it('มี 3 ประเภทหลักที่ตรงกับ constraint ในฐานข้อมูล', () => {
        expect(REQUIRED_DOCS.map((d) => d.type)).toEqual(['id_card', 'contract', 'deposit_slip'])
    })
})
