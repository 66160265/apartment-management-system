import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Icon from '../components/Icon'
import { RepairCostBanner, TenantRepairPayment } from '../components/RepairPayment'
import { useRepairCosts } from '../lib/useRepairCosts'
import { AppointmentBox, ConfirmDialog, RepairImage, RepairImagePicker, RepairStatusBadge, SlotList, SlotPicker, UrgencyBadge } from '../components/RepairParts'
import { repairCategories, repairProgressKeys, repairStatuses, repairStatusKeys } from '../data/repairs'
import { baht, formatDateTime } from '../lib/billing'
import { formatSlot, formatThaiDate, removeRepairImage, upcomingSlots, uploadRepairImage, validateAvailability } from '../lib/repairs'
import { supabase } from '../lib/supabaseClient'
import { useCurrentUser } from '../lib/useCurrentUser'

// คลาส Tailwind ของช่องกรอก และค่าเริ่มต้นของฟอร์มแจ้งซ่อมใหม่
const inputClass = 'w-full border border-line rounded-xl px-4 py-2 text-ink text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30 bg-white disabled:bg-sand/60'
const emptyForm = {
    problem: '',
    detail: '',
    category: 'other',
    allow_entry: false,
    slots: [],
}

// รายการที่ผู้เช่าต้องทำอะไรต่อ: ยืนยันวันนัดที่ผู้ดูแลเสนอ หรือยืนยันผลการซ่อม
const needsAction = (r) => (r.status === 'scheduled' && r.appointment_state === 'proposed') || (r.status === 'done' && !r.tenant_confirmed_at)

// ข้อมูลตั้งต้นก่อนโหลดเสร็จ
const initialData = { repairs: [], loading: true, loadError: '' }

// ดึงรายการแจ้งซ่อมของผู้ใช้ (RLS ให้อ่านได้เฉพาะรายการของตัวเองอยู่แล้ว)
async function fetchRepairs(userId) {
    const { data, error } = await supabase.from('repairs').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) return { ...initialData, loading: false, loadError: `โหลดข้อมูลไม่สำเร็จ: ${error.message}` }
    return { repairs: data, loading: false, loadError: '' }
}

// แถบความคืบหน้า 4 ขั้น: รอนัดหมาย -> นัดหมายแล้ว -> กำลังซ่อม -> เสร็จสิ้น
function Progress({ status }) {
    // ลำดับของสถานะปัจจุบัน (0 = รอนัด, 1 = นัดแล้ว, 2 = กำลังซ่อม, 3 = เสร็จ)
    const current = repairProgressKeys.indexOf(status)
    return (
        <ol className="grid grid-cols-4">
            {repairProgressKeys.map((k, i) => {
                // ขั้นที่ผ่านแล้ว (มีเครื่องหมายถูก), ขั้นปัจจุบัน (วงกลมเน้น), และขั้นที่ไปถึงแล้ว (เส้นเชื่อมเป็นสี)
                const isDone = i < current || status === 'done'
                const isCurrent = i === current && status !== 'done'
                const reached = i <= current
                return (
                    <li key={k} className="relative flex flex-col items-center gap-1.5">
                        {i > 0 && <span className={`absolute top-2.5 right-1/2 w-full h-0.5 -translate-y-1/2 ${reached ? 'bg-primary' : 'bg-line'}`} />}
                        <span
                            className={`relative z-10 grid place-items-center w-5 h-5 rounded-full ${
                                isDone
                                    ? 'bg-primary text-white'
                                    : isCurrent
                                      ? 'bg-white border-[5px] border-primary ring-4 ring-primary/15'
                                      : 'bg-white border-2 border-line'
                            }`}
                        >
                            {isDone && <Icon name="check" className="w-3 h-3" />}
                        </span>
                        <span className={`text-xs ${isCurrent ? 'text-primary-dark font-semibold' : reached ? 'text-primary-dark' : 'text-muted/60'}`}>
                            {repairStatuses[k].label}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}

// หน้าแจ้งซ่อมของผู้เช่า: ดู/ค้นหารายการของตัวเอง แจ้งซ่อมใหม่ แก้ไข และยกเลิกรายการที่ยังรอดำเนินการ
function UserRepairsPage() {
    // ผู้ใช้ที่ login และห้องของผู้เช่า
    const me = useCurrentUser()
    const userId = me?.id
    const room = me?.tenant?.room

    // ข้อมูลที่โหลด, แท็บสถานะ, ข้อความแจ้งผล และคำค้นหา
    const [data, setData] = useState(initialData)
    const { repairs, loading, loadError } = data
    const [activeTab, setActiveTab] = useState('all')
    const [notice, setNotice] = useState('')
    // กรองตามประเภทงาน และเรียงจากเก่าสุดไปใหม่สุดไหม
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [oldestFirst, setOldestFirst] = useState(false)
    // เรื่องที่มีค่าซ่อมค้างชำระ (ทำป้าย "ค้างชำระ" ในรายการ)
    const unpaidIds = new Set(useRepairCosts().map((r) => r.id))

    // editing: null = หน้ารายการ, 'new' = แจ้งซ่อมใหม่, ออบเจ็กต์ = แก้ไขรายการนั้น
    const [editing, setEditing] = useState(null)
    // ค่าในฟอร์ม, รูปใหม่, กดนำรูปเดิมออก, กำลังบันทึก, error ของฟอร์ม และรายการที่กำลังจะยกเลิก
    const [form, setForm] = useState(emptyForm)
    const [file, setFile] = useState(null)
    const [removeExisting, setRemoveExisting] = useState(false)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState('')
    const [cancelTarget, setCancelTarget] = useState(null)
    // การตอบกลับของผู้เช่าในหน้ารายละเอียด: null | 'reschedule' (ขอเปลี่ยนเวลา) | 'notFixed' (แจ้งว่ายังไม่หาย)
    const [action, setAction] = useState(null)
    const [actionForm, setActionForm] = useState({ slots: [], allow_entry: false, note: '' })

    // โหลดซ้ำหลังแจ้ง/แก้ไข/ยกเลิก
    const load = async () => setData(await fetchRepairs(userId))

    // โหลดครั้งแรก: setState เกิดใน callback หลังได้ข้อมูล ไม่ได้เรียกตรง ๆ ใน effect
    useEffect(() => {
        if (!userId) return
        let active = true
        fetchRepairs(userId).then((result) => {
            if (active) setData(result)
        })
        return () => {
            active = false
        }
    }, [userId])

    // ข้อความแจ้งผลหายไปเองหลัง 4 วินาที
    useEffect(() => {
        if (!notice) return
        const t = setTimeout(() => setNotice(''), 4000)
        return () => clearTimeout(t)
    }, [notice])

    // รอข้อมูลผู้ใช้ก่อน
    if (!me) return <p className="p-6 text-muted">กำลังโหลด...</p>

    // เปิดฟอร์มแจ้งซ่อมใหม่
    const openNew = () => {
        setForm(emptyForm)
        setFile(null)
        setRemoveExisting(false)
        setFormError('')
        setEditing('new')
    }

    // เปิดฟอร์มแก้ไขรายการแจ้งซ่อม โดยเติมข้อมูลเดิมลงในฟอร์ม
    const openEdit = (repair) => {
        setForm({
            problem: repair.problem,
            detail: repair.detail,
            category: repair.category ?? 'other',
            allow_entry: repair.allow_entry ?? false,
            slots: upcomingSlots(repair.available_slots),
        })
        setAction(null)
        setFile(null)
        setRemoveExisting(false)
        setFormError('')
        setEditing(repair)
    }

    // ปิดฟอร์ม (ปิดไม่ได้ระหว่างกำลังบันทึก)
    const closeForm = () => {
        if (saving) return
        setEditing(null)
        setAction(null)
    }

    // สร้างฟังก์ชันจัดการ onChange ของช่องในฟอร์มตาม key
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

    // บันทึกการแจ้งซ่อม: ตรวจข้อมูล อัปโหลด/ลบรูป แล้วเพิ่มหรืออัปเดตรายการ
    const handleSubmit = async (e) => {
        e.preventDefault()
        if (saving) return
        // ตรวจว่ากรอกปัญหาแล้ว
        const isNew = editing === 'new'
        const problem = form.problem.trim()
        if (!problem) return setFormError('กรุณาระบุปัญหาที่พบ')
        // ต้องบอกว่าช่างเข้าได้เมื่อไร (ยกเว้นอนุญาตให้เข้าห้องได้แม้ไม่อยู่)
        const slotError = validateAvailability({ slots: form.slots, allowEntry: form.allow_entry, urgency: 'normal' })
        if (slotError) return setFormError(slotError)

        setSaving(true)
        setFormError('')

        // มีรูปใหม่ให้อัปโหลดเข้าโฟลเดอร์ของผู้เช่าก่อน แล้วสรุปว่าจะใช้รูปไหน (ใหม่ / เดิม / ไม่มีรูป)
        const oldPath = isNew ? null : editing.image_path
        let newPath = null
        if (file) {
            const res = await uploadRepairImage(file, me.id)
            if (res.error) {
                setSaving(false)
                return setFormError(res.error)
            }
            newPath = res.path
        }
        const image_path = newPath ?? (removeExisting ? null : oldPath)
        const fields = {
            problem,
            detail: form.detail.trim(),
            image_path,
            category: form.category,
            allow_entry: form.allow_entry,
            available_slots: form.slots,
        }

        // บันทึก: รายการใหม่ใช้ insert (ผูกห้องและผู้เช่า) รายการเดิมใช้ update
        let error
        if (isNew) {
            const res = await supabase.from('repairs').insert({ ...fields, room, user_id: me.id })
            error = res.error
        } else {
            // ถ้าผู้ดูแลรับเรื่องไปแล้ว policy จะไม่ให้แก้ไข -> ไม่มีแถวที่ถูกอัปเดต
            const res = await supabase.from('repairs').update(fields).eq('id', editing.id).select('id')
            error = res.error || (res.data.length === 0 ? { message: 'ผู้ดูแลรับเรื่องนี้แล้ว จึงแก้ไขไม่ได้' } : null)
        }

        // บันทึกไม่สำเร็จ: ลบรูปที่เพิ่งอัปโหลดทิ้ง / สำเร็จ: ลบรูปเดิมที่ถูกแทนที่
        if (error) {
            if (newPath) await removeRepairImage(newPath)
            setSaving(false)
            setFormError(`บันทึกไม่สำเร็จ: ${error.message}`)
            return
        }
        if (oldPath && oldPath !== image_path) await removeRepairImage(oldPath)

        // โหลดใหม่ ปิดฟอร์ม และแสดงข้อความแจ้งผล
        await load()
        setSaving(false)
        setEditing(null)
        setNotice(isNew ? 'ส่งเรื่องแจ้งซ่อมเรียบร้อยแล้ว' : 'บันทึกการแก้ไขเรียบร้อยแล้ว')
    }

    // ยกเลิก (ลบ) รายการแจ้งซ่อม ถ้าผู้ดูแลรับเรื่องไปแล้วจะยกเลิกไม่ได้
    const handleCancel = async () => {
        setSaving(true)
        const { data, error } = await supabase.from('repairs').delete().eq('id', cancelTarget.id).select('id')
        // ลบไม่ได้ (error หรือไม่มีแถวถูกลบเพราะแอดมินรับเรื่องแล้ว) แจ้งเหตุผล / ลบได้ ลบรูปตามไปด้วย
        if (error || data.length === 0) {
            setNotice(error ? `ยกเลิกไม่สำเร็จ: ${error.message}` : 'ผู้ดูแลรับเรื่องนี้แล้ว จึงยกเลิกไม่ได้')
        } else {
            await removeRepairImage(cancelTarget.image_path)
            setNotice('ยกเลิกการแจ้งซ่อมแล้ว')
        }
        await load()
        setSaving(false)
        setCancelTarget(null)
        setEditing(null)
    }

    // เรียกฟังก์ชันในฐานข้อมูลสำหรับการตอบกลับของผู้เช่า แล้วโหลดใหม่และปิดหน้ารายละเอียด
    const runAction = async (fn, params, successText) => {
        setSaving(true)
        setFormError('')
        const { error } = await supabase.rpc(fn, params)
        if (error) {
            setSaving(false)
            return setFormError(error.message)
        }
        await load()
        setSaving(false)
        setAction(null)
        setEditing(null)
        setNotice(successText)
    }

    // ยืนยันวันนัดที่ผู้ดูแลเสนอ
    const acceptAppointment = () => runAction('repair_accept_appointment', { p_id: editing.id }, 'ยืนยันวันนัดเรียบร้อยแล้ว')

    // เปิดกล่องขอเปลี่ยนเวลา / แจ้งว่ายังไม่หาย
    const openAction = (type) => {
        setActionForm({ slots: upcomingSlots(editing.available_slots), allow_entry: editing.allow_entry, note: '' })
        setFormError('')
        setAction(type)
    }

    // ส่งช่วงเวลาใหม่ที่สะดวก (รายการจะกลับไปรอผู้ดูแลนัดใหม่)
    const submitReschedule = () => {
        const err = validateAvailability({ slots: actionForm.slots, allowEntry: actionForm.allow_entry, urgency: 'normal' })
        if (err) return setFormError(err)
        runAction(
            'repair_request_new_time',
            { p_id: editing.id, p_slots: actionForm.slots, p_note: actionForm.note.trim(), p_allow_entry: actionForm.allow_entry },
            'ส่งคำขอเปลี่ยนเวลาแล้ว ผู้ดูแลจะนัดวันใหม่ให้',
        )
    }

    // ตรวจงานหลังซ่อม: เรียบร้อย / ยังไม่หาย (ต้องบอกเหตุผล)
    const confirmFixed = () => runAction('repair_confirm_done', { p_id: editing.id, p_fixed: true, p_note: '' }, 'ขอบคุณที่ยืนยัน งานซ่อมนี้ปิดเรียบร้อยแล้ว')
    const submitNotFixed = () => {
        if (!actionForm.note.trim()) return setFormError('กรุณาอธิบายว่ายังมีปัญหาอะไร')
        runAction('repair_confirm_done', { p_id: editing.id, p_fixed: false, p_note: actionForm.note.trim() }, 'แจ้งผู้ดูแลแล้ว ผู้ดูแลจะนัดเข้าซ่อมอีกครั้ง')
    }

    const isNew = editing === 'new'
    // รายการที่ผู้ดูแลรับเรื่องแล้วจะแก้ไขไม่ได้ แสดงเป็นหน้าดูรายละเอียดอย่างเดียว
    const readOnly = !isNew && editing?.status !== 'pending'
    const existingPath = editing && !isNew && !removeExisting ? editing.image_path : null
    // จำนวนรายการที่ยังไม่เสร็จ และรายการแท็บ (ทั้งหมด + ทุกสถานะ)
    const active = repairs.filter((r) => r.status !== 'done' && r.status !== 'cancelled').length
    const actionCount = repairs.filter(needsAction).length
    const tabs = [{ key: 'all', label: 'ทั้งหมด' }, ...repairStatusKeys.map((k) => ({ key: k, label: repairStatuses[k].label }))]
    // นับจำนวนรายการตามแท็บสถานะ ('all' = ทั้งหมด)
    const countOf = (key) => (key === 'all' ? repairs.length : repairs.filter((r) => r.status === key).length)
    // กรองตามแท็บสถานะและประเภท แล้วเรียงตามวันที่แจ้ง (ใหม่สุดก่อน หรือเก่าสุดก่อน)
    const visible = repairs
        .filter((r) => (activeTab === 'all' || r.status === activeTab) && (categoryFilter === 'all' || (r.category ?? 'other') === categoryFilter))
        .sort((a, b) => (oldestFirst ? 1 : -1) * a.created_at.localeCompare(b.created_at))

    return (
        <>
            {/* หัวหน้า + ปุ่มแจ้งซ่อมใหม่ (แสดงเฉพาะหน้ารายการ และบัญชีที่มีห้อง) */}
            <PageHeader title="แจ้งซ่อม" subtitle="แจ้งปัญหาในห้องพักและติดตามสถานะการซ่อม" actions={
                    <>
                        {!editing && room && (
                        <button onClick={openNew} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-sm font-medium shadow-card flex items-center gap-1.5">
                            <Icon name="plus" className="w-4 h-4" />
                            แจ้งซ่อมใหม่
                        </button>
                    )}
                    </>
                } />

            <div className="px-4 sm:px-6 pb-8 flex flex-col gap-5">
                {/* ข้อความแจ้งผล (หายเองใน 4 วินาที) */}
                {notice && (
                    <div role="status" className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 text-emerald-900 text-sm px-4 py-3">
                        {notice}
                    </div>
                )}

                {/* ค่าซ่อมที่ยังไม่ได้ชำระ (กดรายการเพื่อเปิดเรื่องนั้น) */}
                {!editing && room && (
                    <RepairCostBanner onOpen={(id) => { const r = repairs.find((x) => x.id === id); if (r) openEdit(r) }} />
                )}

                {/* ไม่มีห้อง: แจ้งให้ติดต่อผู้ดูแล / กำลังเปิดฟอร์ม: ฟอร์มแจ้งซ่อม / ไม่งั้น: หน้ารายการ */}
                {!room ? (
                    <p className="text-center py-10 text-muted">บัญชีนี้ยังไม่ได้ผูกกับห้องพัก จึงยังไม่สามารถแจ้งซ่อมได้ กรุณาติดต่อผู้ดูแล</p>
                ) : editing ? (
                    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-card p-5 sm:p-6 md:p-8 max-w-2xl w-full mx-auto border border-line flex flex-col gap-5">
                        {/* ===== ฟอร์มแจ้งซ่อม: ปุ่มกลับ หัวข้อ (ใหม่/แก้ไข/ดูอย่างเดียว) และป้ายสถานะ ===== */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <button type="button" onClick={closeForm} disabled={saving} aria-label="กลับ" className="text-muted hover:text-primary-dark">
                                <Icon name="arrowLeft" />
                            </button>
                            <h2 className="text-lg font-semibold text-primary-dark">{isNew ? 'แจ้งซ่อมใหม่' : readOnly ? 'รายละเอียดการแจ้งซ่อม' : 'แก้ไขเรื่องแจ้งซ่อม'}</h2>
                            {!isNew && <div className="ml-auto"><RepairStatusBadge status={editing.status} /></div>}
                        </div>

                        {/* รายการเดิม: แถบความคืบหน้าและวันที่แจ้ง */}
                        {!isNew && (
                            <div className="rounded-xl bg-sand/60 border border-line px-4 py-4">
                                {editing.status === 'cancelled' ? (
                                    <p className="text-center text-sm font-medium text-slate-600">ผู้ดูแลยกเลิกเรื่องนี้</p>
                                ) : (
                                    <Progress status={editing.status} />
                                )}
                                <p className="text-xs text-muted text-center mt-3">
                                    แจ้งเมื่อ {formatDateTime(editing.created_at)}
                                    {editing.reopen_count > 0 && ` · แจ้งซ้ำ ${editing.reopen_count} ครั้ง`}
                                </p>
                            </div>
                        )}

                        {/* วันนัดเข้าซ่อม: ผู้ดูแลเสนอมา = ยืนยัน/ขอเปลี่ยนเวลาได้, ยืนยันนัดแล้ว = เปลี่ยนเวลาไม่ได้ */}
                        {!isNew && editing.status === 'scheduled' && (
                            <AppointmentBox repair={editing}>
                                <p className="mt-2 flex items-start gap-1.5 text-sm text-violet-900">
                                    <Icon name="phone" className="w-4 h-4 mt-0.5 shrink-0" />
                                    ช่างจะโทรไปคอนเฟิร์มกับคุณอีกครั้งก่อนถึงเวลานัด 30 นาที
                                </p>
                                {editing.appointment_state === 'proposed' && action !== 'reschedule' && (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        <button type="button" onClick={acceptAppointment} disabled={saving} className="bg-primary hover:bg-primary-dark text-white rounded-xl px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
                                            <Icon name="check" className="w-4 h-4" />
                                            สะดวก ยืนยันนัดนี้
                                        </button>
                                        <button type="button" onClick={() => openAction('reschedule')} disabled={saving} className="border border-line bg-white hover:bg-sand rounded-xl px-4 py-2 text-sm font-semibold text-primary-dark">
                                            ไม่สะดวก ขอเปลี่ยนเวลา
                                        </button>
                                    </div>
                                )}
                            </AppointmentBox>
                        )}

                        {/* กล่องขอเปลี่ยนเวลา: เลือกช่วงที่สะดวกใหม่ + เหตุผล */}
                        {action === 'reschedule' && (
                            <div className="rounded-xl border border-line p-4 flex flex-col gap-3">
                                <div className="font-medium text-primary-dark">เลือกช่วงเวลาที่สะดวกใหม่</div>
                                <SlotPicker slots={actionForm.slots} onChange={(slots) => setActionForm((f) => ({ ...f, slots }))} disabled={saving} />
                                <label className="flex items-center gap-2 text-sm text-ink">
                                    <input type="checkbox" checked={actionForm.allow_entry} onChange={(e) => setActionForm((f) => ({ ...f, allow_entry: e.target.checked }))} disabled={saving} />
                                    อนุญาตให้ช่างเข้าห้องได้แม้ฉันไม่อยู่
                                </label>
                                <textarea rows={2} maxLength={500} value={actionForm.note} onChange={(e) => setActionForm((f) => ({ ...f, note: e.target.value }))} disabled={saving} placeholder="เหตุผล เช่น ติดธุระต่างจังหวัด" className={inputClass} />
                                <div className="flex justify-end gap-2">
                                    <button type="button" onClick={() => setAction(null)} disabled={saving} className="border border-line text-muted hover:bg-sand rounded-xl px-4 py-2 text-sm">ยกเลิก</button>
                                    <button type="button" onClick={submitReschedule} disabled={saving} className="bg-primary hover:bg-primary-dark text-white rounded-xl px-4 py-2 text-sm font-semibold">
                                        {saving ? 'กำลังส่ง...' : 'ส่งคำขอเปลี่ยนเวลา'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ซ่อมเสร็จแล้ว: ให้ผู้เช่าตรวจและยืนยัน หรือแจ้งว่ายังไม่หาย */}
                        {!isNew && editing.status === 'done' && !editing.tenant_confirmed_at && (
                            <div className="rounded-xl bg-emerald-50 border-l-4 border-emerald-400 px-4 py-3 flex flex-col gap-3">
                                <div>
                                    <div className="text-sm font-semibold text-emerald-900">ช่างแจ้งว่าซ่อมเสร็จแล้ว</div>
                                    <div className="text-sm text-emerald-900/80">กรุณาตรวจสอบว่าใช้งานได้ปกติหรือไม่</div>
                                </div>
                                {action === 'notFixed' ? (
                                    <>
                                        <textarea rows={2} maxLength={500} value={actionForm.note} onChange={(e) => setActionForm((f) => ({ ...f, note: e.target.value }))} disabled={saving} placeholder="อธิบายว่ายังมีปัญหาอะไร เช่น ก๊อกยังมีน้ำซึม" className={inputClass} />
                                        <div className="flex justify-end gap-2">
                                            <button type="button" onClick={() => setAction(null)} disabled={saving} className="border border-line bg-white text-muted hover:bg-sand rounded-xl px-4 py-2 text-sm">ยกเลิก</button>
                                            <button type="button" onClick={submitNotFixed} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white rounded-xl px-4 py-2 text-sm font-semibold">
                                                {saving ? 'กำลังส่ง...' : 'แจ้งซ่อมอีกครั้ง'}
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" onClick={confirmFixed} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
                                            <Icon name="check" className="w-4 h-4" />
                                            ใช้งานได้ปกติแล้ว
                                        </button>
                                        <button type="button" onClick={() => openAction('notFixed')} disabled={saving} className="border border-red-300 bg-white text-red-600 hover:bg-red-50 rounded-xl px-4 py-2 text-sm font-semibold">
                                            ยังไม่หาย
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ห้อง (อ่านอย่างเดียว) */}
                        <div>
                            <label className="block text-sm text-muted mb-1">ห้อง</label>
                            <input disabled value={room} className={inputClass} />
                        </div>

                        {/* ประเภทงานซ่อม */}
                        <div>
                            <label className="block text-sm text-muted mb-1">ประเภท</label>
                            <select value={form.category} onChange={set('category')} disabled={saving || readOnly} className={inputClass}>
                                {Object.entries(repairCategories).map(([k, label]) => (
                                    <option key={k} value={k}>{label}</option>
                                ))}
                            </select>
                        </div>

                        {/* ปัญหาที่พบ (บังคับกรอก) */}
                        <div>
                            <label className="block text-sm text-muted mb-1">ปัญหาที่พบ <span className="text-red-500">*</span></label>
                            <input required maxLength={200} value={form.problem} onChange={set('problem')} disabled={saving || readOnly} placeholder="เช่น หลอดไฟขาด, ก๊อกน้ำรั่ว" className={inputClass} />
                        </div>

                        {/* รายละเอียดเพิ่มเติม */}
                        <div>
                            <label className="block text-sm text-muted mb-1">รายละเอียดเพิ่มเติม</label>
                            <textarea rows={4} maxLength={2000} value={form.detail} onChange={set('detail')} disabled={saving || readOnly} placeholder="อธิบายอาการและตำแหน่ง เช่น ก๊อกอ่างล้างหน้าในห้องน้ำมีน้ำหยดตลอด" className={inputClass} />
                        </div>

                        {/* วันเวลาที่สะดวกให้ช่างเข้า: แก้ได้เฉพาะตอนยังรอนัดหมาย, ดูอย่างเดียวแสดงเป็นรายการ */}
                        <div className="rounded-xl border border-line p-4 flex flex-col gap-3">
                            <div>
                                <div className="text-sm font-medium text-primary-dark">วันเวลาที่สะดวกให้ช่างเข้าซ่อม</div>
                                {!readOnly && <div className="text-xs text-muted">เลือกได้สูงสุด 3 ช่วงเวลา ผู้ดูแลจะเลือกช่วงใดช่วงหนึ่งเป็นวันนัด</div>}
                            </div>
                            {readOnly ? (
                                <SlotList slots={editing.available_slots} allowEntry={editing.allow_entry} note={editing.availability_note} />
                            ) : (
                                <>
                                    <SlotPicker slots={form.slots} onChange={(slots) => setForm((f) => ({ ...f, slots }))} disabled={saving} />
                                    <label className="flex items-start gap-2 text-sm text-ink">
                                        <input type="checkbox" className="mt-1" checked={form.allow_entry} onChange={(e) => setForm((f) => ({ ...f, allow_entry: e.target.checked }))} disabled={saving} />
                                        <span>
                                            อนุญาตให้ช่างเข้าห้องได้แม้ฉันไม่อยู่
                                            <span className="block text-xs text-muted">ผู้ดูแลจะใช้กุญแจสำรองเปิดห้องและแจ้งให้ทราบทุกครั้ง</span>
                                        </span>
                                    </label>
                                </>
                            )}
                        </div>

                        {/* รูปภาพ: ดูอย่างเดียวแสดงรูปเดิม ไม่งั้นใช้ตัวเลือกรูป */}
                        <div>
                            <label className="block text-sm text-muted mb-1">รูปภาพ (ถ้ามี)</label>
                            {readOnly ? (
                                editing.image_path ? (
                                    <div className="rounded-2xl bg-sand/70 border border-line p-4 flex justify-center">
                                        <RepairImage path={editing.image_path} className="max-h-72" />
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted">ไม่มีรูปภาพ</p>
                                )
                            ) : (
                                <RepairImagePicker
                                file={file}
                                existingPath={existingPath}
                                disabled={saving}
                                onPick={setFile}
                                onClear={() => {
                                    setFile(null)
                                    setRemoveExisting(true)
                                }}
                            />
                            )}
                        </div>

                        {/* ข้อความจากผู้ดูแล */}
                        {!isNew && editing.admin_note && (
                            <div className="rounded-xl bg-mist/40 border-l-4 border-primary px-4 py-3">
                                <div className="text-xs font-semibold text-primary-dark mb-0.5">ข้อความจากผู้ดูแล</div>
                                <p className="text-sm text-ink whitespace-pre-line wrap-break-word">{editing.admin_note}</p>
                            </div>
                        )}

                        {/* ข้อความล่าสุดของผู้เช่า (เหตุผลขอเปลี่ยนเวลา / ยังไม่หาย) */}
                        {!isNew && editing.tenant_message && (
                            <div className="rounded-xl bg-sand/60 border-l-4 border-secondary px-4 py-3">
                                <div className="text-xs font-semibold text-primary-dark mb-0.5">ข้อความล่าสุดของคุณ</div>
                                <p className="text-sm text-ink whitespace-pre-line wrap-break-word">{editing.tenant_message}</p>
                            </div>
                        )}

                        {/* ค่าใช้จ่าย (แสดงเมื่อผู้ดูแลระบุ) */}
                        {!isNew && Number(editing.cost) > 0 && (
                            <p className="text-sm text-ink">
                                ค่าใช้จ่าย <span className="font-semibold">{baht(editing.cost)}</span>{' '}
                                {editing.cost_payer === 'tenant' ? <span className="text-red-600">(ผู้เช่าเป็นผู้ชำระ)</span> : <span className="text-muted">(หอพักรับผิดชอบ)</span>}
                            </p>
                        )}

                        {/* ชำระค่าซ่อม (ซ่อมเสร็จและผู้ดูแลระบุให้ผู้เช่าเป็นผู้ชำระ) */}
                        {!isNew && <TenantRepairPayment repair={editing} userId={userId} />}

                        {/* ผู้เช่ายืนยันผลการซ่อมแล้ว */}
                        {!isNew && editing.tenant_confirmed_at && (
                            <p className="text-sm text-emerald-700">คุณยืนยันว่าใช้งานได้ปกติเมื่อ {formatDateTime(editing.tenant_confirmed_at)}</p>
                        )}

                        {/* เวลาที่ซ่อมเสร็จ */}
                        {!isNew && editing.status === 'done' && editing.completed_at && (
                            <p className="text-sm font-medium text-emerald-700 flex items-center gap-1.5">
                                <Icon name="checkCircle" className="w-4 h-4" />
                                ซ่อมเสร็จเมื่อ {formatDateTime(editing.completed_at)}
                            </p>
                        )}

                        {/* ข้อความ error ของฟอร์ม */}
                        {formError && <p className="text-sm text-red-600">{formError}</p>}

                        {/* ปุ่มด้านล่าง: ยกเลิกการแจ้ง (เฉพาะรายการที่ยังรอ) | ปิด/ยกเลิก + ส่งเรื่อง/บันทึก */}
                        <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4 pt-4 border-t border-line">
                            {!isNew && !readOnly ? (
                                <button type="button" onClick={() => setCancelTarget(editing)} disabled={saving} className="flex items-center justify-center gap-1.5 border border-red-500 text-red-600 hover:bg-red-50 px-6 py-2.5 rounded-xl text-sm font-semibold w-full sm:w-auto">
                                    <Icon name="trash" className="w-4 h-4" />
                                    ยกเลิกการแจ้ง
                                </button>
                            ) : (
                                <span />
                            )}
                            <div className="flex gap-3 w-full sm:w-auto justify-end">
                                <button type="button" onClick={closeForm} disabled={saving} className="border border-line text-muted hover:bg-sand rounded-xl px-8 py-2.5 text-sm font-semibold flex-1 sm:flex-initial">
                                    {readOnly ? 'ปิด' : 'ยกเลิก'}
                                </button>
                                {!readOnly && (
                                    <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark text-white rounded-xl px-8 py-2.5 text-sm font-semibold shadow-card flex items-center justify-center gap-2 flex-1 sm:flex-initial">
                                        <Icon name="send" className="w-4 h-4" />
                                        {saving ? 'กำลังส่ง...' : isNew ? 'ส่งเรื่อง' : 'บันทึก'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </form>
                ) : loading || loadError ? (
                    <p className={`text-center py-10 ${loadError ? 'text-red-600' : 'text-muted'}`}>{loading ? 'กำลังโหลด...' : loadError}</p>
                ) : (
                    <>
                        {/* ===== หน้ารายการ: การ์ดสรุปห้องและจำนวนที่ยังไม่เสร็จ ===== */}
                        <div className="rounded-2xl bg-linear-to-br from-primary-dark to-primary text-white p-5 sm:p-6 shadow-card flex items-center justify-between gap-4">
                            <div>
                                <div className="text-sm text-white/75">ห้อง {room}</div>
                                <div className="text-2xl sm:text-3xl font-semibold mt-1">
                                    {active > 0 ? `${active} รายการที่ยังไม่เสร็จ` : 'ไม่มีรายการค้างซ่อม'}
                                </div>
                                {actionCount > 0 && (
                                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-sm">
                                        <Icon name="bell" className="w-4 h-4" />
                                        {actionCount} รายการรอคุณยืนยัน
                                    </div>
                                )}
                            </div>
                            <Icon name="wrench" className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 text-white/30" />
                        </div>

                        {/* แท็บสถานะพร้อมจำนวน (กดเพื่อกรอง) */}
                        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
                            {tabs.map((t) => {
                                const isActive = activeTab === t.key
                                return (
                                    <button
                                        key={t.key}
                                        onClick={() => setActiveTab(t.key)}
                                        aria-pressed={isActive}
                                        className={`text-left rounded-2xl p-4 bg-white shadow-card border-2 transition ${isActive ? 'border-primary' : 'border-transparent hover:border-mist'}`}
                                    >
                                        <div className="text-sm text-muted">{t.label}</div>
                                        <div className="mt-1 flex items-baseline gap-2">
                                            <span className="text-2xl font-semibold text-primary-dark">{countOf(t.key)}</span>
                                            <span className="text-xs text-muted">รายการ</span>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>

                        {/* ยังไม่เคยแจ้งซ่อม: ปุ่มแจ้งรายการแรก / มีรายการ: กล่องรายการ */}
                        {repairs.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-line shadow-card text-center py-12 text-muted">
                                <p>ยังไม่เคยแจ้งซ่อม</p>
                                <button onClick={openNew} className="mt-3 text-primary hover:underline font-medium">แจ้งซ่อมรายการแรก</button>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5">
                                {/* หัวกล่อง: จำนวนรายการ + ตัวกรองประเภท + ปุ่มเรียงลำดับ */}
                                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                    <h2 className="font-medium text-primary-dark">
                                        รายการแจ้งซ่อม
                                        <span className="ml-2 text-sm font-normal text-muted">({visible.length})</span>
                                    </h2>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <select
                                            value={categoryFilter}
                                            onChange={(e) => setCategoryFilter(e.target.value)}
                                            aria-label="กรองตามประเภท"
                                            className="border border-line bg-sand/50 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-secondary focus:bg-white"
                                        >
                                            <option value="all">ทุกประเภท</option>
                                            {Object.entries(repairCategories).map(([k, label]) => (
                                                <option key={k} value={k}>{label}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => setOldestFirst((v) => !v)}
                                            className="flex items-center gap-1.5 border border-line bg-sand/50 rounded-xl px-3 py-1.5 text-sm text-ink hover:bg-white"
                                        >
                                            <Icon name="calendar" className="w-4 h-4 text-muted" />
                                            {oldestFirst ? 'เก่าสุด → ใหม่สุด' : 'ใหม่สุด → เก่าสุด'}
                                        </button>
                                    </div>
                                </div>

                                {visible.length === 0 ? (
                                    <p className="text-center py-12 text-muted">ไม่มีรายการที่ตรงกับเงื่อนไข</p>
                                ) : (
                                    <div className="xl:overflow-auto xl:max-h-[36rem] xl:rounded-xl xl:border xl:border-line xl:shadow-sm">
                                        {/* จอใหญ่: ตาราง กดแถวเพื่อเปิดดู/แก้ไข รายการที่รออยู่พื้นสีฟ้า */}
                                        <table className="hidden xl:table w-full min-w-[44rem] border-collapse text-sm">
                                            <thead className="sticky top-0 z-10">
                                                <tr className="bg-primary-dark text-white">
                                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center w-12">#</th>
                                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">วันที่แจ้ง</th>
                                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-left">ปัญหา</th>
                                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-left">วันนัดซ่อม</th>
                                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">สถานะ</th>
                                                    <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">จัดการ</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {visible.map((r, index) => (
                                                    <tr
                                                        key={r.id}
                                                        onClick={() => openEdit(r)}
                                                        className={`cursor-pointer border-b border-line transition-colors hover:bg-mist/30 ${r.status === 'pending' ? 'bg-sky-50/50' : index % 2 ? 'bg-sand/40' : 'bg-white'}`}
                                                    >
                                                        <td className="px-3 py-3 border-x border-line/60 text-center text-xs text-muted tabular-nums">{index + 1}</td>
                                                        <td className="px-3 py-3 border-x border-line/60 text-center text-muted whitespace-nowrap">{formatThaiDate(r.created_at)}</td>
                                                        <td className="px-3 py-3 border-x border-line/60 font-medium text-ink">
                                                            <span className="inline-flex items-center gap-2">
                                                                {r.problem}
                                                                {r.image_path && <Icon name="image" className="w-4 h-4 text-secondary" />}
                                                                <UrgencyBadge urgency={r.urgency} />
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3 border-x border-line/60 text-muted whitespace-nowrap">
                                                            {r.status === 'scheduled' ? formatSlot(r.appointment_date, r.appointment_period) : '-'}
                                                        </td>
                                                        <td className="px-3 py-3 border-x border-line/60 text-center">
                                                            <RepairStatusBadge status={r.status} />
                                                            {needsAction(r) && <div className="text-xs font-semibold text-red-600 mt-1">รอคุณยืนยัน</div>}
                                                            {unpaidIds.has(r.id) && <div className="text-xs font-semibold text-amber-700 mt-1">ค้างชำระ {baht(r.cost)}</div>}
                                                        </td>
                                                        <td className="border-x border-line/60 px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                            <button onClick={() => openEdit(r)} className="px-4 py-1 rounded-lg text-sm bg-mist/60 text-primary-dark hover:bg-mist whitespace-nowrap">
                                                                {r.status === 'pending' ? 'แก้ไข' : needsAction(r) ? 'ยืนยัน' : 'ดูรายละเอียด'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {/* จอเล็ก/กลาง: แสดงเป็นการ์ด */}
                                        <div className="xl:hidden grid gap-3 md:grid-cols-2">
                                            {visible.map((r) => (
                                                <div
                                                    key={r.id}
                                                    className={`rounded-2xl border border-line p-4 flex flex-col gap-3 ${r.status === 'pending' ? 'bg-sky-50/60' : 'bg-white'}`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="font-medium text-ink wrap-break-word">
                                                                {r.problem}
                                                                {r.image_path && <Icon name="image" className="inline-block ml-2 -mt-0.5 w-4 h-4 text-secondary" />}
                                                            </div>
                                                            <div className="text-xs text-muted mt-0.5">แจ้งเมื่อ {formatThaiDate(r.created_at)}</div>
                                                            {r.status === 'scheduled' && (
                                                                <div className="text-xs text-violet-700 mt-0.5">นัด {formatSlot(r.appointment_date, r.appointment_period)}</div>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1">
                                                            <RepairStatusBadge status={r.status} />
                                                            <UrgencyBadge urgency={r.urgency} />
                                                        </div>
                                                    </div>
                                                    {needsAction(r) && <div className="text-xs font-semibold text-red-600">รอคุณยืนยัน</div>}
                                                    {unpaidIds.has(r.id) && <div className="text-xs font-semibold text-amber-700">ค้างชำระ {baht(r.cost)}</div>}
                                                    <button onClick={() => openEdit(r)} className="py-2 rounded-xl text-sm bg-mist/60 text-primary-dark hover:bg-mist">
                                                        {r.status === 'pending' ? 'แก้ไขเรื่องนี้' : needsAction(r) ? 'ตรวจสอบและยืนยัน' : 'ดูรายละเอียด'}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* หน้าต่างยืนยันยกเลิกการแจ้งซ่อม */}
            {cancelTarget && (
                <ConfirmDialog title="ยืนยันการยกเลิก" confirmLabel="ยกเลิกการแจ้ง" busy={saving} onCancel={() => setCancelTarget(null)} onConfirm={handleCancel}>
                    ต้องการยกเลิกการแจ้งซ่อม <span className="font-semibold text-ink">{cancelTarget.problem}</span> ใช่หรือไม่?
                </ConfirmDialog>
            )}
        </>
    )
}

export default UserRepairsPage
