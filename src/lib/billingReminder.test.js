// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('./supabaseClient', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))

const { checkBillingReminder } = await import('./billingReminder')

const at = (iso) => new Date(`${iso}T03:00:00+07:00`)

describe('checkBillingReminder', () => {
    beforeEach(() => {
        rpc.mockReset()
        localStorage.clear()
    })

    it('เรียกฟังก์ชันของฐานข้อมูล และคืน true เมื่อมีการส่งแจ้งเตือน', async () => {
        rpc.mockResolvedValue({ data: true, error: null })
        expect(await checkBillingReminder(at('2026-11-05'))).toBe(true)
        expect(rpc).toHaveBeenCalledWith('billing_day_reminder')
    })

    it('ยังไม่ถึงวัน/ไม่มีห้องค้าง (ฐานข้อมูลตอบ false): คืน false', async () => {
        rpc.mockResolvedValue({ data: false, error: null })
        expect(await checkBillingReminder(at('2026-11-03'))).toBe(false)
    })

    it('วันเดียวกันตรวจไม่เกินครั้งเดียวต่อเบราว์เซอร์ วันใหม่ตรวจใหม่', async () => {
        rpc.mockResolvedValue({ data: false, error: null })
        await checkBillingReminder(at('2026-11-05'))
        await checkBillingReminder(at('2026-11-05'))
        expect(rpc).toHaveBeenCalledTimes(1)
        await checkBillingReminder(at('2026-11-06'))
        expect(rpc).toHaveBeenCalledTimes(2)
    })

    it('นับวันตามเวลาไทย (เช้ามืดไทยที่ UTC ยังเป็นวันก่อน ถือเป็นวันใหม่)', async () => {
        rpc.mockResolvedValue({ data: false, error: null })
        await checkBillingReminder(new Date('2026-11-04T18:00:00Z')) // 05 พ.ย. 01:00 น. เวลาไทย
        await checkBillingReminder(new Date('2026-11-04T10:00:00Z')) // 04 พ.ย. 17:00 น. เวลาไทย
        expect(rpc).toHaveBeenCalledTimes(2)
    })

    it('ฐานข้อมูลยังไม่ได้รัน SQL (เรียกไม่สำเร็จ): ข้ามเงียบ ๆ ไม่จำว่าตรวจแล้ว ลองใหม่ได้', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.billing_day_reminder' } })
        expect(await checkBillingReminder(at('2026-11-05'))).toBe(false)
        await checkBillingReminder(at('2026-11-05'))
        expect(rpc).toHaveBeenCalledTimes(2)
    })

    it('localStorage ใช้ไม่ได้ ก็ทำงานต่อ', async () => {
        rpc.mockResolvedValue({ data: true, error: null })
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
        const spy2 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
        expect(await checkBillingReminder(at('2026-11-05'))).toBe(true)
        spy.mockRestore(); spy2.mockRestore()
    })
})
