import { beforeEach, describe, expect, it, vi } from 'vitest'

const upsert = vi.fn()
vi.mock('./supabaseClient', () => ({
    supabase: {
        auth: { onAuthStateChange: vi.fn() },
        from: () => ({ upsert }),
    },
}))

const { settingsFromRow, settingsToRow, saveSettings } = await import('./useSettings')
const { DEFAULT_SETTINGS } = await import('../data/billing')

describe('settingsFromRow', () => {
    it('ไม่มีแถว = ค่าเริ่มต้น ไม่คิดค่าปรับและไม่ตรวจสลิป', () => {
        const s = settingsFromRow(null)
        expect(s.lateFeePerDay).toBe(0)
        expect(s.lateFeeGraceDays).toBe(0)
        expect(s.lateFeeCap).toBe('')
        expect(s.slipVerifyMode).toBe('off')
        expect(s.promptpayId).toBe('')
    })

    it('อ่านค่าปรับจากฐานข้อมูลเป็นตัวเลข (numeric ของ Postgres อาจมาเป็นสตริง)', () => {
        const s = settingsFromRow({ late_fee_per_day: '50.00', late_fee_grace_days: 2, late_fee_cap: '500.00' })
        expect(s.lateFeePerDay).toBe(50)
        expect(s.lateFeeGraceDays).toBe(2)
        expect(s.lateFeeCap).toBe(500)
    })

    it('เพดานเป็น null ในฐานข้อมูล = ว่าง (ไม่จำกัด) ในฟอร์ม', () => {
        expect(settingsFromRow({ late_fee_cap: null }).lateFeeCap).toBe('')
    })

    it('เพดาน 0 คือ 0 ไม่ใช่ว่าง', () => {
        expect(settingsFromRow({ late_fee_cap: 0 }).lateFeeCap).toBe(0)
    })

    it('ข้อความที่ว่างในฐานข้อมูลใช้ค่าเริ่มต้น แต่ตัวเลข 0 ใช้ 0', () => {
        const s = settingsFromRow({ apartment_name: '  ', common_fee: 0, rate_water: 0 })
        expect(s.apartmentName).toBe(DEFAULT_SETTINGS.apartmentName)
        expect(s.commonFee).toBe(0)
        expect(s.rateWater).toBe(0)
    })
})

describe('settingsToRow', () => {
    it('แปลงค่าปรับเป็นตัวเลข และเพดานว่างเป็น null', () => {
        expect(settingsToRow({ lateFeePerDay: '50', lateFeeGraceDays: '3', lateFeeCap: '' })).toEqual({
            late_fee_per_day: 50,
            late_fee_grace_days: 3,
            late_fee_cap: null,
        })
        expect(settingsToRow({ lateFeeCap: '500' }).late_fee_cap).toBe(500)
        expect(settingsToRow({ lateFeeCap: 0 }).late_fee_cap).toBe(0)
    })

    it('ข้อความตัดช่องว่างหัวท้าย และข้ามฟิลด์ที่ไม่ได้ส่งมา', () => {
        expect(settingsToRow({ bankName: '  กสิกรไทย ' })).toEqual({ bank_name: 'กสิกรไทย' })
    })
})

describe('saveSettings เมื่อฐานข้อมูลยังไม่ได้รัน SQL รุ่นใหม่', () => {
    beforeEach(() => upsert.mockReset())

    const missing = (column) => ({ message: `Could not find the '${column}' column of 'app_settings' in the schema cache` })

    it('ค่าตั้งใหม่เป็นค่าเริ่มต้นทั้งหมด: ข้ามคอลัมน์ที่ไม่มีแล้วบันทึกที่เหลือสำเร็จ', async () => {
        upsert
            .mockResolvedValueOnce({ error: missing('late_fee_per_day') })
            .mockResolvedValueOnce({ error: missing('late_fee_grace_days') })
            .mockResolvedValueOnce({ error: missing('late_fee_cap') })
            .mockResolvedValueOnce({ error: missing('slip_verify_mode') })
            .mockResolvedValueOnce({ error: null })
        const err = await saveSettings({ ...DEFAULT_SETTINGS, apartmentName: 'หอใหม่' })
        expect(err).toBeNull()
        const last = upsert.mock.calls.at(-1)[0]
        expect(last.apartment_name).toBe('หอใหม่')
        for (const c of ['late_fee_per_day', 'late_fee_grace_days', 'late_fee_cap', 'slip_verify_mode']) expect(last).not.toHaveProperty(c)
    })

    it('เปิดใช้ค่าปรับแต่ยังไม่รัน SQL: แจ้งให้รัน ส่วน payments ของไฟล์ migration ไม่บันทึกแบบเงียบ ๆ', async () => {
        upsert.mockResolvedValueOnce({ error: missing('late_fee_per_day') })
        const err = await saveSettings({ ...DEFAULT_SETTINGS, lateFeePerDay: 50 })
        expect(err).toContain('supabase/migrations/20261022000000_initial_schema.sql (ส่วน payments)')
        expect(upsert).toHaveBeenCalledTimes(1)
    })

    it('เปิดโหมดตรวจสลิปแต่ยังไม่รัน SQL: แจ้งให้รัน ส่วน slip-verify ของไฟล์ migration', async () => {
        upsert.mockResolvedValueOnce({ error: missing('slip_verify_mode') })
        expect(await saveSettings({ ...DEFAULT_SETTINGS, slipVerifyMode: 'suggest' })).toContain('supabase/migrations/20261022000000_initial_schema.sql (ส่วน slip-verify)')
    })

    it('error อื่นที่ไม่เกี่ยวกับคอลัมน์ ส่งข้อความกลับตามจริง ไม่วนซ้ำ', async () => {
        upsert.mockResolvedValueOnce({ error: { message: 'permission denied' } })
        expect(await saveSettings({ ...DEFAULT_SETTINGS })).toContain('permission denied')
        expect(upsert).toHaveBeenCalledTimes(1)
    })
})
