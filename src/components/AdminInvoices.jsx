import { useCallback, useEffect, useState } from 'react'
import BulkInvoiceForm from './BulkInvoiceForm'
import Icon from './Icon'
import PageHeader from './PageHeader'
import AdminInvoiceDetail from './AdminInvoiceDetail'
import InvoiceDeleteModal from './InvoiceDeleteModal'
import InvoiceEditForm from './InvoiceEditForm'
import InvoiceList from './InvoiceList'
import { PendingRefunds, StatusCards } from './InvoiceStatusCards'
import {
    fetchInvoicesData, filterInvoices, formFromInvoice, invoiceAmounts, invoiceFormValues, invoiceStats, invoiceTotals, makeEmptyForm, validateInvoiceForm,
} from '../lib/adminInvoices'
import { formatMonth, lateFeeSnapshot } from '../lib/billing'
import { useRealtimeReload } from '../lib/realtime'
import { supabase } from '../lib/supabaseClient'
import { useSettings } from '../lib/useSettings'

// หน้าจัดการใบแจ้งหนี้ของแอดมิน: บันทึกมิเตอร์ สร้าง/แก้ไข/ลบใบแจ้งหนี้ และดูรายการทั้งหมด
// หน้านี้ถือข้อมูลและขั้นตอนบันทึก/ลบ ส่วนที่แสดงผลแยกอยู่ใน InvoiceEditForm, InvoiceList, InvoiceStatusCards
// ตรรกะตรวจฟอร์ม คำนวณ และกรองรายการอยู่ใน lib/adminInvoices.js
function AdminInvoices() {
    // ข้อมูลที่โหลด: ผู้เช่า, ห้อง -> ค่าเช่า, ใบแจ้งหนี้, สถานะโหลด และ error
    const [tenants, setTenants] = useState([])
    const [rents, setRents] = useState({})
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const settings = useSettings()
    // ฟอร์มแก้ไขใบแจ้งหนี้ และตัวกรองรายการ (สถานะ คำค้นหา เดือน) และใบที่เปิดดูอยู่
    const [form, setForm] = useState(makeEmptyForm)
    const [formError, setFormError] = useState('')
    const [saving, setSaving] = useState(false)
    const [filter, setFilter] = useState('all')
    const [search, setSearch] = useState('')
    const [monthFilter, setMonthFilter] = useState('all')
    const [selectedId, setSelectedId] = useState(null)
    // id ของใบแจ้งหนี้ที่กำลังแก้ไขในฟอร์มด้านบน (null = ไม่ได้แก้ไข)
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
    const load = useCallback(async () => applyResult(await fetchInvoicesData()), [applyResult])

    // อัปเดตเองเมื่อผู้เช่าส่งสลิป มีการยืนยันรับเงิน หรือข้อมูลห้อง/ผู้เช่าเปลี่ยน
    useRealtimeReload(['invoices', 'invoice_payments', 'tenants', 'rooms'], load)

    // โหลดครั้งแรก: setState เกิดใน callback หลังได้ข้อมูล ไม่ได้เรียกตรง ๆ ใน effect
    useEffect(() => {
        let active = true
        fetchInvoicesData().then((result) => {
            if (active) applyResult(result)
        })
        return () => {
            active = false
        }
    }, [applyResult])

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

    // ค่าที่ใช้แสดงและคำนวณจากฟอร์ม (อัตราที่ยังไม่กำหนดใช้ค่าจากหน้าตั้งค่า, ผู้เช่า, ค่าเช่า, ยอด)
    const values = invoiceFormValues({ form, settings, tenants, invoices, rents, editingId })
    const { tenant, rent, numbers, calc } = values

    // เริ่มแก้ไขใบแจ้งหนี้: เติมข้อมูลเดิมลงในฟอร์ม
    const startEdit = (invoice) => {
        setForm(formFromInvoice(invoice))
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
        const problem = validateInvoiceForm({ form, tenant, numbers, editingId })
        if (problem) {
            setFormError(problem)
            return
        }
        // ค่าที่บันทึกลงใบแจ้งหนี้
        const amounts = invoiceAmounts(numbers, calc.total)
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

    // จำนวนและยอดรวมของแต่ละสถานะ, รายการที่แสดงตามตัวกรอง และยอดรวมท้ายตาราง
    const stats = invoiceStats(invoices)
    const months = [...new Set(invoices.map((i) => i.month))].sort().reverse()
    const visible = filterInvoices(invoices, { filter, monthFilter, search })
    const totals = invoiceTotals(visible)
    // ใบที่ผู้เช่าโอนเกินและยังรอโอนคืน
    const pendingRefunds = invoices.filter((i) => i.refund_status === 'pending')

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

            <div className="px-4 sm:px-6 pb-8 flex flex-col gap-4 sm:gap-6">
                {bulkNotice && (
                    <div role="status" className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 text-emerald-900 text-sm px-4 py-3">{bulkNotice}</div>
                )}

                <PendingRefunds refunds={pendingRefunds} onOpen={setSelectedId} />
                <StatusCards stats={stats} filter={filter} onChange={setFilter} />

                {/* ฟอร์มแก้ไขใบแจ้งหนี้ (แสดงเฉพาะตอนแก้ไขใบที่สร้างไปแล้ว) */}
                {editingId && (
                    <InvoiceEditForm
                        form={form}
                        setForm={setForm}
                        values={values}
                        formError={formError}
                        setFormError={setFormError}
                        saving={saving}
                        tenants={tenants}
                        invoices={invoices}
                        editingId={editingId}
                        onRoomChange={handleRoomChange}
                        onSubmit={handleSubmit}
                        onCancel={cancelEdit}
                    />
                )}

                <InvoiceList
                    visible={visible}
                    months={months}
                    stats={stats}
                    totals={totals}
                    filter={filter}
                    setFilter={setFilter}
                    monthFilter={monthFilter}
                    setMonthFilter={setMonthFilter}
                    search={search}
                    setSearch={setSearch}
                    loading={loading}
                    loadError={loadError}
                    onOpen={setSelectedId}
                    onEdit={startEdit}
                    onDelete={setDeleting}
                />
            </div>

            {/* หน้าต่างยืนยันลบใบแจ้งหนี้ */}
            {deleting && <InvoiceDeleteModal invoice={deleting} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
        </>
    )
}

export default AdminInvoices
