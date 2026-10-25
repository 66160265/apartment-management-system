import { useState } from 'react'
import DownloadInvoiceButton from './DownloadInvoiceButton'
import Icon from './Icon'
import PageHeader from './PageHeader'
import { CopyButton, InvoiceBreakdown, InvoiceStepper, PaymentHistory, SlipImage, StatusBadge, VerifyBox } from './InvoiceParts'
import { balanceAtSlip, baht, daysLate, formatDateTime, formatMonth, paidOf } from '../lib/billing'
import { requestSlipVerify, suggestedAmountOf } from '../lib/slipVerify'
import { supabase } from '../lib/supabaseClient'
import { useSettings } from '../lib/useSettings'
import { inputClass, smallInputClass } from './invoiceFormClasses'

// หน้ารายละเอียดใบแจ้งหนี้ฝั่งแอดมิน: ดูยอด ดูสลิป อนุมัติ/ปฏิเสธสลิป แก้ไขหรือลบใบแจ้งหนี้
function InvoiceDetail({ invoice, onBack, onChanged, onEdit, onDelete }) {
    // การตั้งค่า (บัญชีธนาคาร), กำลังพิมพ์เหตุผลปฏิเสธ, เหตุผล, กำลังบันทึก และ error
    const settings = useSettings()
    const [rejecting, setRejecting] = useState(false)
    const [reason, setReason] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    // ยอดที่ได้รับจริงตามสลิป (ค่าเริ่มต้นคือยอดคงเหลือ แก้ได้เมื่อผู้เช่าโอนไม่ครบหรือเกิน)
    const [amount, setAmount] = useState(null)
    // ยอดที่ต้องชำระของสลิปนี้ = ยอดบิล + ค่าปรับ ณ วันที่ส่ง/โอนสลิป - ที่ได้รับแล้ว
    const due = balanceAtSlip(invoice)
    const amountText = amount ?? String(suggestedAmountOf(invoice) ?? due)
    const [refundNote, setRefundNote] = useState('')

    // ตรวจสลิป: approve = true ยืนยันสลิปพร้อมยอดที่ได้รับ (ครบ = ชำระแล้ว, ไม่ครบ = กลับเป็นรอชำระพร้อมยอดคงเหลือ, เกิน = ชำระแล้วและเก็บยอดรอโอนคืน)
    // false ปฏิเสธพร้อมเหตุผลและกลับไป "รอชำระ" (อัปเดตได้เฉพาะใบที่ยังรอตรวจสอบ)
    const review = async (approve) => {
        if (!approve && !reason.trim()) {
            setError('กรุณาระบุเหตุผลที่ปฏิเสธ')
            return
        }
        const received = Number(amountText)
        if (approve && (amountText.trim() === '' || !(received > 0))) {
            setError('กรุณากรอกยอดที่ได้รับตามสลิป (มากกว่า 0)')
            return
        }
        setBusy(true)
        const { error: err } = approve
            ? await supabase.rpc('approve_slip', { p_invoice: invoice.id, p_amount: received })
            : await supabase
                .from('invoices')
                .update({ status: 'pending', slip_path: null, slip_uploaded_at: null, reject_reason: reason.trim() })
                .eq('id', invoice.id)
                .eq('status', 'review')
        setBusy(false)
        if (err) {
            setError(`บันทึกไม่สำเร็จ: ${err.message}`)
            return
        }
        await onChanged()
        onBack()
    }

    // บันทึกว่าโอนยอดที่ผู้เช่าชำระเกินคืนแล้ว
    const markRefunded = async () => {
        setBusy(true)
        const { error: err } = await supabase.rpc('mark_refunded', { p_invoice: invoice.id, p_note: refundNote })
        setBusy(false)
        if (err) return setError(`บันทึกไม่สำเร็จ: ${err.message}`)
        await onChanged()
    }

    return (
        <>
            <PageHeader title="รายละเอียดใบแจ้งหนี้" onBack={onBack} backLabel="กลับไปรายการใบแจ้งหนี้" />
            <div className="mx-4 sm:mx-6 mb-6 flex flex-col gap-4">

                {/* การ์ดหัว: เลขห้อง ชื่อผู้เช่า สถานะ ปุ่ม PDF/แก้ไข/ลบ และไทม์ไลน์ขั้นตอน */}
                <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-wrap items-center gap-4">
                    <span className="grid place-items-center w-14 h-14 rounded-2xl bg-mist text-primary-dark text-lg font-semibold">{invoice.room}</span>
                    <div className="flex-1 min-w-48">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h2 className="text-lg font-semibold text-primary-dark">{invoice.tenant_name}</h2>
                            <StatusBadge status={invoice.status} />
                            {daysLate(invoice) > 0 && (
                                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 ring-1 ring-red-200">เกินกำหนด {daysLate(invoice)} วัน</span>
                            )}
                        </div>
                        <p className="text-sm text-muted mt-0.5">ห้อง {invoice.room} · ใบแจ้งหนี้เดือน {formatMonth(invoice.month)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <DownloadInvoiceButton invoice={invoice} label="ดาวน์โหลด PDF" className="border border-line text-primary-dark hover:bg-mist/50 px-4 py-1.5 rounded-xl text-sm" />
                        <button
                            onClick={() => onEdit(invoice)}
                            title={paidOf(invoice) > 0 ? 'ได้รับชำระแล้ว แก้ไขยอดรวมไม่ได้' : undefined}
                            className="border border-line text-primary-dark hover:bg-mist/50 px-4 py-1.5 rounded-xl text-sm"
                        >แก้ไข</button>
                        <button onClick={() => onDelete(invoice)} className="border border-red-200 text-red-600 hover:bg-red-50 px-4 py-1.5 rounded-xl text-sm">ลบ</button>
                    </div>
                    <div className="w-full pt-4 border-t border-line">
                        <InvoiceStepper status={invoice.status} />
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
                    {/* ซ้าย: รายการค่าใช้จ่าย + บัญชีรับโอน */}
                    <div className="flex flex-col gap-4">
                        <InvoiceBreakdown invoice={invoice} />
                        <div className="bg-white rounded-2xl shadow-card p-4 text-sm flex items-center justify-between gap-3">
                            <div>
                                <div className="text-xs text-muted">โอนเข้าบัญชี</div>
                                <div className="font-medium text-ink mt-0.5">{settings.bankName}</div>
                                <div className="text-muted tabular-nums">{settings.bankAccount} · {settings.bankHolder}</div>
                            </div>
                            <CopyButton text={settings.bankAccount} />
                        </div>
                    </div>

                    {/* ขวา: รูปสลิป (หรือเหตุผลที่ปฏิเสธครั้งก่อน) และปุ่มตรวจสลิป */}
                    <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-4">
                        <div className="flex justify-between items-baseline gap-3">
                            <h3 className="font-medium text-primary-dark">หลักฐานการโอนเงิน</h3>
                            {invoice.slip_uploaded_at && (
                                <span className="text-xs text-muted">อัปโหลด {formatDateTime(invoice.slip_uploaded_at)}</span>
                            )}
                        </div>
                        <div className="flex items-center justify-center rounded-xl bg-sand/70 border border-dashed border-line p-4 min-h-72">
                            {invoice.status === 'review' && invoice.slip_path ? (
                                <SlipImage path={invoice.slip_path} />
                            ) : (
                                <div className="text-center text-sm text-muted">
                                    <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-full bg-white text-muted shadow-card">
                                        <Icon name={invoice.reject_reason ? 'ban' : 'image'} className="w-6 h-6" />
                                    </span>
                                    {invoice.reject_reason
                                        ? `สลิปก่อนหน้าถูกปฏิเสธ: ${invoice.reject_reason}`
                                        : paidOf(invoice) > 0
                                            ? 'สลิปที่ยืนยันแล้วอยู่ในประวัติการรับชำระด้านล่าง'
                                            : 'ผู้เช่ายังไม่ได้แนบสลิป'}
                                </div>
                            )}
                        </div>

                        {invoice.status === 'review' && (
                            <VerifyBox invoice={invoice} mode={settings.slipVerifyMode} onVerify={requestSlipVerify} onRefresh={onChanged} />
                        )}

                        {/* รอตรวจสอบ: ปุ่มอนุมัติ / ปฏิเสธ (กดปฏิเสธแล้วต้องกรอกเหตุผลก่อนยืนยัน) */}
                        {invoice.status === 'review' && (
                            <>
                                {rejecting && (
                                    <label className="text-sm text-muted">
                                        เหตุผลที่ปฏิเสธ (ผู้เช่าจะเห็นข้อความนี้)
                                        <textarea
                                            rows="3"
                                            autoFocus
                                            className={inputClass}
                                            value={reason}
                                            onChange={(e) => { setReason(e.target.value); setError('') }}
                                            placeholder="เช่น ยอดโอนไม่ตรง หรือรูปสลิปไม่ชัดเจน"
                                        />
                                    </label>
                                )}
                                {!rejecting && (
                                    <label className="text-sm text-muted">
                                        ยอดที่ได้รับตามสลิป (บาท)
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            inputMode="decimal"
                                            className={inputClass}
                                            value={amountText}
                                            onChange={(e) => { setAmount(e.target.value); setError('') }}
                                        />
                                        <span className="block text-xs mt-1">
                                            {paidOf(invoice) > 0 ? `ได้รับมาแล้ว ${baht(paidOf(invoice))} · ` : ''}ยอดที่ต้องชำระ {baht(due)}{Number(invoice.late_fee_rate) > 0 && ' (รวมค่าปรับล่าช้าถึงวันที่โอน)'}
                                            {Number(amountText) > 0 && Number(amountText) < due && ' · ยอดไม่ครบ ผู้เช่าจะโอนส่วนที่เหลือเพิ่ม'}
                                            {Number(amountText) > due && ` · เกิน ${baht(Math.round((Number(amountText) - due) * 100) / 100)} บันทึกไว้รอโอนคืน`}
                                        </span>
                                    </label>
                                )}
                                {error && <p className="text-sm text-red-600">{error}</p>}
                                <div className="flex gap-3">
                                    {rejecting ? (
                                        <>
                                            <button onClick={() => { setRejecting(false); setError('') }} className="flex-1 border border-line text-muted hover:bg-sand py-2.5 rounded-xl">ยกเลิก</button>
                                            <button onClick={() => review(false)} disabled={busy} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white py-2.5 rounded-xl font-medium">ยืนยันปฏิเสธ</button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={() => setRejecting(true)} disabled={busy} className="flex-1 border border-red-200 text-red-600 hover:bg-red-50 py-2.5 rounded-xl">ปฏิเสธ</button>
                                            <button onClick={() => review(true)} disabled={busy} className="flex-[2] bg-primary hover:bg-primary-dark disabled:opacity-60 text-white py-2.5 rounded-xl font-medium shadow-card">
                                                {busy ? 'กำลังบันทึก...' : `ยืนยันรับ ${baht(Number(amountText) > 0 ? Number(amountText) : 0)}`}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}

                        <PaymentHistory invoiceId={invoice.id} refreshKey={invoice.paid_amount} invoice={invoice} />

                        {/* โอนเกิน: แสดงยอดที่ต้องโอนคืน และปุ่มบันทึกเมื่อโอนคืนแล้ว */}
                        {Number(invoice.refund_amount) > 0 && (
                            <div className={`rounded-xl px-4 py-3 text-sm flex flex-col gap-2 ring-1 ${invoice.refund_status === 'pending' ? 'bg-sky-50 text-sky-900 ring-sky-200' : 'bg-emerald-50 text-emerald-900 ring-emerald-200'}`}>
                                <div className="font-medium">
                                    {invoice.refund_status === 'pending'
                                        ? `ผู้เช่าโอนเกิน ${baht(invoice.refund_amount)} — รอโอนคืน`
                                        : `โอนคืน ${baht(invoice.refund_amount)} แล้วเมื่อ ${formatDateTime(invoice.refunded_at)}`}
                                </div>
                                {invoice.refund_status === 'done' && invoice.refund_note && <div className="text-xs">หมายเหตุ: {invoice.refund_note}</div>}
                                {invoice.refund_status === 'pending' && (
                                    <>
                                        <input
                                            className={smallInputClass}
                                            maxLength={500}
                                            placeholder="หมายเหตุ เช่น โอนคืนเข้าบัญชีเดิมเมื่อวันที่ ... (ไม่บังคับ)"
                                            value={refundNote}
                                            onChange={(e) => setRefundNote(e.target.value)}
                                        />
                                        {error && <p className="text-red-600">{error}</p>}
                                        <button onClick={markRefunded} disabled={busy} className="self-start bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white px-4 py-1.5 rounded-xl">
                                            {busy ? 'กำลังบันทึก...' : 'บันทึกว่าโอนคืนแล้ว'}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}

export default InvoiceDetail
