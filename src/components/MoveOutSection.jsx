import { useEffect, useMemo, useState } from 'react'
import DatePicker from './DatePicker'
import { baht, formatDateTime } from '../lib/billing'
import { buildDeductions, forfeitDeduction, forfeitsDeposit, moveOutOutcome, reviewingInvoicesOf, settlement, unpaidInvoicesOf, validateCustoms } from '../lib/moveOut'
import { useRealtimeReload } from '../lib/realtime'
import { supabase } from '../lib/supabaseClient'
import { formatDate } from '../lib/tenants'

// เงินประกันและการย้ายออก (ในหน้ารายละเอียดผู้เช่า, supabase/migrations/20261022000000_initial_schema.sql (ส่วน move-out))
// ขั้นตอน: ระบุวันที่ย้ายออก เลือกใบแจ้งหนี้ค้างที่จะหักจากเงินประกัน เพิ่มรายการหักอื่น ๆ -> ระบบคำนวณยอดคืน/ยอดที่ต้องจ่ายเพิ่ม -> บันทึก
// หลังบันทึก: บันทึกว่าคืนเงินประกันแล้ว และใช้ปุ่ม "ลบผู้เช่า" เดิมเพื่อปิดบัญชีและคืนห้องว่าง (บันทึกย้ายออกยังอยู่)

const inputClass = 'w-full border border-line bg-white rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-secondary'
const today = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function MoveOutSection({ tenant }) {
    // record: undefined = ยังโหลด, null = ยังไม่ได้บันทึกย้ายออก, ออบเจ็กต์ = บันทึกแล้ว  unavailable = ยังไม่ได้รัน ส่วน move-out ของไฟล์ migration
    const [record, setRecord] = useState(undefined)
    const [invoices, setInvoices] = useState([])
    const [unavailable, setUnavailable] = useState(false)
    const [open, setOpen] = useState(false)
    const [date, setDate] = useState(today())
    const [picked, setPicked] = useState({})
    const [customs, setCustoms] = useState([{ label: '', amount: '' }])
    const [note, setNote] = useState('')
    const [refundNote, setRefundNote] = useState('')
    const [confirming, setConfirming] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [notice, setNotice] = useState('')

    const load = async () => {
        const [rec, inv] = await Promise.all([
            // สัญญาของผู้เช่าคนนี้เท่านั้น (ผู้เช่าคนใหม่ที่เริ่มสัญญาวันเดียวกับคนเก่าที่ย้ายออกจากห้องเดียวกัน ไม่นับเป็นรายการเดียวกัน)
            (tenant.userId
                ? supabase.from('move_outs').select('*').eq('room', tenant.room).eq('start_date', tenant.startDate).eq('tenant_user_id', tenant.userId)
                : supabase.from('move_outs').select('*').eq('room', tenant.room).eq('start_date', tenant.startDate).is('tenant_user_id', null)
            ).maybeSingle(),
            supabase.from('invoices').select('*').eq('room', tenant.room),
        ])
        // ตารางยังไม่มี = ยังไม่ได้รัน ส่วน move-out ของไฟล์ migration ซ่อนส่วนนี้ (ไม่ให้แอดมินกดแล้วพัง)
        if (rec.error) {
            setUnavailable(true)
            return
        }
        setRecord(rec.data)
        setInvoices(inv.data ?? [])
    }

    useEffect(() => {
        let active = true
        // โหลดครั้งแรก/เมื่อเปลี่ยนผู้เช่า (setState เกิดหลังได้ข้อมูล ไม่ได้เรียกตรง ๆ ใน effect)
        Promise.resolve().then(() => active && load())
        return () => {
            active = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenant.room, tenant.startDate])

    // อัปเดตเองเมื่อบันทึกย้ายออกหรือใบแจ้งหนี้ของห้องเปลี่ยน (เช่น ผู้เช่าเพิ่งจ่าย)
    useRealtimeReload(['move_outs', 'invoices'], load, { enabled: !unavailable })

    // เฉพาะใบของผู้เช่าคนนี้ (ใบค้างของผู้เช่าคนก่อนในห้องเดียวกันไม่เกี่ยว)
    const unpaid = useMemo(() => unpaidInvoicesOf(invoices, { room: tenant.room, userId: tenant.userId }), [invoices, tenant.room, tenant.userId])
    const reviewing = useMemo(() => reviewingInvoicesOf(invoices, { room: tenant.room, userId: tenant.userId }), [invoices, tenant.room, tenant.userId])
    const selected = unpaid.filter((i) => picked[i.id] ?? true)
    const baseDeductions = buildDeductions(selected, customs)
    // ย้ายออกก่อนวันสิ้นสุดสัญญา: ไม่คืนเงินประกัน (เพิ่มรายการหักส่วนที่เหลือให้อัตโนมัติ)
    const forfeit = forfeitsDeposit(tenant.endDate, date)
    const forfeitRows = forfeit ? forfeitDeduction(tenant.deposit, baseDeductions) : []
    const deductions = [...baseDeductions, ...forfeitRows]
    const result = settlement(tenant.deposit, deductions)
    const customError = validateCustoms(customs)

    if (unavailable || record === undefined) return null

    const setCustom = (index, key, value) => {
        setCustoms((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)))
        setConfirming(false)
        setError('')
    }

    const submit = async () => {
        setBusy(true)
        setError('')
        const { error: err } = await supabase.rpc('record_move_out', { p_room: tenant.room, p_date: date, p_deductions: deductions, p_note: note })
        setBusy(false)
        if (err) {
            setConfirming(false)
            return setError(err.message)
        }
        setOpen(false)
        setNotice('บันทึกการย้ายออกแล้ว ขั้นต่อไป: คืนเงินประกัน (ถ้ามี) แล้วกด "ลบผู้เช่า" ด้านล่างเพื่อปิดบัญชีและคืนห้องว่าง')
        await load()
    }

    const markRefunded = async () => {
        setBusy(true)
        setError('')
        const { error: err } = await supabase.rpc('mark_deposit_refunded', { p_id: record.id, p_note: refundNote })
        setBusy(false)
        if (err) return setError(err.message)
        await load()
    }

    const outcome = record ? moveOutOutcome(record) : null

    return (
        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-primary-dark">เงินประกันและการย้ายออก</h2>
                    <p className="text-sm text-muted">เงินประกัน {baht(tenant.deposit)}{Number(tenant.deposit) === 0 && ' (ยังไม่ได้ตั้ง แก้ได้ในฟอร์มข้อมูลผู้เช่าด้านบน)'}</p>
                </div>
                {!record && !open && (
                    <button type="button" onClick={() => { setOpen(true); setNotice('') }} className="border border-line bg-white text-primary-dark hover:bg-mist/40 px-4 py-2 rounded-xl text-sm">
                        ดำเนินการย้ายออก / คืนเงินประกัน
                    </button>
                )}
            </div>

            {notice && <p role="status" className="text-sm text-emerald-900 bg-emerald-50 ring-1 ring-emerald-200 rounded-xl px-4 py-2.5">{notice}</p>}

            {/* บันทึกแล้ว: สรุปและสถานะคืนเงิน */}
            {record && (
                <div className="rounded-xl border border-line bg-sand/50 p-4 flex flex-col gap-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                        <span>ย้ายออกวันที่ <strong>{formatDate(record.move_out_date)}</strong></span>
                        <span className="text-muted">บันทึกเมื่อ {formatDateTime(record.created_at)}</span>
                    </div>
                    <dl className="flex flex-col gap-1.5">
                        <div className="flex justify-between"><dt className="text-muted">เงินประกัน</dt><dd className="tabular-nums">{baht(record.deposit)}</dd></div>
                        {record.deductions.map((d, i) => (
                            <div key={i} className="flex justify-between"><dt className="text-muted">หัก: {d.label}{d.invoice_id && ' (ชำระใบแจ้งหนี้แล้ว)'}</dt><dd className="tabular-nums text-red-700">−{baht(d.amount)}</dd></div>
                        ))}
                        <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
                            <dt>{outcome.key === 'owed' ? 'ผู้เช่าต้องจ่ายเพิ่ม' : 'คืนผู้เช่า'}</dt>
                            <dd className={`tabular-nums ${outcome.key === 'owed' ? 'text-red-700' : 'text-emerald-700'}`}>{baht(outcome.key === 'owed' ? record.owed_amount : record.refund_amount)}</dd>
                        </div>
                    </dl>
                    {record.note && <p className="text-xs text-muted">หมายเหตุ: {record.note}</p>}

                    {record.refund_status === 'done' && (
                        <p className="text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200 rounded-lg px-3 py-2">
                            คืนเงินประกัน {baht(record.refund_amount)} แล้วเมื่อ {formatDateTime(record.refunded_at)}{record.refund_note && ` · ${record.refund_note}`}
                        </p>
                    )}
                    {record.refund_status === 'pending' && (
                        <div className="flex flex-col gap-2">
                            <p className="text-sky-900 bg-sky-50 ring-1 ring-sky-200 rounded-lg px-3 py-2">รอคืนเงินประกัน {baht(record.refund_amount)} ให้ผู้เช่า</p>
                            <input className={inputClass} maxLength={500} placeholder="หมายเหตุ เช่น โอนคืนเข้าบัญชีเดิมวันที่ ... (ไม่บังคับ)" value={refundNote} onChange={(e) => setRefundNote(e.target.value)} />
                            <button type="button" onClick={markRefunded} disabled={busy} className="self-start bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white px-4 py-1.5 rounded-xl text-sm">
                                {busy ? 'กำลังบันทึก...' : 'บันทึกว่าคืนเงินประกันแล้ว'}
                            </button>
                        </div>
                    )}
                    {record.refund_status === 'none' && outcome.key !== 'owed' && <p className="text-muted">ไม่มียอดต้องคืน</p>}
                    {outcome.key === 'owed' && <p className="text-red-800 bg-red-50 ring-1 ring-red-200 rounded-lg px-3 py-2">ยอดหักเกินเงินประกัน ผู้เช่าต้องจ่ายเพิ่ม {baht(record.owed_amount)} (ระบบไม่ได้ติดตามยอดนี้ ควรเรียกเก็บนอกระบบ)</p>}
                    {error && <p className="text-red-600">{error}</p>}
                </div>
            )}

            {/* ฟอร์มย้ายออก */}
            {open && !record && (
                <div className="rounded-xl border border-line p-4 flex flex-col gap-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="text-sm text-muted">
                            วันที่ย้ายออก
                            <DatePicker value={date} onChange={(v) => { setDate(v); setConfirming(false) }} />
                        </div>
                        <label className="text-sm text-muted">
                            หมายเหตุ (ไม่บังคับ)
                            <input className={`${inputClass} mt-1`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                        </label>
                    </div>

                    {reviewing.length > 0 && (
                        <p className="text-sm text-amber-900 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-3 py-2">
                            มีใบแจ้งหนี้ {reviewing.length} ใบที่ผู้เช่าส่งสลิปรอตรวจ ควรตรวจสลิปให้เสร็จก่อน ไม่งั้นหักใบนั้นจากเงินประกันไม่ได้
                        </p>
                    )}

                    <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-medium text-primary-dark">ใบแจ้งหนี้ที่ยังค้าง (ติ๊กใบที่จะหักจากเงินประกัน ใบที่หักแล้วจะถือว่าชำระแล้ว)</h3>
                        {unpaid.length === 0 ? (
                            <p className="text-sm text-muted">ไม่มียอดค้างชำระ</p>
                        ) : (
                            unpaid.map((i) => (
                                <label key={i.id} className="flex items-center justify-between gap-3 text-sm rounded-lg bg-sand/60 px-3 py-2 cursor-pointer">
                                    <span className="flex items-center gap-2">
                                        <input type="checkbox" checked={picked[i.id] ?? true} onChange={(e) => { setPicked({ ...picked, [i.id]: e.target.checked }); setConfirming(false) }} />
                                        {i.label}
                                    </span>
                                    <span className="tabular-nums font-medium">{baht(i.balance)}</span>
                                </label>
                            ))
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-medium text-primary-dark">รายการหักอื่น ๆ (ค่าทำความสะอาด ค่าซ่อมความเสียหาย ฯลฯ)</h3>
                        {customs.map((c, i) => (
                            <div key={i} className="flex gap-2">
                                <input className={inputClass} maxLength={100} placeholder="ชื่อรายการ" value={c.label} onChange={(e) => setCustom(i, 'label', e.target.value)} />
                                <input className={`${inputClass} w-32 text-right`} type="number" min="0" step="0.01" placeholder="บาท" value={c.amount} onChange={(e) => setCustom(i, 'amount', e.target.value)} />
                                {customs.length > 1 && (
                                    <button type="button" onClick={() => setCustoms((rows) => rows.filter((_, j) => j !== i))} aria-label="ลบรายการ" className="text-red-600 px-2">✕</button>
                                )}
                            </div>
                        ))}
                        <button type="button" onClick={() => setCustoms([...customs, { label: '', amount: '' }])} className="self-start text-sm text-primary hover:underline">+ เพิ่มรายการหัก</button>
                    </div>

                    {forfeit && (
                        <p className="text-sm font-medium text-amber-900 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-3 py-2">
                            ย้ายออกก่อนวันสิ้นสุดสัญญา ({formatDate(tenant.endDate)}) ไม่คืนเงินประกัน
                        </p>
                    )}

                    <dl className="rounded-lg bg-sand/60 p-3 text-sm flex flex-col gap-1.5">
                        <div className="flex justify-between"><dt className="text-muted">เงินประกัน</dt><dd className="tabular-nums">{baht(result.deposit)}</dd></div>
                        <div className="flex justify-between"><dt className="text-muted">หักรวม</dt><dd className="tabular-nums text-red-700">−{baht(result.total)}</dd></div>
                        <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
                            <dt>{result.owed > 0 ? 'ผู้เช่าต้องจ่ายเพิ่ม' : 'คืนผู้เช่า'}</dt>
                            <dd className={`tabular-nums ${result.owed > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{baht(result.owed > 0 ? result.owed : result.refund)}</dd>
                        </div>
                    </dl>

                    {(customError || error) && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{customError || error}</p>}

                    <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => { setOpen(false); setConfirming(false); setError('') }} disabled={busy} className="border border-line text-muted hover:bg-sand px-4 py-2 rounded-xl text-sm">ยกเลิก</button>
                        {confirming ? (
                            <button type="button" onClick={submit} disabled={busy} className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-5 py-2 rounded-xl text-sm font-medium">
                                {busy ? 'กำลังบันทึก...' : `ยืนยันบันทึก${selected.length > 0 ? ` (ใบแจ้งหนี้ ${selected.length} ใบจะถูกบันทึกเป็นชำระแล้ว ย้อนกลับไม่ได้)` : ' (ย้อนกลับไม่ได้)'}`}
                            </button>
                        ) : (
                            <button type="button" onClick={() => setConfirming(true)} disabled={!!customError} className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-medium shadow-card">
                                บันทึกการย้ายออก
                            </button>
                        )}
                    </div>
                </div>
            )}
        </section>
    )
}

export default MoveOutSection
