import { useCallback, useEffect, useState } from 'react'
import DownloadInvoiceButton from './DownloadInvoiceButton'
import Icon from './Icon'
import PageHeader from './PageHeader'
import MonthPicker from './MonthPicker'
import { CopyButton, InvoiceBreakdown, InvoiceStepper, SlipImage, StatusBadge } from './InvoiceParts'
import { invoiceStatuses } from '../data/billing'
import { baht, calcInvoice, currentMonth, formatDateTime, formatMonth } from '../lib/billing'
import { supabase } from '../lib/supabaseClient'
import { useSettings } from '../lib/useSettings'

const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white'
const smallInputClass = 'w-full border border-line bg-white rounded-lg px-2.5 py-1.5 mt-1 text-sm outline-none focus:border-secondary'

// อัตราค่าบริการเป็น null = ใช้ค่าเริ่มต้นจากหน้า "ตั้งค่า" (แก้ในฟอร์มเพื่อกำหนดเฉพาะใบนี้)
const makeEmptyForm = () => ({
    room: '',
    month: currentMonth(),
    waterPrev: 0,
    waterCurr: '',
    waterRate: null,
    elecPrev: 0,
    elecCurr: '',
    elecRate: null,
    commonFee: null,
})

const summaryCards = [
    { value: 'all', label: 'ทั้งหมด', icon: 'receipt', tone: 'bg-slate-100 text-slate-600' },
    { value: 'pending', label: 'รอชำระ', icon: 'clock', tone: 'bg-amber-50 text-amber-700' },
    { value: 'review', label: 'รอตรวจสอบ', icon: 'review', tone: 'bg-sky-50 text-sky-700' },
    { value: 'paid', label: 'ชำระแล้ว', icon: 'checkCircle', tone: 'bg-emerald-50 text-emerald-700' },
]

function InvoiceDetail({ invoice, onBack, onChanged, onEdit, onDelete }) {
    const settings = useSettings()
    const [rejecting, setRejecting] = useState(false)
    const [reason, setReason] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const review = async (approve) => {
        if (!approve && !reason.trim()) {
            setError('กรุณาระบุเหตุผลที่ปฏิเสธ')
            return
        }
        setBusy(true)
        const { error: err } = await supabase
            .from('invoices')
            .update(approve
                ? { status: 'paid', reviewed_at: new Date().toISOString(), reject_reason: null }
                : { status: 'pending', slip_path: null, slip_uploaded_at: null, reject_reason: reason.trim() })
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

    return (
        <>
            <PageHeader title="รายละเอียดใบแจ้งหนี้" />
            <div className="mx-6 mb-6 flex flex-col gap-4">
                <button onClick={onBack} className="self-start flex items-center gap-1.5 border border-line bg-white text-primary-dark hover:bg-mist/40 px-3.5 py-1.5 rounded-xl text-sm"><Icon name="arrowLeft" className="w-4 h-4" />กลับไปรายการใบแจ้งหนี้</button>

                <div className="bg-white rounded-2xl shadow-card p-5 flex flex-wrap items-center gap-4">
                    <span className="grid place-items-center w-14 h-14 rounded-2xl bg-mist text-primary-dark text-lg font-semibold">{invoice.room}</span>
                    <div className="flex-1 min-w-48">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h2 className="text-lg font-semibold text-primary-dark">{invoice.tenant_name}</h2>
                            <StatusBadge status={invoice.status} />
                        </div>
                        <p className="text-sm text-muted mt-0.5">ห้อง {invoice.room} · ใบแจ้งหนี้เดือน {formatMonth(invoice.month)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <DownloadInvoiceButton invoice={invoice} label="ดาวน์โหลด PDF" className="border border-line text-primary-dark hover:bg-mist/50 px-4 py-1.5 rounded-xl text-sm" />
                        <button onClick={() => onEdit(invoice)} className="border border-line text-primary-dark hover:bg-mist/50 px-4 py-1.5 rounded-xl text-sm">แก้ไข</button>
                        <button onClick={() => onDelete(invoice)} className="border border-red-200 text-red-600 hover:bg-red-50 px-4 py-1.5 rounded-xl text-sm">ลบ</button>
                    </div>
                    <div className="w-full pt-4 border-t border-line">
                        <InvoiceStepper status={invoice.status} />
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">
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

                    <div className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
                        <div className="flex justify-between items-baseline gap-3">
                            <h3 className="font-medium text-primary-dark">หลักฐานการโอนเงิน</h3>
                            {invoice.slip_uploaded_at && (
                                <span className="text-xs text-muted">อัปโหลด {formatDateTime(invoice.slip_uploaded_at)}</span>
                            )}
                        </div>
                        <div className="flex items-center justify-center rounded-xl bg-sand/70 border border-dashed border-line p-4 min-h-72">
                            {invoice.slip_path ? (
                                <SlipImage path={invoice.slip_path} />
                            ) : (
                                <div className="text-center text-sm text-muted">
                                    <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-full bg-white text-muted shadow-card">
                                        <Icon name={invoice.reject_reason ? 'ban' : 'image'} className="w-6 h-6" />
                                    </span>
                                    {invoice.reject_reason ? `สลิปก่อนหน้าถูกปฏิเสธ: ${invoice.reject_reason}` : 'ผู้เช่ายังไม่ได้แนบสลิป'}
                                </div>
                            )}
                        </div>

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
                                                {busy ? 'กำลังบันทึก...' : `อนุมัติ ${baht(invoice.total)}`}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}

function DeleteModal({ invoice, onConfirm, onCancel }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const handleDelete = async () => {
        setBusy(true)
        const err = await onConfirm(invoice)
        setBusy(false)
        if (err) setError(err)
    }

    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 shadow-xl w-[420px] max-w-[92vw] flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <span className="grid place-items-center w-10 h-10 rounded-full bg-red-50 text-red-600"><Icon name="trash" className="w-5 h-5" /></span>
                    <h2 className="text-lg font-semibold text-primary-dark">ลบใบแจ้งหนี้</h2>
                </div>
                <p className="text-sm text-ink">
                    ลบใบแจ้งหนี้เดือน {formatMonth(invoice.month)} ของห้อง {invoice.room} ({invoice.tenant_name}) ยอด {baht(invoice.total)}
                    {invoice.slip_path && ' พร้อมรูปสลิปที่แนบมา'} ผู้เช่าจะไม่เห็นใบแจ้งหนี้นี้อีก การลบไม่สามารถกู้คืนได้
                </p>
                {invoice.status === 'paid' && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">ใบแจ้งหนี้นี้ชำระเงินแล้ว การลบจะทำให้ประวัติการชำระหายไป</p>
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="border border-line text-muted hover:bg-sand px-4 py-1.5 rounded-lg">ยกเลิก</button>
                    <button onClick={handleDelete} disabled={busy} className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-4 py-1.5 rounded-lg">
                        {busy ? 'กำลังลบ...' : 'ลบใบแจ้งหนี้'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// การ์ดกรอกมิเตอร์ของน้ำ/ไฟ พร้อมสรุปหน่วยที่ใช้
function MeterCard({ icon, tone, title, prefix, form, set, units, cost }) {
    const curr = form[`${prefix}Curr`]
    const prev = form[`${prefix}Prev`]
    return (
        <div className="rounded-2xl border border-line bg-sand/40 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 font-medium text-primary-dark">
                <span className={`grid place-items-center w-8 h-8 rounded-lg ${tone}`}><Icon name={icon} className="w-[18px] h-[18px]" /></span>
                {title}
            </div>
            <label className="text-xs text-muted">
                หน่วยปัจจุบัน
                <input
                    type="number"
                    min={prev}
                    className="w-full border border-line bg-white rounded-xl px-3 py-2 mt-1 text-lg font-medium text-ink outline-none focus:border-secondary"
                    value={curr}
                    onChange={set(`${prefix}Curr`)}
                    placeholder="0"
                />
            </label>
            <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-muted">
                    หน่วยก่อนหน้า
                    <input type="number" min="0" className={smallInputClass} value={prev} onChange={set(`${prefix}Prev`)} />
                </label>
                <label className="text-xs text-muted">
                    ราคา/หน่วย (฿)
                    <input type="number" min="0" step="any" className={smallInputClass} value={form[`${prefix}Rate`]} onChange={set(`${prefix}Rate`)} />
                </label>
            </div>
            <div className="flex justify-between text-xs pt-2 border-t border-line/80">
                <span className="text-muted">ใช้ไป {units} หน่วย</span>
                <span className="font-medium text-primary-dark">{baht(cost)}</span>
            </div>
        </div>
    )
}

// ดึงข้อมูลทั้งหมดที่หน้านี้ใช้ (ไม่แตะ state เพื่อเรียกใช้ได้ทั้งใน effect และหลังบันทึก)
async function fetchData() {
    const [tenantsRes, roomsRes, invoicesRes] = await Promise.all([
        supabase.from('tenants').select('room, name, user_id'),
        supabase.from('rooms').select('number, rent'),
        supabase.from('invoices').select('*').order('created_at', { ascending: false }),
    ])
    return { tenantsRes, roomsRes, invoicesRes }
}

function AdminInvoices() {
    const [tenants, setTenants] = useState([])
    const [rents, setRents] = useState({})
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const settings = useSettings()
    const [form, setForm] = useState(makeEmptyForm)
    const [formError, setFormError] = useState('')
    const [saving, setSaving] = useState(false)
    const [filter, setFilter] = useState('all')
    const [search, setSearch] = useState('')
    const [monthFilter, setMonthFilter] = useState('all')
    const [selectedId, setSelectedId] = useState(null)
    // id ของใบแจ้งหนี้ที่กำลังแก้ไขในฟอร์มด้านบน (null = สร้างใหม่)
    const [editingId, setEditingId] = useState(null)
    const [deleting, setDeleting] = useState(null)

    const applyResult = useCallback(({ tenantsRes, roomsRes, invoicesRes }) => {
        const err = tenantsRes.error || roomsRes.error || invoicesRes.error
        if (err) {
            setLoadError(`โหลดข้อมูลไม่สำเร็จ: ${err.message}`)
        } else {
            setTenants(tenantsRes.data.sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true })))
            setRents(Object.fromEntries(roomsRes.data.map((r) => [r.number, Number(r.rent)])))
            setInvoices(invoicesRes.data)
            setLoadError('')
        }
        setLoading(false)
    }, [])

    // โหลดซ้ำหลังบันทึก/ลบ
    const load = useCallback(async () => applyResult(await fetchData()), [applyResult])

    // โหลดครั้งแรก: setState เกิดใน callback หลังได้ข้อมูล ไม่ได้เรียกตรง ๆ ใน effect
    useEffect(() => {
        let active = true
        fetchData().then((result) => {
            if (active) applyResult(result)
        })
        return () => {
            active = false
        }
    }, [applyResult])

    const set = (key) => (e) => {
        setForm({ ...form, [key]: e.target.value })
        setFormError('')
    }

    // เลือกห้อง: ใช้เลขมิเตอร์ครั้งล่าสุดของห้องนั้นเป็นหน่วยก่อนหน้า
    const handleRoomChange = (e) => {
        const room = e.target.value
        const last = invoices
            .filter((i) => i.room === room)
            .sort((a, b) => b.month.localeCompare(a.month))[0]
        setForm({
            ...form,
            room,
            waterPrev: last?.water_curr ?? 0,
            elecPrev: last?.elec_curr ?? 0,
            waterCurr: '',
            elecCurr: '',
        })
        setFormError('')
    }

    // ค่าที่ใช้แสดงและคำนวณ: อัตราที่ยังไม่ได้กำหนดใช้ค่าจากหน้าตั้งค่า
    const view = {
        ...form,
        waterRate: form.waterRate ?? settings.rateWater,
        elecRate: form.elecRate ?? settings.rateElectric,
        commonFee: form.commonFee ?? settings.commonFee,
    }
    const tenant = tenants.find((t) => t.room === form.room)
    const editing = invoices.find((i) => i.id === editingId)
    // ตอนแก้ไขใช้ค่าเช่าที่บันทึกไว้ในใบแจ้งหนี้เดิม
    const rent = editing ? Number(editing.rent) : (rents[form.room] ?? 0)
    const numbers = {
        waterPrev: Number(form.waterPrev),
        waterCurr: Number(form.waterCurr),
        elecPrev: Number(form.elecPrev),
        elecCurr: Number(form.elecCurr),
        waterRate: Number(view.waterRate),
        elecRate: Number(view.elecRate),
        commonFee: Number(view.commonFee),
    }
    const calc = calcInvoice({ rent, ...numbers })

    const startEdit = (invoice) => {
        setForm({
            room: invoice.room,
            month: invoice.month,
            waterPrev: invoice.water_prev,
            waterCurr: invoice.water_curr,
            waterRate: Number(invoice.water_rate),
            elecPrev: invoice.elec_prev,
            elecCurr: invoice.elec_curr,
            elecRate: Number(invoice.elec_rate),
            commonFee: Number(invoice.common_fee),
        })
        setEditingId(invoice.id)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        setFormError('')
        setSelectedId(null)
    }

    const cancelEdit = () => {
        setEditingId(null)
        setForm({ ...makeEmptyForm(), waterRate: form.waterRate, elecRate: form.elecRate, commonFee: form.commonFee })
        setFormError('')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!tenant || form.waterCurr === '' || form.elecCurr === '') {
            setFormError('กรุณาเลือกห้องและกรอกมิเตอร์น้ำ/ไฟให้ครบ')
            return
        }
        if (numbers.waterCurr < numbers.waterPrev || numbers.elecCurr < numbers.elecPrev) {
            setFormError('มิเตอร์ปัจจุบันต้องไม่น้อยกว่าหน่วยก่อนหน้า')
            return
        }
        if (numbers.waterRate < 0 || numbers.elecRate < 0 || numbers.commonFee < 0 || [numbers.waterRate, numbers.elecRate, numbers.commonFee].some(Number.isNaN)) {
            setFormError('อัตราค่าน้ำ ค่าไฟ และค่าส่วนกลางต้องเป็นตัวเลขที่ไม่ติดลบ')
            return
        }
        if (!editingId && !tenant.user_id) {
            setFormError('ห้องนี้ยังไม่มีบัญชีผู้เช่า จึงส่งใบแจ้งหนี้ไม่ได้')
            return
        }
        const amounts = {
            water_prev: numbers.waterPrev,
            water_curr: numbers.waterCurr,
            water_rate: numbers.waterRate,
            elec_prev: numbers.elecPrev,
            elec_curr: numbers.elecCurr,
            elec_rate: numbers.elecRate,
            common_fee: numbers.commonFee,
            total: calc.total,
        }
        setSaving(true)
        // แก้ไขได้ทุกสถานะ (สถานะและสลิปคงเดิม) ค่าเช่าใช้ค่าที่บันทึกไว้เดิม
        const { error } = editingId
            ? await supabase
                .from('invoices')
                .update(amounts)
                .eq('id', editingId)
            : await supabase.from('invoices').insert({
                room: tenant.room,
                user_id: tenant.user_id,
                tenant_name: tenant.name,
                month: form.month,
                rent,
                ...amounts,
            })
        setSaving(false)
        if (error) {
            setFormError(error.code === '23505'
                ? `ห้อง ${tenant.room} มีใบแจ้งหนี้เดือน ${formatMonth(form.month)} แล้ว`
                : `สร้างใบแจ้งหนี้ไม่สำเร็จ: ${error.message}`)
            return
        }
        await load()
        setEditingId(null)
        setForm({ ...makeEmptyForm(), month: form.month, waterRate: form.waterRate, elecRate: form.elecRate, commonFee: form.commonFee })
    }

    // ลบใบแจ้งหนี้พร้อมรูปสลิป (ถ้าลบรูปไม่สำเร็จก็ยังลบใบแจ้งหนี้ได้ เหลือแค่ไฟล์ค้าง)
    const handleDelete = async (invoice) => {
        if (invoice.slip_path) await supabase.storage.from('slips').remove([invoice.slip_path])
        const { error } = await supabase.from('invoices').delete().eq('id', invoice.id)
        if (error) return `ลบไม่สำเร็จ: ${error.message}`
        if (editingId === invoice.id) cancelEdit()
        await load()
        setSelectedId(null)
        setDeleting(null)
    }

    const selected = invoices.find((i) => i.id === selectedId)
    if (selected) {
        return (
            <>
                <InvoiceDetail key={selected.id} invoice={selected} onBack={() => setSelectedId(null)} onChanged={load} onEdit={startEdit} onDelete={setDeleting} />
                {deleting && <DeleteModal invoice={deleting} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
            </>
        )
    }

    const rowCalc = (i) =>
        calcInvoice({
            rent: Number(i.rent),
            waterPrev: i.water_prev,
            waterCurr: i.water_curr,
            elecPrev: i.elec_prev,
            elecCurr: i.elec_curr,
            waterRate: Number(i.water_rate),
            elecRate: Number(i.elec_rate),
            commonFee: Number(i.common_fee),
        })

    const stats = Object.fromEntries(
        summaryCards.map((c) => {
            const list = invoices.filter((i) => c.value === 'all' || i.status === c.value)
            return [c.value, { count: list.length, sum: list.reduce((acc, i) => acc + Number(i.total), 0) }]
        })
    )
    const keyword = search.trim().toLowerCase()
    const months = [...new Set(invoices.map((i) => i.month))].sort().reverse()
    const visible = invoices
        .filter((i) => filter === 'all' || i.status === filter)
        .filter((i) => monthFilter === 'all' || i.month === monthFilter)
        .filter((i) => !keyword || i.room.includes(keyword) || i.tenant_name.toLowerCase().includes(keyword))
        .sort((a, b) => b.month.localeCompare(a.month) || a.room.localeCompare(b.room, undefined, { numeric: true }))

    const totals = visible.reduce(
        (acc, i) => {
            const c = rowCalc(i)
            return {
                rent: acc.rent + Number(i.rent),
                water: acc.water + c.water,
                elec: acc.elec + c.elec,
                common: acc.common + Number(i.common_fee),
                total: acc.total + Number(i.total),
            }
        },
        { rent: 0, water: 0, elec: 0, common: 0, total: 0 }
    )

    return (
        <>
            <PageHeader title="ใบแจ้งหนี้ & ชำระเงิน" subtitle="บันทึกมิเตอร์ สร้างใบแจ้งหนี้ และตรวจสอบสลิปการโอนเงินของผู้เช่า" />

            <div className="px-6 pb-8 flex flex-col gap-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {summaryCards.map((c) => {
                        const active = filter === c.value
                        const urgent = c.value === 'review' && stats.review.count > 0
                        return (
                            <button
                                key={c.value}
                                onClick={() => setFilter(c.value)}
                                aria-pressed={active}
                                className={`text-left rounded-2xl p-4 bg-white shadow-card border-2 transition ${
                                    active ? 'border-primary' : 'border-transparent hover:border-mist'
                                }`}
                            >
                                <div className="flex items-center justify-between text-sm text-muted">
                                    <span>{c.label}</span>
                                    <span className={`grid place-items-center w-8 h-8 rounded-lg ${c.tone}`}><Icon name={c.icon} className="w-[18px] h-[18px]" /></span>
                                </div>
                                <div className="mt-2 flex items-baseline gap-2">
                                    <span className="text-2xl font-semibold text-primary-dark">{stats[c.value].count}</span>
                                    <span className="text-xs text-muted">รายการ</span>
                                    {urgent && <span className="ml-auto text-[11px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">รอคุณตรวจ</span>}
                                </div>
                                <div className="text-xs text-muted mt-0.5 tabular-nums">{baht(stats[c.value].sum)}</div>
                            </button>
                        )
                    })}
                </div>

                <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
                    <div className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
                        <div className="flex flex-wrap justify-between items-center gap-3">
                            <h2 className="font-medium text-primary-dark">
                                {editingId ? `แก้ไขใบแจ้งหนี้ ห้อง ${form.room}` : 'บันทึกมิเตอร์'}
                            </h2>
                            <MonthPicker
                                value={form.month}
                                onChange={(month) => { setForm({ ...form, month }); setFormError('') }}
                                marked={invoices.filter((i) => i.room === form.room && i.id !== editingId).map((i) => i.month)}
                                disabled={!!editingId}
                            />
                        </div>
                        <label className="text-sm text-muted">
                            ห้องพัก
                            <select className={inputClass} value={form.room} onChange={handleRoomChange} disabled={!!editingId}>
                                <option value="">เลือกห้อง...</option>
                                {tenants.map((t) => (
                                    <option key={t.room} value={t.room}>{t.room} - {t.name}</option>
                                ))}
                            </select>
                        </label>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <MeterCard icon="droplet" tone="bg-cyan-50 text-cyan-700" title="มิเตอร์น้ำ" prefix="water" form={view} set={set} units={calc.waterUnits} cost={calc.water} />
                            <MeterCard icon="bolt" tone="bg-amber-50 text-amber-700" title="มิเตอร์ไฟ" prefix="elec" form={view} set={set} units={calc.elecUnits} cost={calc.elec} />
                        </div>
                        <label className="text-sm text-muted sm:w-1/2">
                            ค่าส่วนกลาง (฿)
                            <input type="number" min="0" step="any" className={inputClass} value={view.commonFee} onChange={set('commonFee')} />
                        </label>
                    </div>

                    <div className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4 xl:sticky xl:top-6">
                        <div className="flex justify-between items-baseline gap-3">
                            <h2 className="font-medium text-primary-dark">สรุปยอด</h2>
                            <span className="text-xs text-muted truncate">
                                {tenant ? `ห้อง ${tenant.room} · ${tenant.name}` : 'ยังไม่ได้เลือกห้อง'}
                            </span>
                        </div>
                        <InvoiceBreakdown
                            invoice={{
                                rent,
                                water_prev: numbers.waterPrev,
                                water_curr: form.waterCurr === '' ? numbers.waterPrev : numbers.waterCurr,
                                water_rate: numbers.waterRate || 0,
                                elec_prev: numbers.elecPrev,
                                elec_curr: form.elecCurr === '' ? numbers.elecPrev : numbers.elecCurr,
                                elec_rate: numbers.elecRate || 0,
                                common_fee: numbers.commonFee || 0,
                                total: calc.total || 0,
                            }}
                        />
                        {editing && editing.status !== 'pending' && (
                            <p className="text-sm text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-xl px-4 py-2">
                                ใบแจ้งหนี้นี้{editing.status === 'review' ? 'มีสลิปรอตรวจสอบ' : 'ชำระแล้ว'} หากเปลี่ยนยอดรวม ยอดอาจไม่ตรงกับสลิปที่ผู้เช่าโอนมา
                            </p>
                        )}
                        {formError && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{formError}</p>}
                        <div className="flex gap-3">
                            {editingId && (
                                <button type="button" onClick={cancelEdit} className="flex-1 border border-line text-muted hover:bg-sand py-2.5 rounded-xl">ยกเลิก</button>
                            )}
                            <button type="submit" disabled={saving} className="flex-[2] bg-primary hover:bg-primary-dark disabled:opacity-60 text-white py-2.5 rounded-xl font-medium shadow-card">
                                {saving ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'สร้างใบแจ้งหนี้'}
                            </button>
                        </div>
                    </div>
                </form>

                <div className="bg-white rounded-2xl shadow-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <h2 className="font-medium text-primary-dark">
                            รายการใบแจ้งหนี้
                            <span className="ml-2 text-sm font-normal text-muted">
                                {filter === 'all' ? 'ทั้งหมด' : invoiceStatuses[filter].label} ({visible.length})
                            </span>
                        </h2>
                        <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={monthFilter}
                            onChange={(e) => setMonthFilter(e.target.value)}
                            aria-label="กรองตามเดือน"
                            className="border border-line bg-sand/50 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-secondary"
                        >
                            <option value="all">ทุกเดือน</option>
                            {months.map((m) => (
                                <option key={m} value={m}>{formatMonth(m)}</option>
                            ))}
                        </select>
                        <div className="flex items-center gap-2 border border-line bg-sand/50 rounded-xl px-3 py-1.5 w-64 max-w-full focus-within:border-secondary focus-within:bg-white">
                            <Icon name="search" className="w-4 h-4 text-muted" />
                            <input
                                type="text"
                                placeholder="ค้นหาห้อง/ชื่อผู้เช่า"
                                className="outline-none w-full bg-transparent text-sm"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        </div>
                    </div>
                    <div role="tablist" aria-label="หมวดหมู่ใบแจ้งหนี้" className="flex gap-1 overflow-x-auto overflow-y-hidden mb-4 border-b border-line">
                        {summaryCards.map((c) => {
                            const active = filter === c.value
                            return (
                                <button
                                    key={c.value}
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setFilter(c.value)}
                                    className={`flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                                        active ? 'border-primary text-primary-dark font-medium' : 'border-transparent text-muted hover:text-primary-dark hover:bg-sand/60'
                                    }`}
                                >
                                    {c.label}
                                    <span className={`min-w-6 text-center text-xs rounded-full px-1.5 py-0.5 ${active ? 'bg-primary text-white' : 'bg-sand text-muted'}`}>
                                        {stats[c.value].count}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                    <div className="overflow-auto max-h-[32rem] rounded-xl border border-line shadow-sm">
                        <table className="w-full min-w-[60rem] border-collapse text-sm">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-primary-dark text-white">
                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center w-12">#</th>
                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">ห้อง</th>
                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-left">ผู้เช่า</th>
                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">เดือน</th>
                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-right">ค่าเช่า</th>
                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-right">ค่าน้ำ</th>
                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-right">ค่าไฟ</th>
                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-right">ส่วนกลาง</th>
                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-right">ยอดรวม</th>
                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">สถานะ</th>
                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((i, index) => {
                                    const c = rowCalc(i)
                                    return (
                                        <tr
                                            key={i.id}
                                            onClick={() => setSelectedId(i.id)}
                                            className={`group cursor-pointer border-b border-line transition-colors hover:bg-mist/30 ${
                                                i.status === 'review' ? 'bg-sky-50/70' : index % 2 ? 'bg-sand/40' : 'bg-white'
                                            }`}
                                        >
                                            <td className="px-3 py-3 border-x border-line/60 text-center text-xs text-muted tabular-nums">{index + 1}</td>
                                            <td className="px-3 py-3 border-x border-line/60 text-center">
                                                <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold">{i.room}</span>
                                            </td>
                                            <td className="px-3 py-3 border-x border-line/60 font-medium text-ink">{i.tenant_name}</td>
                                            <td className="px-3 py-3 border-x border-line/60 text-center text-muted whitespace-nowrap">{formatMonth(i.month)}</td>
                                            <td className="px-3 py-3 border-x border-line/60 text-right tabular-nums">{baht(i.rent)}</td>
                                            <td className="px-3 py-3 border-x border-line/60 text-right tabular-nums" title={`${c.waterUnits} หน่วย`}>{baht(c.water)}</td>
                                            <td className="px-3 py-3 border-x border-line/60 text-right tabular-nums" title={`${c.elecUnits} หน่วย`}>{baht(c.elec)}</td>
                                            <td className="px-3 py-3 border-x border-line/60 text-right tabular-nums text-muted">{baht(i.common_fee)}</td>
                                            <td className="px-3 py-3 border-x border-line/60 text-right font-semibold text-primary-dark tabular-nums bg-primary/5">{baht(i.total)}</td>
                                            <td className="px-3 py-3 border-x border-line/60 text-center"><StatusBadge status={i.status} /></td>
                                            <td className="border-x border-line/60 px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                <div className="inline-flex rounded-lg border border-line bg-white overflow-hidden divide-x divide-line text-sm">
                                                    <button
                                                        onClick={() => setSelectedId(i.id)}
                                                        className={`px-3 py-1 ${i.status === 'review' ? 'bg-primary text-white hover:bg-primary-dark' : 'text-primary-dark hover:bg-mist/50'}`}
                                                    >
                                                        {i.status === 'review' ? 'ตรวจสอบ' : 'รายละเอียด'}
                                                    </button>
                                                    <button onClick={() => startEdit(i)} aria-label={`แก้ไขใบแจ้งหนี้ห้อง ${i.room}`} className="px-3 py-1 text-ink hover:bg-mist/50">แก้ไข</button>
                                                    <button onClick={() => setDeleting(i)} aria-label={`ลบใบแจ้งหนี้ห้อง ${i.room}`} className="px-3 py-1 text-red-600 hover:bg-red-50">ลบ</button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                            {visible.length > 0 && (
                                <tfoot className="sticky bottom-0">
                                    <tr className="bg-mist/60 text-primary-dark font-semibold">
                                        <td colSpan="4" className="px-3 py-3 border-x border-line/60 text-right">รวม {visible.length} รายการ</td>
                                        <td className="px-3 py-3 border-x border-line/60 text-right tabular-nums">{baht(totals.rent)}</td>
                                        <td className="px-3 py-3 border-x border-line/60 text-right tabular-nums">{baht(totals.water)}</td>
                                        <td className="px-3 py-3 border-x border-line/60 text-right tabular-nums">{baht(totals.elec)}</td>
                                        <td className="px-3 py-3 border-x border-line/60 text-right tabular-nums">{baht(totals.common)}</td>
                                        <td className="px-3 py-3 border-x border-line/60 text-right tabular-nums">{baht(totals.total)}</td>
                                        <td colSpan="2" className="px-3 py-3 border-x border-line/60" />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                        {(loading || loadError || visible.length === 0) && (
                            <div className={`py-10 text-center ${loadError ? 'text-red-600' : 'text-muted'}`}>
                                {loading ? (
                                    'กำลังโหลด...'
                                ) : loadError ? (
                                    loadError
                                ) : (
                                    <>
                                        <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-full bg-sand text-muted"><Icon name="receipt" className="w-6 h-6" /></span>
                                        {search || filter !== 'all' || monthFilter !== 'all' ? 'ไม่พบใบแจ้งหนี้ที่ตรงกับเงื่อนไข' : 'ยังไม่มีใบแจ้งหนี้ เริ่มสร้างใบแรกได้จากฟอร์มด้านบน'}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {deleting && <DeleteModal invoice={deleting} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
        </>
    )
}

export default AdminInvoices
