import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

const {
    formatSize, validateImage, repairTimeOptions, normalizePeriod, parsePeriod, isValidPeriod, formatPeriod,
    periodsOverlap, formatSlot, isInSlots, upcomingSlots, validateAvailability, todayIso,
} = await import('./repairs')

// ตรึงเวลาเป็น 20 ต.ค. 2026 เที่ยงวัน (เวลาท้องถิ่น) ให้ผลของ "วันนี้" คงที่
beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0))
})
afterEach(() => vi.useRealTimers())

describe('ไฟล์รูป', () => {
    it('formatSize แสดง KB และ MB', () => {
        expect(formatSize(500)).toBe('1 KB')
        expect(formatSize(2048)).toBe('2 KB')
        expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB')
    })

    it('validateImage รับ JPG/PNG/WEBP ไม่เกิน 5 MB', () => {
        expect(validateImage({ type: 'image/jpeg', size: 1000 })).toBe('')
        expect(validateImage({ type: 'image/webp', size: 5 * 1024 * 1024 })).toBe('')
        expect(validateImage({ type: 'application/pdf', size: 1000 })).toContain('รองรับเฉพาะ')
        expect(validateImage({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toContain('5 MB')
    })
})

describe('ช่วงเวลาเข้าซ่อม', () => {
    it('ตัวเลือกเวลา 09:00-20:00 ทีละ 30 นาที', () => {
        expect(repairTimeOptions[0]).toBe('09:00')
        expect(repairTimeOptions.at(-1)).toBe('20:00')
        expect(repairTimeOptions).toHaveLength(23)
        expect(repairTimeOptions).toContain('13:30')
    })

    it('แปลงค่าแบบเดิม (morning/afternoon/evening) เป็นช่วงเวลา', () => {
        expect(normalizePeriod('morning')).toBe('09:00-12:00')
        expect(normalizePeriod('13:00-15:30')).toBe('13:00-15:30')
        expect(normalizePeriod(undefined)).toBe('')
        expect(parsePeriod('afternoon')).toEqual({ start: '13:00', end: '17:00' })
    })

    it('isValidPeriod: เริ่มก่อนสิ้นสุด และอยู่ในเวลาทำการ', () => {
        expect(isValidPeriod('09:00-12:00')).toBe(true)
        expect(isValidPeriod('13:00-13:00')).toBe(false)
        expect(isValidPeriod('15:00-13:00')).toBe(false)
        expect(isValidPeriod('08:00-10:00')).toBe(false)
        expect(isValidPeriod('19:00-21:00')).toBe(false)
        expect(isValidPeriod('13:10-15:00')).toBe(false)
        expect(isValidPeriod('')).toBe(false)
    })

    it('formatPeriod / formatSlot', () => {
        expect(formatPeriod('13:00-15:30')).toBe('13:00-15:30 น.')
        expect(formatPeriod('')).toBe('')
        expect(formatSlot('2026-10-20', '13:00-15:30')).toContain('13:00-15:30 น.')
    })

    it('periodsOverlap: ซ้อนกันเมื่อมีเวลาคาบเกี่ยว แต่ชนปลายไม่นับ', () => {
        expect(periodsOverlap('09:00-12:00', '11:00-13:00')).toBe(true)
        expect(periodsOverlap('09:00-12:00', '12:00-13:00')).toBe(false)
        expect(periodsOverlap('09:00-12:00', '13:00-15:00')).toBe(false)
        expect(periodsOverlap('09:00-17:00', '10:00-11:00')).toBe(true)
    })

    it('isInSlots: นัดต้องอยู่ในช่วงที่ผู้เช่าสะดวกช่วงใดช่วงหนึ่ง วันเดียวกัน', () => {
        const slots = [{ date: '2026-10-21', period: '09:00-12:00' }, { date: '2026-10-22', period: 'afternoon' }]
        expect(isInSlots(slots, '2026-10-21', '10:00-11:00')).toBe(true)
        expect(isInSlots(slots, '2026-10-21', '11:00-13:00')).toBe(false)
        expect(isInSlots(slots, '2026-10-23', '10:00-11:00')).toBe(false)
        expect(isInSlots(slots, '2026-10-22', '14:00-16:00')).toBe(true)
        expect(isInSlots(null, '2026-10-21', '10:00-11:00')).toBe(false)
    })

    it('upcomingSlots: ทิ้งวันที่ผ่านแล้ว เรียงตามวันและเวลา แปลงค่าแบบเดิม', () => {
        const result = upcomingSlots([
            { date: '2026-10-25', period: 'evening' },
            { date: '2026-10-19', period: '09:00-12:00' },
            { date: '2026-10-21', period: '13:00-15:00' },
            { date: '2026-10-20', period: '09:00-10:00' },
        ])
        expect(result.map((s) => `${s.date} ${s.period}`)).toEqual(['2026-10-20 09:00-10:00', '2026-10-21 13:00-15:00', '2026-10-25 17:00-20:00'])
    })
})

describe('todayIso', () => {
    it('เป็นวันที่ท้องถิ่นแบบ YYYY-MM-DD', () => {
        expect(todayIso()).toBe('2026-10-20')
    })
})

describe('validateAvailability', () => {
    const ok = { slots: [{ date: '2026-10-21', period: '09:00-12:00' }], allowEntry: false, urgency: 'normal' }

    it('ข้อมูลถูกต้อง = ไม่มี error', () => {
        expect(validateAvailability(ok)).toBe('')
    })

    it('ช่องว่าง วันหรือเวลาไม่ครบ', () => {
        expect(validateAvailability({ ...ok, slots: [{ date: '', period: '09:00-12:00' }] })).toContain('ให้ครบ')
        expect(validateAvailability({ ...ok, slots: [{ date: '2026-10-21', period: '' }] })).toContain('ให้ครบ')
    })

    it('เวลาเริ่มไม่ก่อนเวลาสิ้นสุด', () => {
        expect(validateAvailability({ ...ok, slots: [{ date: '2026-10-21', period: '12:00-09:00' }] })).toContain('เวลาเริ่ม')
    })

    it('วันที่ผ่านมาแล้ว', () => {
        expect(validateAvailability({ ...ok, slots: [{ date: '2026-10-19', period: '09:00-12:00' }] })).toContain('ผ่านมาแล้ว')
    })

    it('ช่วงเวลาซ้ำกัน', () => {
        const s = { date: '2026-10-21', period: '09:00-12:00' }
        expect(validateAvailability({ ...ok, slots: [s, s] })).toContain('ซ้ำกัน')
    })

    it('ไม่เลือกช่วงเวลาเลย: ต้องอนุญาตให้ช่างเข้าได้ หรือเป็นเรื่องฉุกเฉิน', () => {
        expect(validateAvailability({ slots: [], allowEntry: false, urgency: 'normal' })).toContain('อย่างน้อย 1 ช่วง')
        expect(validateAvailability({ slots: [], allowEntry: true, urgency: 'normal' })).toBe('')
        expect(validateAvailability({ slots: [], allowEntry: false, urgency: 'emergency' })).toBe('')
    })
})
