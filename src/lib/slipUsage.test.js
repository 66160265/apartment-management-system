import { describe, expect, it, vi } from 'vitest'

let result = { count: 7, error: null }
const calls = []
vi.mock('./supabaseClient', () => ({
    supabase: {
        from: (table) => ({
            select: (cols, opts) => {
                calls.push({ table, cols, opts })
                const b = { gte: (col, value) => { calls.push({ col, value }); return Promise.resolve(result) } }
                return b
            },
        }),
    },
}))

const { fetchSlipUsage, monthStartIso, quotaStatus } = await import('./slipUsage')

describe('monthStartIso', () => {
    it('ต้นเดือนตามเวลาไทย (UTC+7) ไม่ใช่ UTC', () => {
        // 1 พ.ย. 00:30 เวลาไทย = 31 ต.ค. 17:30 UTC ยังเป็นเดือนพฤศจิกายนของไทย
        expect(monthStartIso(new Date('2026-10-31T17:30:00Z'))).toBe('2026-10-31T17:00:00.000Z')
        expect(monthStartIso(new Date('2026-10-22T05:00:00Z'))).toBe('2026-09-30T17:00:00.000Z')
    })
})

describe('fetchSlipUsage', () => {
    it('นับแถวใน slip_verify_log ตั้งแต่ต้นเดือน', async () => {
        result = { count: 7, error: null }
        expect(await fetchSlipUsage(new Date('2026-10-22T05:00:00Z'))).toBe(7)
        expect(calls.find((c) => c.table)).toMatchObject({ table: 'slip_verify_log', opts: { count: 'exact', head: true } })
        expect(calls.find((c) => c.col)).toMatchObject({ col: 'at', value: '2026-09-30T17:00:00.000Z' })
    })

    it('ยังไม่มีตาราง/อ่านไม่ได้: คืน null ไม่ throw', async () => {
        result = { count: null, error: { message: 'relation does not exist' } }
        expect(await fetchSlipUsage()).toBeNull()
    })

    it('นับได้ 0 คืน 0', async () => {
        result = { count: 0, error: null }
        expect(await fetchSlipUsage()).toBe(0)
    })
})

describe('quotaStatus', () => {
    it('ไม่ตั้งโควตา หรือไม่รู้จำนวนที่ใช้ = none', () => {
        expect(quotaStatus(10, '').level).toBe('none')
        expect(quotaStatus(10, null).level).toBe('none')
        expect(quotaStatus(10, 0).level).toBe('none')
        expect(quotaStatus(null, 50).level).toBe('none')
    })

    it('ใช้ไม่ถึง 80% = ok', () => {
        expect(quotaStatus(39, 50)).toEqual({ level: 'ok', remaining: 11 })
    })

    it('ตั้งแต่ 80% ขึ้นไป = low', () => {
        expect(quotaStatus(40, 50)).toEqual({ level: 'low', remaining: 10 })
        expect(quotaStatus(49, '50')).toEqual({ level: 'low', remaining: 1 })
    })

    it('เต็มหรือเกิน = out เหลือ 0', () => {
        expect(quotaStatus(50, 50)).toEqual({ level: 'out', remaining: 0 })
        expect(quotaStatus(53, 50)).toEqual({ level: 'out', remaining: 0 })
    })
})
