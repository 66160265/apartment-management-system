import { supabase } from './supabaseClient'

// เรียก Edge Function verify-slip ให้ตรวจสลิปของใบแจ้งหนี้ (supabase/functions/verify-slip)
// ผู้เช่าเรียกหลังส่งสลิปแบบไม่รอผล แอดมินเรียกจากปุ่ม "ตรวจสลิปด้วยระบบ" ผลถูกบันทึกลง invoices.verify_status / verify_detail
// ไม่ throw: ตรวจไม่ได้ (ฟังก์ชันยังไม่ deploy โหมดปิด ฯลฯ) ต้องไม่ทำให้การส่งสลิปหรือหน้าแอดมินพัง แอดมินยังตรวจด้วยตาได้เสมอ
export async function requestSlipVerify(invoiceId) {
    try {
        const { data, error } = await supabase.functions.invoke('verify-slip', { body: { invoice_id: invoiceId } })
        return { data, error: error?.message ?? null }
    } catch (e) {
        return { data: null, error: e?.message ?? 'ตรวจสลิปไม่สำเร็จ' }
    }
}

// ป้ายและข้อความของสถานะการตรวจสลิป (ค่าตรงกับ invoices.verify_status ใน supabase/slip-verify.sql)
export const verifyStatuses = {
    checking: { label: 'กำลังตรวจสลิป...', color: 'bg-sky-50 text-sky-900 ring-sky-200' },
    ok: { label: 'ตรวจแล้ว: ยอดตรงกับยอดคงเหลือ ไม่พบสิ่งผิดปกติ', color: 'bg-emerald-50 text-emerald-900 ring-emerald-200' },
    warn: { label: 'ตรวจแล้ว: มีข้อสังเกตให้ตรวจเพิ่ม', color: 'bg-amber-50 text-amber-900 ring-amber-200' },
    failed: { label: 'ไม่ผ่านการตรวจ', color: 'bg-red-50 text-red-900 ring-red-200' },
    error: { label: 'ตรวจอัตโนมัติไม่สำเร็จ กรุณาตรวจด้วยตา', color: 'bg-slate-100 text-slate-800 ring-slate-200' },
    skipped: { label: 'ข้ามการตรวจอัตโนมัติ กรุณาตรวจด้วยตา', color: 'bg-slate-100 text-slate-800 ring-slate-200' },
}

// จำนวนครั้งที่ตรวจต่อบิลได้สูงสุด (ตรงกับ claim_slip_verify ในฐานข้อมูล)
export const MAX_VERIFY_ATTEMPTS = 3

// ยอดที่ระบบอ่านได้จากสลิป (ใช้เติมช่อง "ยอดที่ได้รับ" ให้แอดมิน) คืน null ถ้าไม่มีหรือไม่น่าเชื่อถือ
export function suggestedAmountOf(invoice) {
    if (invoice.verify_status !== 'ok' && invoice.verify_status !== 'warn') return null
    const n = Number(invoice.verify_detail?.amount)
    return Number.isFinite(n) && n > 0 ? n : null
}
