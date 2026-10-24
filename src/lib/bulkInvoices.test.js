import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

const { previousMeters, buildBulkRows, evaluateRow, validateRates, buildInvoiceRecord, summarize } = await import('./bulkInvoices')

const invoices = [
    { room: '101', month: '2026-08', water_curr: 100, elec_curr: 500 },
    { room: '101', month: '2026-09', water_curr: 110, elec_curr: 560 },
    { room: '102', month: '2026-09', water_curr: 40, elec_curr: 200 },
]
const tenants = [
    { room: '102', name: 'สอง', user_id: 'u2' },
    { room: '101', name: 'หนึ่ง', user_id: 'u1' },
    { room: '110', name: 'ไม่มีบัญชี', user_id: null },
    { room: '20', name: 'ห้องเลขน้อย', user_id: 'u20' },
]
const rents = { 101: 3500, 102: 4000, 110: 3000, 20: 2500 }
const rates = { waterRate: 18, elecRate: 7, commonFee: 100 }

describe('previousMeters', () => {
    it('ใช้เลขมิเตอร์ของเดือนล่าสุดที่เก่ากว่าเดือนที่ออกใบ', () => {
        expect(previousMeters(invoices, '101', '2026-10')).toEqual({ water: 110, elec: 560 })
        expect(previousMeters(invoices, '101', '2026-09')).toEqual({ water: 100, elec: 500 })
    })

    it('ไม่มีใบก่อนหน้า = 0', () => {
        expect(previousMeters(invoices, '101', '2026-08')).toEqual({ water: 0, elec: 0 })
        expect(previousMeters(invoices, '999', '2026-10')).toEqual({ water: 0, elec: 0 })
    })

    it('ไม่นับใบของเดือนเดียวกันหรือเดือนหลัง', () => {
        expect(previousMeters([{ room: '1', month: '2026-10', water_curr: 9, elec_curr: 9 }], '1', '2026-10')).toEqual({ water: 0, elec: 0 })
    })
})

describe('buildBulkRows', () => {
    const rows = buildBulkRows({ tenants, rents, invoices: [...invoices, { room: '102', month: '2026-10', water_curr: 50, elec_curr: 250 }], month: '2026-10' })

    it('เรียงตามเลขห้องแบบตัวเลข (20 มาก่อน 101)', () => {
        expect(rows.map((r) => r.room)).toEqual(['20', '101', '102', '110'])
    })

    it('ใส่ค่าเช่าและมิเตอร์ก่อนหน้า', () => {
        const r101 = rows.find((r) => r.room === '101')
        expect(r101).toMatchObject({ rent: 3500, waterPrev: 110, elecPrev: 560, exists: false, noAccount: false })
    })

    it('ห้องที่มีใบเดือนนี้แล้วและห้องไม่มีบัญชี ถูกทำเครื่องหมาย', () => {
        expect(rows.find((r) => r.room === '102').exists).toBe(true)
        expect(rows.find((r) => r.room === '110').noAccount).toBe(true)
    })
})

describe('evaluateRow', () => {
    const row = { room: '101', name: 'หนึ่ง', userId: 'u1', rent: 3500, exists: false, noAccount: false, waterPrev: 110, elecPrev: 560 }

    it('ยังไม่กรอกอะไร = ข้าม', () => {
        expect(evaluateRow(row, undefined, rates).state).toBe('empty')
        expect(evaluateRow(row, { waterCurr: '', elecCurr: '' }, rates).state).toBe('empty')
    })

    it('กรอกครบ คำนวณยอดจากมิเตอร์ก่อนหน้าอัตโนมัติ', () => {
        const ev = evaluateRow(row, { waterCurr: '120', elecCurr: '620' }, rates)
        expect(ev.state).toBe('ready')
        // น้ำ 10 หน่วย x 18 = 180, ไฟ 60 x 7 = 420, + ค่าเช่า 3500 + ส่วนกลาง 100
        expect(ev.calc.total).toBe(4200)
        expect(ev.meters).toEqual({ waterPrev: 110, waterCurr: 120, elecPrev: 560, elecCurr: 620 })
    })

    it('กรอกมิเตอร์ก่อนหน้าเองได้ (เช่น เปลี่ยนมิเตอร์)', () => {
        const ev = evaluateRow(row, { waterPrev: '0', waterCurr: '5', elecPrev: '0', elecCurr: '10' }, rates)
        expect(ev.state).toBe('ready')
        expect(ev.calc.total).toBe(3500 + 5 * 18 + 10 * 7 + 100)
    })

    it('ไม่ใช้น้ำไม่ใช้ไฟ (เท่ากับก่อนหน้า) สร้างได้ ยอดเป็นค่าเช่า+ส่วนกลาง', () => {
        const ev = evaluateRow(row, { waterCurr: '110', elecCurr: '560' }, rates)
        expect(ev.state).toBe('ready')
        expect(ev.calc.total).toBe(3600)
    })

    it('กรอกไม่ครบ (น้ำอย่างเดียว) = ผิด', () => {
        expect(evaluateRow(row, { waterCurr: '120', elecCurr: '' }, rates)).toMatchObject({ state: 'invalid', error: expect.stringContaining('ให้ครบ') })
    })

    it('มิเตอร์ปัจจุบันน้อยกว่าก่อนหน้า = ผิด', () => {
        expect(evaluateRow(row, { waterCurr: '100', elecCurr: '620' }, rates)).toMatchObject({ state: 'invalid' })
        expect(evaluateRow(row, { waterCurr: '120', elecCurr: '500' }, rates)).toMatchObject({ state: 'invalid' })
    })

    it('ตัวเลขผิดรูป ติดลบ ทศนิยม = ผิด', () => {
        for (const bad of ['abc', '-5', '1.5', 'e']) {
            expect(evaluateRow(row, { waterCurr: bad, elecCurr: '620' }, rates).state).toBe('invalid')
        }
    })

    it('ห้องที่มีใบแล้ว/ไม่มีบัญชี ถูกข้ามแม้กรอกมา', () => {
        expect(evaluateRow({ ...row, exists: true }, { waterCurr: '120', elecCurr: '620' }, rates).state).toBe('skip')
        expect(evaluateRow({ ...row, noAccount: true }, { waterCurr: '120', elecCurr: '620' }, rates).state).toBe('skip')
    })
})

describe('validateRates', () => {
    it('อัตราถูกต้องไม่มี error', () => {
        expect(validateRates(rates)).toBe('')
        expect(validateRates({ waterRate: 0, elecRate: 0, commonFee: 0 })).toBe('')
    })

    it('ว่าง ติดลบ หรือไม่ใช่ตัวเลข = error', () => {
        expect(validateRates({ ...rates, waterRate: '' })).toContain('ค่าน้ำ')
        expect(validateRates({ ...rates, elecRate: -1 })).toContain('ค่าไฟ')
        expect(validateRates({ ...rates, commonFee: 'x' })).toContain('ค่าส่วนกลาง')
    })
})

describe('buildInvoiceRecord / summarize', () => {
    const rowsAll = buildBulkRows({ tenants, rents, invoices, month: '2026-10' })
    const ctxOff = { month: '2026-10', rates, settings: { lateFeePerDay: 0, dueDay: 5 } }

    it('แถวที่บันทึกมีฟิลด์ครบเหมือนการสร้างทีละใบ และไม่มีฟิลด์ค่าปรับเมื่อไม่ได้เปิดใช้', () => {
        const row = rowsAll.find((r) => r.room === '101')
        const ev = evaluateRow(row, { waterCurr: '120', elecCurr: '620' }, rates)
        expect(buildInvoiceRecord(row, ev, ctxOff)).toEqual({
            room: '101', user_id: 'u1', tenant_name: 'หนึ่ง', month: '2026-10', rent: 3500,
            water_prev: 110, water_curr: 120, water_rate: 18,
            elec_prev: 560, elec_curr: 620, elec_rate: 7,
            common_fee: 100, total: 4200,
        })
    })

    it('เปิดใช้ค่าปรับ: จำค่าปรับและวันครบกำหนดลงทุกใบ', () => {
        const row = rowsAll.find((r) => r.room === '101')
        const ev = evaluateRow(row, { waterCurr: '120', elecCurr: '620' }, rates)
        const rec = buildInvoiceRecord(row, ev, { ...ctxOff, settings: { lateFeePerDay: 50, lateFeeGraceDays: 1, lateFeeCap: '', dueDay: 5 } })
        expect(rec).toMatchObject({ due_date: '2026-11-05', late_fee_rate: 50, late_fee_grace: 1, late_fee_cap: null })
    })

    it('สรุปทั้งตาราง: นับเฉพาะแถวพร้อมสร้าง รายงานแถวที่ผิด และรวมยอด', () => {
        const inputs = {
            101: { waterCurr: '120', elecCurr: '620' }, // พร้อม 4200
            102: { waterCurr: '30', elecCurr: '210' }, // ผิด: น้ำน้อยกว่าเดิม (40)
            20: { waterCurr: '5', elecCurr: '10' }, // พร้อม: 2500 + 5*18 + 10*7 + 100 = 2760
            110: { waterCurr: '5', elecCurr: '5' }, // ไม่มีบัญชี ข้าม
        }
        const s = summarize(rowsAll, inputs, rates, ctxOff)
        expect(s.records.map((r) => r.room)).toEqual(['20', '101'])
        expect(s.errors).toEqual({ 102: expect.any(String) })
        expect(s.total).toBe(2760 + 4200)
    })

    it('ไม่กรอกอะไรเลย = ไม่มีใบให้สร้าง', () => {
        expect(summarize(rowsAll, {}, rates, ctxOff)).toEqual({ records: [], errors: {}, total: 0 })
    })
})
