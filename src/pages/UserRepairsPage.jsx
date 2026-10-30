import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Icon from '../components/Icon'
import { RepairCostBanner } from '../components/RepairPayment'
import { useRepairCosts } from '../lib/useRepairCosts'
import { ConfirmDialog } from '../components/RepairParts'
import UserRepairForm from '../components/UserRepairForm'
import UserRepairList from '../components/UserRepairList'
import { repairStatuses, repairStatusKeys } from '../data/repairs'
import { removeRepairImage, upcomingSlots, uploadRepairImage, validateAvailability } from '../lib/repairs'
import { useRealtimeReload } from '../lib/realtime'
import { supabase } from '../lib/supabaseClient'
import { useCurrentUser } from '../lib/useCurrentUser'
import { emptyForm, fetchRepairs, formFromRepair, initialData, needsAction, needsNewTime, repairSubmitFields, validateRepairSubmit } from '../lib/userRepairs'
import { SkeletonCards, SkeletonPage } from '../components/Skeleton.jsx'

// หน้าแจ้งซ่อมของผู้เช่า: ดู/ค้นหารายการของตัวเอง แจ้งซ่อมใหม่ แก้ไข และยกเลิกรายการที่ยังรอดำเนินการ
// หน้านี้ถือข้อมูลและขั้นตอนบันทึก/ตอบกลับ ส่วนที่แสดงผลแยกอยู่ใน UserRepairForm (ฟอร์ม/รายละเอียด) และ UserRepairList (หน้ารายการ)
function UserRepairsPage() {
    // ผู้ใช้ที่ login และห้องของผู้เช่า
    const me = useCurrentUser()
    // ค่าซ่อมที่ยังไม่ได้ชำระ (ใช้ทำป้ายค้างชำระในรายการ)
    const unpaidRepairs = useRepairCosts()
    const userId = me?.id
    const room = me?.tenant?.room

    // ข้อมูลที่โหลด, แท็บสถานะ, ข้อความแจ้งผล และคำค้นหา
    const [data, setData] = useState(initialData)
    const { repairs, payments, loading, loadError } = data
    const [activeTab, setActiveTab] = useState('all')
    const [notice, setNotice] = useState('')
    // กรองตามประเภทงาน และเรียงจากเก่าสุดไปใหม่สุดไหม
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [oldestFirst, setOldestFirst] = useState(false)

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

    // อัปเดตเองเมื่อผู้ดูแลรับเรื่อง เสนอนัด เปลี่ยนสถานะ หรือใส่ค่าซ่อม
    useRealtimeReload(['repairs', 'repair_payments'], load, { enabled: Boolean(userId) })

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
    if (!me) return <SkeletonPage />

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
        setForm(formFromRepair(repair))
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

    // บันทึกการแจ้งซ่อม: ตรวจข้อมูล อัปโหลด/ลบรูป แล้วเพิ่มหรืออัปเดตรายการ
    const handleSubmit = async (e) => {
        e.preventDefault()
        if (saving) return
        const problemError = validateRepairSubmit(form)
        if (problemError) return setFormError(problemError)

        setSaving(true)
        setFormError('')

        // มีรูปใหม่ให้อัปโหลดเข้าโฟลเดอร์ของผู้เช่าก่อน แล้วสรุปว่าจะใช้รูปไหน (ใหม่ / เดิม / ไม่มีรูป)
        const isNew = editing === 'new'
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
        const fields = repairSubmitFields(form, image_path)

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
    // stay = อยู่หน้ารายละเอียดเดิมต่อ (แสดงข้อมูลล่าสุดของเรื่องนี้) ไม่ต้องกลับไปหน้ารายการ
    const runAction = async (fn, params, successText, { stay = false } = {}) => {
        setSaving(true)
        setFormError('')
        const { error } = await supabase.rpc(fn, params)
        if (error) {
            setSaving(false)
            return setFormError(error.message)
        }
        const fresh = await fetchRepairs(userId)
        setData(fresh)
        setSaving(false)
        setAction(null)
        setEditing(stay ? (fresh.repairs.find((r) => r.id === params.p_id) ?? null) : null)
        setNotice(successText)
    }

    // เปิดกล่องขอเปลี่ยนเวลา / แจ้งว่ายังไม่หาย
    const openAction = (type) => {
        setActionForm({ slots: upcomingSlots(editing.available_slots), allow_entry: editing.allow_entry, note: '' })
        setFormError('')
        setAction(type)
    }

    // การตอบกลับผู้ดูแลในหน้ารายละเอียด (ส่งให้ UserRepairForm)
    const respond = {
        action,
        setAction,
        actionForm,
        setActionForm,
        openAction,
        // ยืนยันวันนัดที่ผู้ดูแลเสนอ
        accept: () => runAction('repair_accept_appointment', { p_id: editing.id }, 'ยืนยันวันนัดเรียบร้อยแล้ว'),
        // ส่งช่วงเวลาใหม่ที่สะดวก (รายการจะกลับไปรอผู้ดูแลนัดใหม่)
        submitReschedule: () => {
            const err = validateAvailability({ slots: actionForm.slots, allowEntry: actionForm.allow_entry })
            if (err) return setFormError(err)
            runAction(
                'repair_request_new_time',
                { p_id: editing.id, p_slots: actionForm.slots, p_note: actionForm.note.trim(), p_allow_entry: actionForm.allow_entry },
                'ส่งคำขอเปลี่ยนเวลาแล้ว ผู้ดูแลจะนัดวันใหม่ให้',
            )
        },
        // ตรวจงานหลังซ่อม: เรียบร้อย / ยังไม่หาย (ต้องบอกเหตุผล)
        confirmFixed: () => runAction('repair_confirm_done', { p_id: editing.id, p_fixed: true, p_note: '' }, 'ขอบคุณที่ยืนยัน งานซ่อมนี้ปิดเรียบร้อยแล้ว', { stay: true }),
        submitNotFixed: () => {
            if (!actionForm.note.trim()) return setFormError('กรุณาอธิบายว่ายังมีปัญหาอะไร')
            runAction('repair_confirm_done', { p_id: editing.id, p_fixed: false, p_note: actionForm.note.trim() }, 'แจ้งผู้ดูแลแล้ว ผู้ดูแลจะนัดเข้าซ่อมอีกครั้ง')
        },
    }

    // จำนวนรายการที่ยังไม่เสร็จ และรายการแท็บ (ทั้งหมด + ทุกสถานะ)
    const active = repairs.filter((r) => r.status !== 'done').length
    const actionCount = repairs.filter((r) => needsAction(r) || needsNewTime(r)).length
    // เรื่องที่มีค่าซ่อมค้างชำระ / ส่งสลิปแล้วรอผู้ดูแลตรวจ / ผู้ดูแลยืนยันรับเงินแล้ว (แสดงป้ายในรายการ)
    const ids = {
        unpaid: new Set(unpaidRepairs.map((r) => r.id)),
        review: new Set(payments.filter((p) => p.status === 'review').map((p) => p.repair_id)),
        paid: new Set(payments.filter((p) => p.status === 'paid').map((p) => p.repair_id)),
    }
    const tabs = [{ key: 'all', label: 'ทั้งหมด' }, ...repairStatusKeys.map((k) => ({ key: k, label: repairStatuses[k].label, short: repairStatuses[k].short }))]
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
                    <UserRepairForm
                        editing={editing}
                        room={room}
                        userId={userId}
                        form={form}
                        setForm={setForm}
                        saving={saving}
                        formError={formError}
                        file={file}
                        setFile={setFile}
                        removeExisting={removeExisting}
                        setRemoveExisting={setRemoveExisting}
                        respond={respond}
                        onSubmit={handleSubmit}
                        onClose={closeForm}
                        onRequestCancel={() => setCancelTarget(editing)}
                    />
                ) : loading || loadError ? (
                    loading ? <SkeletonCards count={3} lines={3} /> : <p className="text-center py-10 text-red-600">{loadError}</p>
                ) : (
                    <UserRepairList
                        room={room}
                        active={active}
                        actionCount={actionCount}
                        tabs={tabs}
                        countOf={countOf}
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        categoryFilter={categoryFilter}
                        setCategoryFilter={setCategoryFilter}
                        oldestFirst={oldestFirst}
                        setOldestFirst={setOldestFirst}
                        visible={visible}
                        total={repairs.length}
                        ids={ids}
                        onOpen={openEdit}
                        onNew={openNew}
                    />
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
