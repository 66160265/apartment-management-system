import { describe, expect, it, vi } from 'vitest'

const rpcCalls = []
let rpcResult = { error: null }
let queryResult = { data: [], error: null }
const queryLog = []
vi.mock('./supabaseClient', () => ({
    supabase: {
        rpc: (name, args) => { rpcCalls.push({ name, args }); return Promise.resolve(rpcResult) },
        from: (table) => {
            const q = { table, filters: [] }
            const b = {
                select: (cols) => { q.cols = cols; return b },
                order: (col, opts) => { q.order = [col, opts]; return b },
                eq: (c, v) => { q.filters.push(`${c}=${v}`); return b },
                then: (resolve, reject) => { queryLog.push(q); return Promise.resolve(queryResult).then(resolve, reject) },
            }
            return b
        },
    },
}))

const { addMonthsIso, renewalOptions, validateRenewal, isAlreadyPast, monthsAdded, renewContract, loadRenewals } = await import('./contracts')

describe('addMonthsIso', () => {
    it('บวกเดือนปกติ ข้ามปีได้', () => {
        expect(addMonthsIso('2026-12-31', 6)).toBe('2027-06-30')
        expect(addMonthsIso('2026-10-15', 12)).toBe('2027-10-15')
        expect(addMonthsIso('2026-01-10', 1)).toBe('2026-02-10')
    })

    it('เดือนปลายทางสั้นกว่า ใช้วันสุดท้ายของเดือน (รวมปีอธิกสุรทิน)', () => {
        expect(addMonthsIso('2026-08-31', 6)).toBe('2027-02-28')
        expect(addMonthsIso('2027-08-31', 6)).toBe('2028-02-29')
        expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28')
        expect(addMonthsIso('2028-02-29', 12)).toBe('2029-02-28')
    })
})

describe('renewalOptions', () => {
    it('ต่อ 6 เดือนและ 1 ปี นับจากวันสิ้นสุดเดิม', () => {
        expect(renewalOptions('2026-12-31')).toEqual([
            { key: '6m', label: 'ต่อ 6 เดือน', months: 6, date: '2027-06-30' },
            { key: '12m', label: 'ต่อ 1 ปี', months: 12, date: '2027-12-31' },
        ])
    })
})

describe('validateRenewal', () => {
    const today = '2026-10-23'
    it('วันใหม่หลังวันเดิม = ผ่าน', () => {
        expect(validateRenewal('2026-12-31', '2027-12-31', today)).toBe('')
    })
    it('ไม่เลือกวัน / ไม่หลังวันเดิม / ไกลเกิน 10 ปี = error', () => {
        expect(validateRenewal('2026-12-31', '', today)).toContain('กรุณาเลือก')
        expect(validateRenewal('2026-12-31', '2026-12-31', today)).toContain('ต้องหลังวันสิ้นสุดเดิม')
        expect(validateRenewal('2026-12-31', '2026-06-01', today)).toContain('ต้องหลังวันสิ้นสุดเดิม')
        expect(validateRenewal('2026-12-31', '2037-01-01', today)).toContain('ไกลเกินไป')
        expect(validateRenewal('2026-12-31', '2036-10-20', today)).toBe('')
    })
})

describe('isAlreadyPast / monthsAdded', () => {
    it('วันใหม่ที่ผ่านมาแล้ว', () => {
        expect(isAlreadyPast('2026-10-22', '2026-10-23')).toBe(true)
        expect(isAlreadyPast('2026-10-23', '2026-10-23')).toBe(false)
    })
    it('จำนวนเดือนที่ต่อเพิ่ม', () => {
        expect(monthsAdded('2026-12-31', '2027-06-30')).toBe(6)
        expect(monthsAdded('2026-12-31', '2027-12-31')).toBe(12)
        expect(monthsAdded('2026-12-15', '2027-01-20')).toBe(1)
        expect(monthsAdded('2026-12-15', '2027-01-10')).toBe(0)
        expect(monthsAdded('2026-12-31', '2026-12-31')).toBe(0)
    })
})

describe('renewContract / loadRenewals', () => {
    it('เรียก renew_contract ด้วยพารามิเตอร์ที่ถูกต้อง สำเร็จคืน null', async () => {
        rpcResult = { error: null }
        expect(await renewContract('101', '2027-06-30', 'ต่อ 6 เดือน')).toBeNull()
        expect(rpcCalls.at(-1)).toEqual({ name: 'renew_contract', args: { p_room: '101', p_new_end: '2027-06-30', p_note: 'ต่อ 6 เดือน' } })
    })

    it('ไม่ใส่หมายเหตุส่งสตริงว่าง ไม่ส่ง undefined', async () => {
        await renewContract('101', '2027-06-30')
        expect(rpcCalls.at(-1).args.p_note).toBe('')
    })

    it('ฐานข้อมูลปฏิเสธ: คืนข้อความ error', async () => {
        rpcResult = { error: { message: 'ไม่มีสิทธิ์' } }
        expect(await renewContract('101', '2027-06-30', '')).toBe('ไม่มีสิทธิ์')
    })

    it('loadRenewals กรองตามห้อง เรียงใหม่ไปเก่า และคืนรายการ', async () => {
        queryResult = { data: [{ id: 'r1' }], error: null }
        expect(await loadRenewals('101')).toEqual([{ id: 'r1' }])
        expect(queryLog.at(-1)).toMatchObject({ table: 'contract_renewals', filters: ['room=101'], order: ['created_at', { ascending: false }] })
    })

    it('ผู้เช่าไม่ส่งห้อง: ไม่กรองเอง (ให้ RLS กรอง) และยังไม่มีตาราง = null', async () => {
        queryResult = { data: [], error: null }
        await loadRenewals()
        expect(queryLog.at(-1).filters).toEqual([])
        queryResult = { data: null, error: { message: 'relation does not exist' } }
        expect(await loadRenewals('101')).toBeNull()
    })
})
