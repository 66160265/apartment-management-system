import { useCallback, useEffect, useState } from 'react'
import DownloadReceiptButton from './DownloadReceiptButton'
import Icon from './Icon'
import { SlipImage, VerifyBox } from './InvoiceParts'
import { baht, formatDateTime, formatMonth } from '../lib/billing'
import { useRealtimeReload } from '../lib/realtime'
import { owesRepairCost } from '../lib/repairPayments'
import { buildRepairReceipt } from '../lib/receipts'
import { requestSlipVerify } from '../lib/slipVerify'
import { supabase } from '../lib/supabaseClient'
import { useSettings } from '../lib/useSettings'

// ค่าซ่อมที่ผู้เช่าต้องชำระ: รวมในใบแจ้งหนี้ค่าห้องใบถัดไป (supabase/migrations/20261022000000_initial_schema.sql ส่วน repair-updates) ไม่ต้องจ่ายแยก
// เรื่องเก่าที่เคยส่งสลิปค่าซ่อมแยกไว้ (ส่วน repair-payments ใน initial_schema) ยังแสดงสถานะ ใบเสร็จ และแอดมินยังตรวจสลิปที่ค้างได้
// เงื่อนไข: ซ่อมเสร็จแล้ว (done) ผู้ดูแลระบุให้ผู้เช่าเป็นผู้ชำระ (cost_payer = tenant) และมียอด (cost > 0)

// โหลดรายการชำระค่าซ่อมของเรื่องนี้ (เก่าไปใหม่) null = ยังโหลดไม่เสร็จ refresh() โหลดใหม่
function useRepairPayments(repairId) {
    const [payments, setPayments] = useState(null)
    useEffect(() => {
        let active = true
        supabase
            .from('repair_payments')
            .select('*')
            .eq('repair_id', repairId)
            .order('created_at')
            .then(({ data, error }) => active && setPayments(error ? null : (data ?? [])))
        return () => {
            active = false
        }
    }, [repairId])
    const refresh = useCallback(async () => {
        const { data, error } = await supabase.from('repair_payments').select('*').eq('repair_id', repairId).order('created_at')
        setPayments(error ? null : (data ?? []))
    }, [repairId])
    // อัปเดตเองเมื่อสลิปค่าซ่อมถูกส่ง ยืนยัน หรือปฏิเสธ (ทั้งฝั่งผู้เช่าและแอดมิน)
    useRealtimeReload(['repair_payments'], refresh)
    return [payments, refresh]
}

// ค่าซ่อมไม่ต้องจ่ายแยก: รวมในใบแจ้งหนี้ค่าห้องใบถัดไปอัตโนมัติ (supabase/migrations/20261022000000_initial_schema.sql ส่วน repair-updates)
// invoice_id = รวมในใบแจ้งหนี้ใบนั้นแล้ว (แสดงเดือนของใบ) ไม่มี = รอรวมในใบถัดไป
function RepairBillingNotice({ repair }) {
    const [month, setMonth] = useState(null)
    useEffect(() => {
        if (!repair.invoice_id) return
        let active = true
        supabase
            .from('invoices')
            .select('month')
            .eq('id', repair.invoice_id)
            .maybeSingle()
            .then(({ data }) => active && setMonth(data?.month ?? null))
        return () => {
            active = false
        }
    }, [repair.invoice_id])
    return (
        <p className="text-sm text-sky-900 bg-sky-50 ring-1 ring-sky-200 rounded-xl px-4 py-2.5 flex items-start gap-2">
            <Icon name="receipt" className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
                ค่าซ่อม {baht(repair.cost)}{' '}
                {repair.invoice_id
                    ? `รวมในใบแจ้งหนี้ค่าห้อง${month ? `เดือน ${formatMonth(month)}` : ''}แล้ว`
                    : 'จะรวมในใบแจ้งหนี้ค่าห้องรอบถัดไป'}
            </span>
        </p>
    )
}

// ฝั่งผู้เช่า: ค่าซ่อมรวมในค่าห้อง (เรื่องเก่าที่เคยส่งสลิปแยกไว้ ยังแสดงสถานะสลิปนั้นและใบเสร็จ)
export function TenantRepairPayment({ repair }) {
    const [payments] = useRepairPayments(repair.id)
    if (payments === null) return null
    const paid = payments.find((p) => p.status === 'paid')
    const reviewing = payments.find((p) => p.status === 'review')
    if (!paid && !reviewing) return owesRepairCost(repair) ? <RepairBillingNotice repair={repair} /> : null

    return (
        <div className="rounded-2xl border border-line bg-white p-4 flex flex-col gap-3">
            <h3 className="font-medium text-primary-dark">ค่าซ่อม {baht(repair.cost)}</h3>
            {paid ? (
                <div className="text-sm text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span>ชำระค่าซ่อมเรียบร้อยแล้ว เมื่อ {formatDateTime(paid.reviewed_at)}</span>
                    {paid.receipt_no !== null && paid.receipt_no !== undefined && (
                        <DownloadReceiptButton receipt={buildRepairReceipt({ payment: paid, repair })} className="text-xs text-primary hover:underline" label="ดาวน์โหลดใบเสร็จ" />
                    )}
                </div>
            ) : (
                <>
                    <p className="text-sm text-sky-800 bg-sky-50 ring-1 ring-sky-200 rounded-xl px-4 py-2.5">
                        ส่งสลิปเมื่อ {formatDateTime(reviewing.slip_uploaded_at)} — รอผู้ดูแลระบบตรวจสอบ
                    </p>
                    <div className="flex justify-center rounded-xl bg-sand/70 border border-dashed border-line p-3"><SlipImage path={reviewing.slip_path} /></div>
                </>
            )}
        </div>
    )
}

// ฝั่งแอดมิน: สถานะการชำระค่าซ่อม ตรวจสลิป (พร้อมผลตรวจอัตโนมัติ) ยืนยัน/ปฏิเสธ และประวัติ
export function AdminRepairPayment({ repair }) {
    const settings = useSettings()
    const [payments, refresh] = useRepairPayments(repair.id)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [rejecting, setRejecting] = useState(false)
    const [reason, setReason] = useState('')

    if (payments === null) return null

    const paid = payments.find((p) => p.status === 'paid')
    const reviewing = payments.find((p) => p.status === 'review')
    const rejected = payments.filter((p) => p.status === 'rejected')
    // ไม่มีสลิปค่าซ่อมแยก (หรือเคยถูกปฏิเสธ): ค่าซ่อมรวมในใบแจ้งหนี้ค่าห้อง
    if (!paid && !reviewing) return owesRepairCost(repair) ? <RepairBillingNotice repair={repair} /> : null

    const run = async (fn, params) => {
        setBusy(true)
        setError('')
        const { error: err } = await supabase.rpc(fn, params)
        setBusy(false)
        if (err) return setError(`บันทึกไม่สำเร็จ: ${err.message}`)
        setRejecting(false)
        setReason('')
        await refresh()
    }

    return (
        <div className="rounded-2xl border border-line bg-white p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-primary-dark">ค่าซ่อม {baht(repair.cost)} (ผู้เช่าเป็นผู้ชำระ)</h3>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ${paid ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : reviewing ? 'bg-sky-50 text-sky-800 ring-sky-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}`}>
                    {paid ? 'ชำระแล้ว' : reviewing ? 'รอตรวจสลิป' : 'ยังไม่ชำระ'}
                </span>
            </div>

            {paid && (
                <div className="text-sm text-emerald-800 flex flex-wrap items-center justify-between gap-2">
                    <span>ยืนยันรับเงินเมื่อ {formatDateTime(paid.reviewed_at)}{paid.auto_approved && ' · ระบบอนุมัติอัตโนมัติ'}</span>
                    {paid.receipt_no !== null && paid.receipt_no !== undefined && (
                        <DownloadReceiptButton receipt={buildRepairReceipt({ payment: paid, repair })} className="text-xs text-primary hover:underline" label="ดาวน์โหลดใบเสร็จ" />
                    )}
                </div>
            )}
            {paid && paid.slip_path && (
                <details>
                    <summary className="text-xs text-primary cursor-pointer">ดูสลิป</summary>
                    <div className="flex justify-center pt-2"><SlipImage path={paid.slip_path} /></div>
                </details>
            )}

            {reviewing && (
                <>
                    <p className="text-xs text-muted">ส่งสลิปเมื่อ {formatDateTime(reviewing.slip_uploaded_at)}</p>
                    <div className="flex justify-center rounded-xl bg-sand/70 border border-dashed border-line p-3"><SlipImage path={reviewing.slip_path} /></div>
                    <VerifyBox
                        invoice={reviewing}
                        mode={settings.slipVerifyMode}
                        onVerify={(id) => requestSlipVerify(id, 'repair')}
                        onRefresh={refresh}
                    />
                    {rejecting && (
                        <textarea
                            rows="2"
                            autoFocus
                            maxLength={500}
                            value={reason}
                            onChange={(e) => { setReason(e.target.value); setError('') }}
                            placeholder="เหตุผลที่ปฏิเสธ (ผู้เช่าจะเห็นข้อความนี้) เช่น ยอดโอนไม่ตรง หรือรูปไม่ชัด"
                            className="w-full border border-line bg-sand/50 rounded-xl px-3 py-2 text-sm outline-none focus:border-secondary focus:bg-white"
                        />
                    )}
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="flex gap-3">
                        {rejecting ? (
                            <>
                                <button type="button" onClick={() => { setRejecting(false); setError('') }} className="flex-1 border border-line text-muted hover:bg-sand py-2 rounded-xl text-sm">ยกเลิก</button>
                                <button type="button" disabled={busy} onClick={() => run('reject_repair_payment', { p_payment: reviewing.id, p_reason: reason })} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white py-2 rounded-xl text-sm font-medium">ยืนยันปฏิเสธ</button>
                            </>
                        ) : (
                            <>
                                <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="flex-1 border border-red-200 text-red-600 hover:bg-red-50 py-2 rounded-xl text-sm">ปฏิเสธ</button>
                                <button type="button" disabled={busy} onClick={() => run('approve_repair_payment', { p_payment: reviewing.id })} className="flex-[2] bg-primary hover:bg-primary-dark disabled:opacity-60 text-white py-2 rounded-xl text-sm font-medium">
                                    {busy ? 'กำลังบันทึก...' : `ยืนยันรับ ${baht(reviewing.amount)}`}
                                </button>
                            </>
                        )}
                    </div>
                    <p className="text-xs text-muted">ยืนยันเมื่อยอดในสลิปเท่ากับยอดค่าซ่อมเท่านั้น ถ้ายอดไม่ตรง ให้ปฏิเสธพร้อมเหตุผล ผู้เช่าจะโอนและส่งสลิปใหม่</p>
                </>
            )}

            {!paid && !reviewing && <p className="text-sm text-muted">ผู้เช่ายังไม่ได้ส่งสลิปค่าซ่อม</p>}

            {rejected.length > 0 && (
                <ul className="text-xs text-muted flex flex-col gap-1">
                    {rejected.map((p) => (
                        <li key={p.id}>สลิปที่ถูกปฏิเสธ {formatDateTime(p.reviewed_at)}: {p.reject_reason}</li>
                    ))}
                </ul>
            )}
        </div>
    )
}
