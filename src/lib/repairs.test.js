import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

const {
    formatSize, validateImage, repairStartOptions, repairEndOptions, normalizePeriod, parsePeriod, isValidPeriod, formatPeriod,
    periodsOverlap, formatSlot, isInSlots, upcomingSlots, validateAvailability, todayIso,
    toSlotPeriod, countOverlaps, isBreakTime, isPastTime, validateTechnician, sortRepairs,
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
    it('เวลาเริ่ม 09:00-17:00 และเวลาสิ้นสุดหลังเวลาเริ่มถึง 18:00 ทีละ 1 ชั่วโมง', () => {
        expect(repairStartOptions[0]).toBe('09:00')
        expect(repairStartOptions.at(-1)).toBe('17:00')
        // 12:00 เป็นเวลาพักของช่าง เริ่มช่วงตอนนี้ไม่ได้
        expect(repairStartOptions).not.toContain('12:00')
        expect(repairStartOptions).toHaveLength(8)
        expect(repairEndOptions('09:00')[0]).toBe('10:00')
        expect(repairEndOptions('09:00').at(-1)).toBe('18:00')
        expect(repairEndOptions('16:00')).toEqual(['17:00', '18:00'])
        // ยังไม่เลือกเวลาเริ่ม = ทุกเวลาหลัง 09:00
        expect(repairEndOptions('')).toHaveLength(9)
    })

    it('isBreakTime: ช่วงที่เริ่มในเวลาพัก 12:00-13:00 (คร่อมเวลาพักได้)', () => {
        expect(isBreakTime('12:00-13:00')).toBe(true)
        expect(isBreakTime('12:00-15:00')).toBe(true)
        expect(isBreakTime('09:00-16:00')).toBe(false)
        expect(isBreakTime('13:00-14:00')).toBe(false)
        expect(isBreakTime('')).toBe(false)
        expect(validateAvailability({ slots: [{ date: '2026-10-21', period: '12:00-15:00' }], allowEntry: false, urgency: 'normal' })).toContain('เวลาพัก')
    })

    it('แปลงค่าแบบเดิม (morning/afternoon/evening) เป็นช่วงเวลา', () => {
        expect(normalizePeriod('morning')).toBe('09:00-12:00')
        expect(normalizePeriod('13:00-15:30')).toBe('13:00-15:30')
        expect(normalizePeriod(undefined)).toBe('')
        expect(parsePeriod('afternoon')).toEqual({ start: '13:00', end: '17:00' })
    })

    it('isValidPeriod: เวลาเริ่มและสิ้นสุดเต็มชั่วโมง ภายใน 09:00-18:00 และสิ้นสุดหลังเวลาเริ่ม', () => {
        expect(isValidPeriod('09:00-10:00')).toBe(true)
        expect(isValidPeriod('09:00-16:00')).toBe(true)
        expect(isValidPeriod('13:00-18:00')).toBe(true)
        expect(isValidPeriod('17:00-18:00')).toBe(true)
        expect(isValidPeriod('18:00-19:00')).toBe(false)
        expect(isValidPeriod('17:00-20:00')).toBe(false)
        expect(isValidPeriod('13:00-13:00')).toBe(false)
        expect(isValidPeriod('15:00-13:00')).toBe(false)
        expect(isValidPeriod('08:00-10:00')).toBe(false)
        expect(isValidPeriod('13:00-15:30')).toBe(false)
        expect(isValidPeriod('12:00-14:00')).toBe(false)
        expect(isValidPeriod('09:00-')).toBe(false)
        expect(isValidPeriod('')).toBe(false)
    })

    it('formatPeriod / formatSlot: แสดงทั้งช่วงเสมอ', () => {
        expect(formatPeriod('09:00-10:00')).toBe('09:00-10:00 น.')
        expect(formatPeriod('09:00-16:00')).toBe('09:00-16:00 น.')
        expect(formatPeriod('morning')).toBe('09:00-12:00 น.')
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

    it('upcomingSlots: ทิ้งวันที่ผ่านแล้ว แปลงช่วงแบบเดิม เรียงตามวัน และเก็บไม่เกิน 3 ตัวเลือก', () => {
        const result = upcomingSlots([
            { date: '2026-10-26', period: '09:00-12:00' },
            { date: '2026-10-25', period: 'evening' },
            { date: '2026-10-19', period: '09:00-12:00' },
            { date: '2026-10-21', period: '13:00-15:30' },
            { date: '2026-10-20', period: '09:00-10:00' },
        ])
        expect(result.map((s) => `${s.date} ${s.period}`)).toEqual(['2026-10-20 09:00-10:00', '2026-10-21 13:00-16:00', '2026-10-25 17:00-18:00'])
    })

    it('toSlotPeriod: ช่วงแบบเดิม -> ช่วงที่เลือกได้ใกล้เคียงที่สุด', () => {
        expect(toSlotPeriod('13:00-15:30')).toBe('13:00-16:00')
        expect(toSlotPeriod('evening')).toBe('17:00-18:00')
        expect(toSlotPeriod('morning')).toBe('09:00-12:00')
        expect(toSlotPeriod('12:00-13:00')).toBe('11:00-13:00')
        expect(toSlotPeriod('10:00-11:00')).toBe('10:00-11:00')
    })

    it('isPastTime: วันนี้เวลาที่เลยมาแล้วเลือกไม่ได้ (ตอนนี้ 12:00)', () => {
        expect(isPastTime('2026-10-20', '11:00-12:00')).toBe(true)
        expect(isPastTime('2026-10-20', '12:00-13:00')).toBe(true)
        expect(isPastTime('2026-10-20', '13:00-14:00')).toBe(false)
        expect(isPastTime('2026-10-19', '17:00-18:00')).toBe(true)
        expect(isPastTime('2026-10-21', '09:00-10:00')).toBe(false)
        expect(validateAvailability({ slots: [{ date: '2026-10-20', period: '10:00-11:00' }], allowEntry: false, urgency: 'normal' })).toContain('ผ่านไปแล้ว')
    })

    it('เลือกเวลาที่ใกล้ถึงได้ ขอแค่ยังไม่ผ่านไป (ตอนนี้ 12:30)', () => {
        vi.setSystemTime(new Date(2026, 9, 20, 12, 30, 0))
        expect(validateAvailability({ slots: [{ date: '2026-10-20', period: '13:00-16:00' }], allowEntry: false, urgency: 'normal' })).toBe('')
        expect(validateAvailability({ slots: [{ date: '2026-10-20', period: '11:00-16:00' }], allowEntry: false, urgency: 'normal' })).toContain('ผ่านไปแล้ว')
    })

    it('countOverlaps: นับนัดของห้องอื่นที่ทับวันและช่วงเดียวกัน (ใช้เตือน ไม่ได้ห้าม)', () => {
        const appts = [{ date: '2026-10-21', period: '09:00-12:00' }, { date: '2026-10-21', period: '10:00-11:00' }, { date: '2026-10-22', period: '09:00-12:00' }]
        expect(countOverlaps(appts, '2026-10-21', '09:00-16:00')).toBe(2)
        expect(countOverlaps(appts, '2026-10-21', '11:00-13:00')).toBe(1)
        expect(countOverlaps(appts, '2026-10-21', '13:00-16:00')).toBe(0)
        expect(countOverlaps(null, '2026-10-21', '09:00-12:00')).toBe(0)
    })
})

describe('todayIso', () => {
    it('เป็นวันที่ท้องถิ่นแบบ YYYY-MM-DD', () => {
        expect(todayIso()).toBe('2026-10-20')
    })
})

describe('validateAvailability', () => {
    const ok = { slots: [{ date: '2026-10-21', period: '09:00-10:00' }], allowEntry: false, urgency: 'normal' }

    it('ข้อมูลถูกต้อง = ไม่มี error', () => {
        expect(validateAvailability(ok)).toBe('')
    })

    it('ช่องว่าง วัน เวลาเริ่ม หรือเวลาสิ้นสุดไม่ครบ', () => {
        expect(validateAvailability({ ...ok, slots: [{ date: '', period: '09:00-10:00' }] })).toContain('ให้ครบ')
        expect(validateAvailability({ ...ok, slots: [{ date: '2026-10-21', period: '' }] })).toContain('ให้ครบ')
        expect(validateAvailability({ ...ok, slots: [{ date: '2026-10-21', period: '09:00-' }] })).toContain('ให้ครบ')
        expect(validateAvailability({ ...ok, slots: [{ date: '2026-10-21', period: '-16:00' }] })).toContain('ให้ครบ')
    })

    it('ช่วงเวลาไม่ถูกต้อง', () => {
        expect(validateAvailability({ ...ok, slots: [{ date: '2026-10-21', period: '15:00-09:00' }] })).toContain('กรุณาเลือกช่วงเวลาระหว่าง')
        expect(validateAvailability({ ...ok, slots: [{ date: '2026-10-21', period: '17:00-20:00' }] })).toContain('กรุณาเลือกช่วงเวลาระหว่าง')
    })

    it('วันที่ผ่านมาแล้ว', () => {
        expect(validateAvailability({ ...ok, slots: [{ date: '2026-10-19', period: '09:00-10:00' }] })).toContain('ผ่านมาแล้ว')
    })

    it('เลือกได้ 3 ตัวเลือก แต่ช่วงในวันเดียวกันห้ามซ้อนกัน', () => {
        const three = [
            { date: '2026-10-21', period: '09:00-12:00' },
            { date: '2026-10-21', period: '13:00-18:00' },
            { date: '2026-10-22', period: '09:00-16:00' },
        ]
        expect(validateAvailability({ ...ok, slots: three })).toBe('')
        expect(validateAvailability({ ...ok, slots: [three[0], { date: '2026-10-21', period: '11:00-14:00' }] })).toContain('ซ้อนกัน')
        expect(validateAvailability({ ...ok, slots: [three[0], three[0]] })).toContain('ซ้อนกัน')
    })

    it('ไม่เลือกช่วงเวลาเลย: ต้องอนุญาตให้ช่างเข้าได้ หรือเป็นเรื่องฉุกเฉิน', () => {
        expect(validateAvailability({ slots: [], allowEntry: false, urgency: 'normal' })).toContain('อย่างน้อย 1 ช่วง')
        expect(validateAvailability({ slots: [], allowEntry: true, urgency: 'normal' })).toBe('')
        expect(validateAvailability({ slots: [], allowEntry: false, urgency: 'emergency' })).toBe('')
    })
})

describe('ข้อมูลช่างและการเรียงรายการ', () => {
    it('validateTechnician: ต้องมีชื่อและเบอร์ 9-10 หลัก', () => {
        expect(validateTechnician('', '0812345678')).toContain('กรุณาใส่ชื่อช่างและเบอร์โทรช่าง')
        expect(validateTechnician('ช่างสมชาย', ' ')).toContain('กรุณาใส่ชื่อช่างและเบอร์โทรช่าง')
        expect(validateTechnician('ช่างสมชาย', '1234')).toContain('ไม่ถูกต้อง')
        expect(validateTechnician('ช่างสมชาย', 'โทร 081')).toContain('ไม่ถูกต้อง')
        expect(validateTechnician('ช่างสมชาย', '081-234-5678')).toBe('')
        expect(validateTechnician('ช่างสมชาย', '02 123 4567')).toBe('')
    })

    it('sortRepairs: ปักหมุดอยู่บนสุด (ปักล่าสุดก่อน) ที่เหลือเรียงตามวันที่แจ้ง', () => {
        const list = [
            { id: 'a', created_at: '2026-10-01T10:00:00Z' },
            { id: 'b', created_at: '2026-10-05T10:00:00Z', pinned: true, pinned_at: '2026-10-06T10:00:00Z' },
            { id: 'c', created_at: '2026-10-03T10:00:00Z' },
            { id: 'd', created_at: '2026-10-02T10:00:00Z', pinned: true, pinned_at: '2026-10-07T10:00:00Z' },
        ]
        expect(sortRepairs(list).map((r) => r.id)).toEqual(['d', 'b', 'c', 'a'])
        expect(sortRepairs(list, true).map((r) => r.id)).toEqual(['d', 'b', 'a', 'c'])
        // ไม่แก้ลำดับของรายการเดิม
        expect(list[0].id).toBe('a')
    })
})

describe('repairPayDueDate', () => {
    it('ครบกำหนด = วันที่ซ่อมเสร็จ (เวลาไทย) + จำนวนวัน', async () => {
        const { repairPayDueDate } = await import('./repairPayments')
        expect(repairPayDueDate({ completed_at: '2026-10-25T11:33:00+07:00' }, 1)).toBe('2026-10-26')
        // 23:30 น. วันที่ 31 ต.ค. เวลาไทย (UTC ยังเป็นวันที่ 31) -> ครบกำหนด 1 พ.ย.
        expect(repairPayDueDate({ completed_at: '2026-10-31T16:30:00Z' }, 1)).toBe('2026-11-01')
        expect(repairPayDueDate({ completed_at: '2026-10-31T17:30:00Z' }, 1)).toBe('2026-11-02')
        expect(repairPayDueDate({ completed_at: null }, 1)).toBe(null)
    })
})
