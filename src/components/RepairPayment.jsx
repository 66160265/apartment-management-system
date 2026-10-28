import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import DownloadReceiptButton from './DownloadReceiptButton'
import Icon from './Icon'
import { PromptPayCard, SlipImage, VerifyBox } from './InvoiceParts'
import { baht, formatDateTime } from '../lib/billing'
import { useRealtimeReload } from '../lib/realtime'
import { owesRepairCost } from '../lib/repairPayments'
import { buildRepairReceipt } from '../lib/receipts'
import { refreshRepairCosts, useRepairCosts } from '../lib/useRepairCosts'
import { requestSlipVerify } from '../lib/slipVerify'
import { supabase } from '../lib/supabaseClient'
import { useSettings } from '../lib/useSettings'

// การจ่ายค่าซ่อมในระบบ (supabase/migrations/20261022000000_initial_schema.sql (ส่วน repair-payments)): ผู้เช่าโอนตามยอดค่าซ่อมแล้วแนบสลิป ผู้ดูแลตรวจและยืนยัน
// เงื่อนไข: ซ่อมเสร็จแล้ว (done) ผู้ดูแลระบุให้ผู้เช่าเป็นผู้ชำระ (cost_payer = tenant) และมียอด (cost > 0)

const MAX_SIZE = 5 * 1024 * 1024
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

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

// กล่องเลือกรูปสลิปและปุ่มส่ง (onSubmit(file) คืนข้อความ error หรือ null เมื่อสำเร็จ)
function SlipPicker({ label, onSubmit }) {
    const inputRef = useRef(null)
    const [file, setFile] = useState(null)
    const [preview, setPreview] = useState(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)

    useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

    const pick = (f) => {
        setError('')
        if (!f) return
        if (!TYPES[f.type]) return setError('รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WEBP')
        if (f.size > MAX_SIZE) return setError('ไฟล์ต้องมีขนาดไม่เกิน 5 MB')
        setFile(f)
        setPreview(URL.createObjectURL(f))
    }
    const clear = () => {
        setFile(null)
        setPreview(null)
        if (inputRef.current) inputRef.current.value = ''
    }
    const submit = async () => {
        setBusy(true)
        const err = await onSubmit(file)
        setBusy(false)
        if (err) setError(err)
        else clear()
    }

    return (
        <div className="flex flex-col gap-3">
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pick(e.target.files[0])} className="hidden" />
            {file ? (
                <div className="flex flex-col items-center gap-2 rounded-xl bg-sand/70 border border-line p-3">
                    <img src={preview} alt="ตัวอย่างสลิป" className="max-h-64 max-w-full object-contain rounded-lg" />
                    <button type="button" onClick={clear} disabled={busy} className="text-xs text-red-600 hover:underline">เปลี่ยนรูป</button>
                </div>
            ) : (
                <button type="button" onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-line bg-sand/50 hover:border-secondary px-4 py-6 text-center">
                    <Icon name="upload" className="w-6 h-6 text-primary" />
                    <span className="text-sm font-medium text-primary-dark">แนบสลิปการโอนเงิน</span>
                    <span className="text-xs text-muted">JPG, PNG, WEBP · ไม่เกิน 5 MB</span>
                </button>
            )}
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
            <button type="button" onClick={submit} disabled={!file || busy} className="bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium">
                {busy ? 'กำลังส่งสลิป...' : label}
            </button>
        </div>
    )
}

// แถบเตือนค่าซ่อมที่ผู้เช่ายังไม่ได้ชำระ (ไม่แสดงถ้าไม่มี) ใช้ได้ทั้งหน้าภาพรวมและหน้าแจ้งซ่อม
// onOpen(repairId) = กดรายการแล้วเปิดเรื่องนั้น (ไม่ส่ง = ลิงก์ไปหน้าแจ้งซ่อม)
export function RepairCostBanner({ onOpen }) {
    const items = useRepairCosts()
    if (items.length === 0) return null
    const total = items.reduce((sum, r) => sum + Number(r.cost), 0)
    return (
        <div role="alert" className="rounded-2xl bg-amber-100 ring-1 ring-amber-400 text-amber-950 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 font-medium">
                <Icon name="alert" className="w-5 h-5 shrink-0 text-amber-700" />
                มีค่าซ่อมค้างชำระ {items.length} รายการ รวม {baht(total)}
            </div>
            <ul className="flex flex-col gap-1.5">
                {items.map((r) => {
                    const label = (
                        <>
                            <span className="truncate">ห้อง {r.room} · {r.problem}</span>
                            <span className="shrink-0 font-semibold tabular-nums text-amber-900">{baht(r.cost)} · ชำระ</span>
                        </>
                    )
                    const cls = 'w-full flex items-center justify-between gap-3 text-left text-sm bg-white hover:bg-amber-50 text-ink border border-amber-300 shadow-sm rounded-xl px-3 py-2'
                    return (
                        <li key={r.id}>
                            {onOpen ? (
                                <button type="button" onClick={() => onOpen(r.id)} className={cls}>{label}</button>
                            ) : (
                                <Link to="/repairs" className={cls}>{label}</Link>
                            )}
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

// ฝั่งผู้เช่า: ยอดค่าซ่อม QR พร้อมเพย์ แนบสลิป และสถานะการชำระ (แสดงเฉพาะเรื่องที่มีค่าซ่อมให้ผู้เช่าชำระ)
export function TenantRepairPayment({ repair, userId }) {
    const settings = useSettings()
    const [payments, refresh] = useRepairPayments(repair.id)
    if (payments === null) return null
    if (!owesRepairCost(repair) && payments.length === 0) return null

    const paid = payments.find((p) => p.status === 'paid')
    const reviewing = payments.find((p) => p.status === 'review')
    const lastRejected = [...payments].reverse().find((p) => p.status === 'rejected')
    // ยอดที่ต้องโอน = ค่าซ่อม ส่งสลิปแล้วใช้ยอดที่ระบบบันทึกไว้ตอนส่ง
    const due = Number(repair.cost)
    const shown = paid ?? reviewing

    // ส่งสลิป: อัปโหลดรูปลงถัง slips (โฟลเดอร์ของตัวเอง) แล้วเรียก submit_repair_slip ส่งไม่สำเร็จให้ลบรูปทิ้ง
    const submitSlip = async (file) => {
        const path = `${userId}/repair-${repair.id}-${Date.now()}.${TYPES[file.type]}`
        const { error: uploadError } = await supabase.storage.from('slips').upload(path, file, { contentType: file.type })
        if (uploadError) return `อัปโหลดไม่สำเร็จ: ${uploadError.message}`
        const { data: paymentId, error } = await supabase.rpc('submit_repair_slip', { p_repair: repair.id, p_path: path })
        if (error) {
            await supabase.storage.from('slips').remove([path])
            return `ส่งสลิปไม่สำเร็จ: ${error.message}`
        }
        // สั่งตรวจสลิปด้วยระบบ ไม่รอผล (โหมดปิดหรือตรวจไม่ได้ แอดมินยังตรวจด้วยตาได้)
        requestSlipVerify(paymentId, 'repair')
        await refresh()
        refreshRepairCosts()
        return null
    }

    return (
        <div className="rounded-2xl border border-line bg-white p-4 flex flex-col gap-3">
            <h3 className="font-medium text-primary-dark">ชำระค่าซ่อม {baht(shown ? shown.amount : due)}</h3>

            {paid ? (
                <div className="text-sm text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span>ชำระค่าซ่อมเรียบร้อยแล้ว เมื่อ {formatDateTime(paid.reviewed_at)}</span>
                    {paid.receipt_no !== null && paid.receipt_no !== undefined && (
                        <DownloadReceiptButton receipt={buildRepairReceipt({ payment: paid, repair })} className="text-xs text-primary hover:underline" label="ดาวน์โหลดใบเสร็จ" />
                    )}
                </div>
            ) : reviewing ? (
                <>
                    <p className="text-sm text-sky-800 bg-sky-50 ring-1 ring-sky-200 rounded-xl px-4 py-2.5">
                        ส่งสลิปเมื่อ {formatDateTime(reviewing.slip_uploaded_at)} — รอผู้ดูแลระบบตรวจสอบ
                    </p>
                    <div className="flex justify-center rounded-xl bg-sand/70 border border-dashed border-line p-3"><SlipImage path={reviewing.slip_path} /></div>
                </>
            ) : (
                <>
                    {lastRejected && (
                        <p className="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-2.5">
                            สลิปก่อนหน้าถูกปฏิเสธ: {lastRejected.reject_reason} — กรุณาโอนและแนบสลิปใหม่
                        </p>
                    )}
                    <PromptPayCard invoice={{ total: due, paid_amount: 0 }} />
                    {settings.bankAccount && (
                        <p className="text-xs text-muted text-center">
                            หรือโอนเข้าบัญชี {settings.bankName} {settings.bankAccount} {settings.bankHolder && `· ${settings.bankHolder}`}
                        </p>
                    )}
                    <SlipPicker label={`ส่งสลิปให้ตรวจสอบ · ${baht(due)}`} onSubmit={submitSlip} />
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
    if (!owesRepairCost(repair) && payments.length === 0) return null

    const paid = payments.find((p) => p.status === 'paid')
    const reviewing = payments.find((p) => p.status === 'review')
    const rejected = payments.filter((p) => p.status === 'rejected')

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
                    <p className="text-xs text-muted">ยืนยันเมื่อยอดในสลิปเท่ากับยอดที่ต้องชำระ ({baht(reviewing.amount)}) ถ้ายอดไม่ตรง ให้ปฏิเสธพร้อมเหตุผล ผู้เช่าจะโอนและส่งสลิปใหม่</p>
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
