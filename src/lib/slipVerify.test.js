import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

const { suggestedAmountOf, requestSlipVerify, verifyStatuses } = await import('./slipVerify')
const { supabase } = await import('./supabaseClient')

describe('suggestedAmountOf', () => {
    it('ใช้ยอดจากสลิปเมื่อผลตรวจเป็น ok หรือ warn', () => {
        expect(suggestedAmountOf({ verify_status: 'ok', verify_detail: { amount: 1000 } })).toBe(1000)
        expect(suggestedAmountOf({ verify_status: 'warn', verify_detail: { amount: 600.5 } })).toBe(600.5)
    })

    it('ไม่แนะนำยอดเมื่อไม่ผ่านการตรวจหรือไม่มีผลตรวจ', () => {
        for (const verify_status of [null, undefined, 'checking', 'failed', 'error', 'skipped']) {
            expect(suggestedAmountOf({ verify_status, verify_detail: { amount: 1000 } })).toBeNull()
        }
    })

    it('ยอดที่อ่านไม่ได้ ศูนย์ หรือติดลบ ไม่นำมาเติมให้', () => {
        for (const amount of [null, undefined, 0, -5, 'abc']) {
            expect(suggestedAmountOf({ verify_status: 'ok', verify_detail: { amount } })).toBeNull()
        }
        expect(suggestedAmountOf({ verify_status: 'ok', verify_detail: null })).toBeNull()
    })
})

describe('requestSlipVerify', () => {
    it('ไม่ throw เมื่อเรียกฟังก์ชันไม่ได้ (ต้องไม่ทำให้การส่งสลิปพัง)', async () => {
        supabase.functions.invoke.mockRejectedValueOnce(new Error('network'))
        await expect(requestSlipVerify('x')).resolves.toEqual({ data: null, error: 'network' })
        supabase.functions.invoke.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
        await expect(requestSlipVerify('x')).resolves.toEqual({ data: null, error: 'not found' })
    })

    it('ส่ง invoice_id ไปที่ฟังก์ชัน verify-slip', async () => {
        supabase.functions.invoke.mockResolvedValueOnce({ data: { status: 'ok' }, error: null })
        await requestSlipVerify('abc')
        expect(supabase.functions.invoke).toHaveBeenLastCalledWith('verify-slip', { body: { invoice_id: 'abc' } })
    })

    it('ค่าซ่อมส่ง payment_id', async () => {
        supabase.functions.invoke.mockResolvedValueOnce({ data: { status: 'ok' }, error: null })
        await requestSlipVerify('xyz', 'repair')
        expect(supabase.functions.invoke).toHaveBeenLastCalledWith('verify-slip', { body: { payment_id: 'xyz' } })
    })
})

describe('verifyStatuses', () => {
    it('มีป้ายครบทุกสถานะในฐานข้อมูล', () => {
        expect(Object.keys(verifyStatuses).sort()).toEqual(['checking', 'error', 'failed', 'ok', 'skipped', 'warn'])
    })
})
