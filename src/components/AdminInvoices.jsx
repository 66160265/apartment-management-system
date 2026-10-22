import { useCallback, useEffect, useState } from 'react'
import BulkInvoiceForm from './BulkInvoiceForm'
import Icon from './Icon'
import PageHeader from './PageHeader'
import MonthPicker from './MonthPicker'
import { InvoiceBreakdown, StatusBadge } from './InvoiceParts'
import { invoiceStatuses } from '../data/billing'
import { baht, calcInvoice, currentMonth, formatMonth, lateFeeSnapshot, paidOf } from '../lib/billing'
import { useRealtimeReload } from '../lib/realtime'
import { supabase } from '../lib/supabaseClient'
import { useSettings } from '../lib/useSettings'
import { inputClass } from './invoiceFormClasses'
import AdminInvoiceDetail from './AdminInvoiceDetail'
import InvoiceDeleteModal from './InvoiceDeleteModal'
import MeterCard from './MeterCard'

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

// การ์ดสรุป/แท็บกรองตามสถานะใบแจ้งหนี้
const summaryCards = [
    { value: 'all', label: 'ทั้งหมด', icon: 'receipt', tone: 'bg-slate-100 text-slate-600' },
    { value: 'pending', label: 'รอชำระ', icon: 'clock', tone: 'bg-amber-50 text-amber-700' },
    { value: 'review', label: 'รอตรวจสอบ', icon: 'review', tone: 'bg-sky-50 text-sky-700' },
    { value: 'paid', label: 'ชำระแล้ว', icon: 'checkCircle', tone: 'bg-emerald-50 text-emerald-700' },
]

// ดึงข้อมูลทั้งหมดที่หน้านี้ใช้ (ไม่แตะ state เพื่อเรียกใช้ได้ทั้งใน effect และหลังบันทึก)
async function fetchData() {
    // ดึงผู้เช่า, ค่าเช่าของแต่ละห้อง และใบแจ้งหนี้ทั้งหมดพร้อมกัน
    const [tenantsRes, roomsRes, invoicesRes] = await Promise.all([
        supabase.from('tenants').select('room, name, user_id'),
        supabase.from('rooms').select('number, rent'),
        supabase.from('invoices').select('*').order('created_at', { ascending: false }),
    ])
    return { tenantsRes, roomsRes, invoicesRes }
}

// หน้าจัดการใบแจ้งหนี้ของแอดมิน: บันทึกมิเตอร์ สร้าง/แก้ไข/ลบใบแจ้งหนี้ และดูรายการทั้งหมด
function AdminInvoices() {
    // ข้อมูลที่โหลด: ผู้เช่า, ห้อง -> ค่าเช่า, ใบแจ้งหนี้, สถานะโหลด และ error
    const [tenants, setTenants] = useState([])
    const [rents, setRents] = useState({})
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const settings = useSettings()
    // ฟอร์มสร้าง/แก้ไขใบแจ้งหนี้ และตัวกรองรายการ (สถานะ คำค้นหา เดือน) และใบที่เปิดดูอยู่
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
    // กรอกมิเตอร์ทั้งเดือน: เปิดตารางกรอกทุกห้อง / ข้อความแจ้งผลหลังสร้างเสร็จ
    const [bulk, setBulk] = useState(false)
    const [bulkNotice, setBulkNotice] = useState('')

    // นำผลการโหลดไปตั้งค่า state: เรียงผู้เช่าตามห้อง และสร้างแผนที่ ห้อง -> ค่าเช่า
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

    // อัปเดตเองเมื่อผู้เช่าส่งสลิป มีการยืนยันรับเงิน หรือข้อมูลห้อง/ผู้เช่าเปลี่ยน
    useRealtimeReload(['invoices', 'invoice_payments', 'tenants', 'rooms'], load)

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

    // สร้างฟังก์ชันจัดการ onChange ของช่องในฟอร์มตาม key และล้างข้อความ error
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
    // ผู้เช่าของห้องที่เลือก และใบแจ้งหนี้ที่กำลังแก้ไข (ถ้ามี)
    const tenant = tenants.find((t) => t.room === form.room)
    const editing = invoices.find((i) => i.id === editingId)
    // ตอนแก้ไขใช้ค่าเช่าที่บันทึกไว้ในใบแจ้งหนี้เดิม
    const rent = editing ? Number(editing.rent) : (rents[form.room] ?? 0)
    // แปลงค่าในฟอร์มเป็นตัวเลข แล้วคำนวณยอด
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

    // เริ่มแก้ไขใบแจ้งหนี้: เติมข้อมูลเดิมลงในฟอร์ม
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

    // ยกเลิกการแก้ไข: ล้างฟอร์ม แต่คงอัตราค่าน้ำ/ไฟ/ส่วนกลางที่กรอกไว้
    const cancelEdit = () => {
        setEditingId(null)
        setForm({ ...makeEmptyForm(), waterRate: form.waterRate, elecRate: form.elecRate, commonFee: form.commonFee })
        setFormError('')
    }

    // บันทึกฟอร์ม: ตรวจข้อมูล คำนวณยอด แล้วสร้างใบแจ้งหนี้ใหม่หรืออัปเดตใบเดิม
    const handleSubmit = async (e) => {
        e.preventDefault()
        // ตรวจ: เลือกห้องและกรอกมิเตอร์ครบ, มิเตอร์ไม่ถอยหลัง, อัตราไม่ติดลบ, ห้องมีบัญชีผู้เช่า (ไม่งั้นผู้เช่าเห็นใบนี้ไม่ได้)
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
        // ค่าที่บันทึกลงใบแจ้งหนี้
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
                // ค่าปรับล่าช้า: จำค่าตั้งค่า ณ วันออกใบไว้ในใบ (ไม่คิดค่าปรับ = ไม่มีฟิลด์เพิ่ม)
                ...lateFeeSnapshot(settings, form.month),
            })
        setSaving(false)
        // บันทึกไม่สำเร็จ: error 23505 = ห้องนี้มีใบแจ้งหนี้เดือนนั้นแล้ว
        if (error) {
            setFormError(error.code === '23505'
                ? `ห้อง ${tenant.room} มีใบแจ้งหนี้เดือน ${formatMonth(form.month)} แล้ว`
                : `สร้างใบแจ้งหนี้ไม่สำเร็จ: ${error.message}`)
            return
        }
        // สำเร็จ: โหลดใหม่ แล้วล้างฟอร์ม (คงเดือนและอัตราที่ใช้ไว้ เพื่อกรอกห้องถัดไปได้เร็ว)
        await load()
        setEditingId(null)
        setForm({ ...makeEmptyForm(), month: form.month, waterRate: form.waterRate, elecRate: form.elecRate, commonFee: form.commonFee })
    }

    // ลบใบแจ้งหนี้พร้อมรูปสลิป (ถ้าลบรูปไม่สำเร็จก็ยังลบใบแจ้งหนี้ได้ เหลือแค่ไฟล์ค้าง)
    const handleDelete = async (invoice) => {
        // สลิปทุกใบของบิลนี้ (ใบที่ยืนยันแล้วอยู่ในประวัติการรับชำระ ใบล่าสุดอาจอยู่ที่ slip_path ด้วย)
        const { data: payments } = await supabase.from('invoice_payments').select('slip_path').eq('invoice_id', invoice.id)
        const paths = new Set([invoice.slip_path, ...(payments ?? []).map((p) => p.slip_path)].filter(Boolean))
        if (paths.size > 0) await supabase.storage.from('slips').remove([...paths])
        const { error } = await supabase.from('invoices').delete().eq('id', invoice.id)
        if (error) return `ลบไม่สำเร็จ: ${error.message}`
        if (editingId === invoice.id) cancelEdit()
        await load()
        setSelectedId(null)
        setDeleting(null)
    }

    // กรอกมิเตอร์ทั้งเดือน: แสดงตารางกรอกทุกห้องแทนหน้ารายการ
    if (bulk) {
        return (
            <>
                <PageHeader title="สร้างใบแจ้งหนี้" subtitle="กรอกเลขมิเตอร์ปัจจุบันของห้องที่ต้องการ (ห้องเดียวหรือทุกห้องก็ได้) แล้วสร้างใบแจ้งหนี้พร้อมกัน" onBack={() => setBulk(false)} backLabel="กลับไปรายการใบแจ้งหนี้" />
                <BulkInvoiceForm
                    tenants={tenants}
                    rents={rents}
                    invoices={invoices}
                    settings={settings}
                    onDone={async (count) => {
                        await load()
                        setBulk(false)
                        setBulkNotice(`สร้างใบแจ้งหนี้ ${count} ใบเรียบร้อยแล้ว ผู้เช่าได้รับแจ้งเตือนแล้ว`)
                    }}
                />
            </>
        )
    }

    // เลือกใบแจ้งหนี้แล้ว: แสดงหน้ารายละเอียดแทนหน้ารายการ
    const selected = invoices.find((i) => i.id === selectedId)
    if (selected) {
        return (
            <>
                <AdminInvoiceDetail key={selected.id} invoice={selected} onBack={() => setSelectedId(null)} onChanged={load} onEdit={startEdit} onDelete={setDeleting} />
                {deleting && <InvoiceDeleteModal invoice={deleting} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
            </>
        )
    }

    // คำนวณหน่วยและค่าน้ำ/ไฟของใบแจ้งหนี้แต่ละแถวเพื่อแสดงในตาราง
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

    // จำนวนและยอดรวมของแต่ละสถานะ (แสดงบนการ์ดสรุป)
    const stats = Object.fromEntries(
        summaryCards.map((c) => {
            const list = invoices.filter((i) => c.value === 'all' || i.status === c.value)
            return [c.value, { count: list.length, sum: list.reduce((acc, i) => acc + Number(i.total), 0) }]
        })
    )
    // ใบที่ผู้เช่าโอนเกินและยังรอโอนคืน
    const pendingRefunds = invoices.filter((i) => i.refund_status === 'pending')
    // รายการที่แสดง: กรองตามสถานะ เดือน และคำค้นหา (ห้อง/ชื่อ) เรียงเดือนใหม่สุดก่อน แล้วตามเลขห้อง
    const keyword = search.trim().toLowerCase()
    const months = [...new Set(invoices.map((i) => i.month))].sort().reverse()
    const visible = invoices
        .filter((i) => filter === 'all' || i.status === filter)
        .filter((i) => monthFilter === 'all' || i.month === monthFilter)
        .filter((i) => !keyword || i.room.includes(keyword) || i.tenant_name.toLowerCase().includes(keyword))
        .sort((a, b) => b.month.localeCompare(a.month) || a.room.localeCompare(b.room, undefined, { numeric: true }))

    // ยอดรวมของรายการที่แสดง (แถวรวมท้ายตาราง)
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
            <PageHeader
                title="ใบแจ้งหนี้ & ชำระเงิน"
                subtitle="สร้างใบแจ้งหนี้ ตรวจสอบสลิปการโอนเงิน และติดตามการชำระของผู้เช่า"
                actions={
                    <button onClick={() => { setBulk(true); setBulkNotice('') }} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-sm font-medium shadow-card flex items-center gap-1.5">
                        <Icon name="plus" className="w-4 h-4" />
                        สร้างใบแจ้งหนี้
                    </button>
                }
            />

            <div className="px-4 sm:px-6 pb-8 flex flex-col gap-6">
                {bulkNotice && (
                    <div role="status" className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 text-emerald-900 text-sm px-4 py-3">{bulkNotice}</div>
                )}

                {/* ผู้เช่าโอนเกินและยังไม่ได้โอนคืน: แสดงรายการให้แอดมินกดเข้าไปบันทึกเมื่อโอนคืนแล้ว */}
                {pendingRefunds.length > 0 && (
                    <div className="rounded-2xl bg-sky-50 ring-1 ring-sky-200 text-sky-900 p-4 flex flex-col gap-2">
                        <div className="font-medium">
                            รอโอนคืนผู้เช่า {pendingRefunds.length} รายการ รวม {baht(pendingRefunds.reduce((sum, i) => sum + Number(i.refund_amount), 0))}
                        </div>
                        <ul className="flex flex-col gap-1.5">
                            {pendingRefunds.map((i) => (
                                <li key={i.id}>
                                    <button type="button" onClick={() => setSelectedId(i.id)} className="w-full flex items-center justify-between gap-3 text-left text-sm bg-white/70 hover:bg-white rounded-xl px-3 py-2">
                                        <span>ห้อง {i.room} · {i.tenant_name} · {formatMonth(i.month)}</span>
                                        <span className="font-semibold tabular-nums">{baht(i.refund_amount)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* การ์ดสรุปตามสถานะ (กดเพื่อกรอง) การ์ดรอตรวจสอบมีป้ายเตือนเมื่อมีสลิปรอ */}
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

                {/* ฟอร์มสร้าง/แก้ไขใบแจ้งหนี้: ซ้าย = กรอกข้อมูล, ขวา = สรุปยอด */}
                {/* สร้างใบแจ้งหนี้ใช้ปุ่ม "สร้างใบแจ้งหนี้" (ตารางกรอกมิเตอร์ กรอกห้องเดียวหรือหลายห้องก็ได้) ฟอร์มนี้จึงแสดงเฉพาะตอนแก้ไขใบที่สร้างไปแล้ว */}
                {editingId && (
                <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
                    <div className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
                        {/* หัวฟอร์ม + เลือกเดือน (เดือนที่ห้องนี้มีใบแล้วมีจุด; ตอนแก้ไขเปลี่ยนเดือนไม่ได้) */}
                        <div className="flex flex-wrap justify-between items-center gap-3">
                            <h2 className="font-medium text-primary-dark">
                                แก้ไขใบแจ้งหนี้ ห้อง {form.room}
                            </h2>
                            <MonthPicker
                                value={form.month}
                                onChange={(month) => { setForm({ ...form, month }); setFormError('') }}
                                marked={invoices.filter((i) => i.room === form.room && i.id !== editingId).map((i) => i.month)}
                                disabled={!!editingId}
                            />
                        </div>
                        {/* เลือกห้อง (เลือกแล้วดึงเลขมิเตอร์ครั้งก่อนมาให้อัตโนมัติ) */}
                        <label className="text-sm text-muted">
                            ห้องพัก
                            <select className={inputClass} value={form.room} onChange={handleRoomChange} disabled={!!editingId}>
                                <option value="">เลือกห้อง...</option>
                                {tenants.map((t) => (
                                    <option key={t.room} value={t.room}>{t.room} - {t.name}</option>
                                ))}
                            </select>
                        </label>
                        {/* การ์ดมิเตอร์น้ำ และมิเตอร์ไฟ */}
                        <div className="grid sm:grid-cols-2 gap-4">
                            <MeterCard icon="droplet" tone="bg-cyan-50 text-cyan-700" title="มิเตอร์น้ำ" prefix="water" form={view} set={set} units={calc.waterUnits} cost={calc.water} />
                            <MeterCard icon="bolt" tone="bg-amber-50 text-amber-700" title="มิเตอร์ไฟ" prefix="elec" form={view} set={set} units={calc.elecUnits} cost={calc.elec} />
                        </div>
                        {/* ค่าส่วนกลาง */}
                        <label className="text-sm text-muted sm:w-1/2">
                            ค่าส่วนกลาง (฿)
                            <input type="number" min="0" step="any" className={inputClass} value={view.commonFee} onChange={set('commonFee')} />
                        </label>
                    </div>

                    {/* สรุปยอดแบบสด (ติดหน้าจอบนจอใหญ่) */}
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
                        {/* เตือนเมื่อแก้ใบที่ส่งสลิปหรือจ่ายแล้ว */}
                        {editing && editing.status !== 'pending' && (
                            <p className="text-sm text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-xl px-4 py-2">
                                {paidOf(editing) > 0
                                    ? `ใบแจ้งหนี้นี้ได้รับชำระแล้ว ${baht(paidOf(editing))} แก้ไขยอดรวมไม่ได้ (แก้ได้เฉพาะรายการที่ไม่ทำให้ยอดรวมเปลี่ยน)`
                                    : `ใบแจ้งหนี้นี้${editing.status === 'review' ? 'มีสลิปรอตรวจสอบ' : 'ชำระแล้ว'} หากเปลี่ยนยอดรวม ยอดอาจไม่ตรงกับสลิปที่ผู้เช่าโอนมา`}
                            </p>
                        )}
                        {/* ข้อความ error และปุ่มยกเลิก/สร้าง/บันทึก */}
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
                )}

                <div className="bg-white rounded-2xl shadow-card p-5">
                    {/* หัวกล่องรายการ: จำนวน + ตัวกรองเดือน + ช่องค้นหา */}
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
                        <div className="flex items-center gap-2 border border-line bg-sand/50 rounded-xl px-3 py-1.5 w-64 max-w-full focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/15 focus-within:bg-white">
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
                    {/* แท็บสถานะพร้อมจำนวน */}
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
                    <div className="xl:overflow-auto xl:max-h-[32rem] xl:rounded-xl xl:border xl:border-line xl:shadow-sm">
                        {/* จอใหญ่: ตารางใบแจ้งหนี้ (ใบที่รอตรวจพื้นสีฟ้า) กดแถวเพื่อดูรายละเอียด */}
                        <table className="hidden xl:table w-full min-w-[60rem] border-collapse text-sm">
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
                            {/* แถวรวมท้ายตาราง */}
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
                        {/* จอเล็ก/กลาง: ยอดรวม + การ์ดใบแจ้งหนี้ */}
                        {visible.length > 0 && (
                            <div className="xl:hidden flex items-center justify-between rounded-xl bg-mist/50 px-4 py-2.5 mb-3 text-sm font-semibold text-primary-dark">
                                <span>รวม {visible.length} รายการ</span>
                                <span className="tabular-nums">{baht(totals.total)}</span>
                            </div>
                        )}
                        <div className="xl:hidden grid gap-3 md:grid-cols-2">
                            {visible.map((i) => {
                                const c = rowCalc(i)
                                return (
                                    <div
                                        key={i.id}
                                        className={`rounded-2xl border border-line p-4 flex flex-col gap-3 ${i.status === 'review' ? 'bg-sky-50/60' : 'bg-white'}`}
                                    >
                                        <button type="button" onClick={() => setSelectedId(i.id)} className="text-left flex items-start gap-3">
                                            <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold text-center">{i.room}</span>
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium text-ink truncate">{i.tenant_name}</div>
                                                <div className="text-xs text-muted">{formatMonth(i.month)}</div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1.5">
                                                <div className="font-semibold text-primary-dark tabular-nums">{baht(i.total)}</div>
                                                <StatusBadge status={i.status} />
                                            </div>
                                        </button>
                                        <div className="text-xs text-muted tabular-nums">
                                            ค่าเช่า {baht(i.rent)} · น้ำ {baht(c.water)} · ไฟ {baht(c.elec)}{Number(i.common_fee) > 0 ? ` · ส่วนกลาง ${baht(i.common_fee)}` : ''}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setSelectedId(i.id)}
                                                className={`flex-1 py-2 rounded-xl text-sm ${i.status === 'review' ? 'bg-primary text-white hover:bg-primary-dark' : 'bg-mist/60 text-primary-dark hover:bg-mist'}`}
                                            >
                                                {i.status === 'review' ? 'ตรวจสอบสลิป' : 'รายละเอียด'}
                                            </button>
                                            <button onClick={() => startEdit(i)} className="px-4 py-2 rounded-xl text-sm border border-line text-primary-dark hover:bg-mist/40">แก้ไข</button>
                                            <button onClick={() => setDeleting(i)} className="px-4 py-2 rounded-xl text-sm border border-red-200 text-red-600 hover:bg-red-50">ลบ</button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        {/* ข้อความกำลังโหลด / error / ไม่พบรายการ */}
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

            {/* หน้าต่างยืนยันลบใบแจ้งหนี้ */}
            {deleting && <InvoiceDeleteModal invoice={deleting} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
        </>
    )
}

export default AdminInvoices
