// หน้าระบบแจ้งซ่อมฝั่งแอดมิน (แสดงในหน้า /repairs เมื่อผู้ใช้เป็นแอดมิน)
// หน้านี้ถือข้อมูลและขั้นตอนบันทึก/ลบ ส่วนที่แสดงผลแยกอยู่ใน AdminRepairForm (ฟอร์ม) และ AdminRepairList (หน้ารายการ)
// ตรรกะตรวจฟอร์มและสร้างฟิลด์ที่บันทึกอยู่ใน lib/adminRepairs.js
import { useEffect, useMemo, useState } from 'react'
import PageHeader from './PageHeader'
import Icon from './Icon'
import AdminRepairForm from './AdminRepairForm'
import AdminRepairList from './AdminRepairList'
import { ConfirmDialog } from './RepairParts'
import { repairStatuses, repairStatusKeys } from '../data/repairs'
import { emptyForm, fetchRepairsData, formFromRepair, initialData, repairFields, validateRepairForm } from '../lib/adminRepairs'
import { owesRepairCost } from '../lib/repairPayments'
import { normalizePeriod, removeRepairImage, sortRepairs, todayIso, upcomingSlots, uploadRepairImage } from '../lib/repairs'
import { useRealtimeReload } from '../lib/realtime'
import { supabase } from '../lib/supabaseClient'

// หน้าจัดการแจ้งซ่อมของแอดมิน: ดู/ค้นหา/กรองตามสถานะ เพิ่ม แก้ไข และลบรายการแจ้งซ่อม
function AdminRepairs({ adminId }) {
    // ข้อมูลที่โหลดจากฐานข้อมูล (เก็บรวมกันเพื่ออัปเดตครั้งเดียว)
    const [data, setData] = useState(initialData)
    const { repairs, rooms, tenants, loading, loadError } = data

    // แท็บสถานะที่เลือก และคำค้นหาในหน้ารายการ
    const [activeTab, setActiveTab] = useState('all')
    const [search, setSearch] = useState('')
    // กรองตามประเภทงาน และเรียงจากเก่าสุดไปใหม่สุดไหม
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [oldestFirst, setOldestFirst] = useState(false)

    // editing: null = หน้ารายการ, 'new' = แจ้งซ่อมใหม่, ออบเจ็กต์ = จัดการรายการนั้น
    const [editing, setEditing] = useState(null)
    // ค่าในฟอร์มที่กำลังกรอก
    const [form, setForm] = useState(emptyForm)
    // รูปใหม่ที่เลือก และ removeExisting = กดนำรูปเดิมออก
    const [file, setFile] = useState(null)
    const [removeExisting, setRemoveExisting] = useState(false)
    // true = กด "ให้ผู้เช่าเลือกเวลาใหม่" ตอนบันทึกจะล้างเวลาที่ผู้เช่าเลือกและแจ้งเตือนให้ผู้เช่าเลือกใหม่
    const [askNewTime, setAskNewTime] = useState(false)
    // กำลังบันทึก/ลบ (ใช้ล็อกปุ่มและช่องกรอก), ข้อความ error ของฟอร์ม, เปิดหน้าต่างยืนยันลบ
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState('')
    const [confirmDelete, setConfirmDelete] = useState(false)
    // ข้อความ error ตอนกดปักหมุดจากหน้ารายการ
    const [pinError, setPinError] = useState('')

    // โหลดซ้ำหลังบันทึก/ลบ
    const load = async () => setData(await fetchRepairsData())

    // อัปเดตเองเมื่อผู้เช่าแจ้งซ่อมใหม่ ยืนยัน/ขอเปลี่ยนนัด หรือยืนยันผลซ่อม
    useRealtimeReload(['repairs', 'repair_payments'], load)

    // สถานะการชำระค่าซ่อมของแต่ละเรื่อง: review = ส่งสลิปรอตรวจ, paid = ชำระแล้ว, unpaid = ยังไม่ส่งสลิป
    const payState = (r) => {
        const p = data.payments.filter((x) => x.repair_id === r.id)
        if (p.some((x) => x.status === 'review')) return 'review'
        if (p.some((x) => x.status === 'paid')) return 'paid'
        return owesRepairCost(r) ? 'unpaid' : null
    }

    // โหลดครั้งแรก: setState เกิดใน callback หลังได้ข้อมูล ไม่ได้เรียกตรง ๆ ใน effect
    useEffect(() => {
        let active = true
        fetchRepairsData().then((result) => {
            if (active) setData(result)
        })
        return () => {
            active = false
        }
    }, [])

    // หาผู้เช่าของห้องที่ระบุ
    const tenantOf = (room) => tenants.find((t) => t.room === room)

    // นับจำนวนรายการทั้งหมดและแยกตามสถานะ (แสดงบนการ์ดสรุปด้านบน)
    const counts = useMemo(() => {
        const c = { all: repairs.length }
        repairStatusKeys.forEach((k) => {
            c[k] = repairs.filter((r) => r.status === k).length
        })
        return c
    }, [repairs])

    // นัดหมายที่ยังไม่ถึง/วันนี้ เรียงตามวัน (แสดงเป็นตารางงานของช่าง)
    const upcoming = useMemo(() => {
        const today = todayIso()
        return repairs
            .filter((r) => r.status === 'in_progress' && r.appointment_date >= today)
            .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date) || normalizePeriod(a.appointment_period).localeCompare(normalizePeriod(b.appointment_period)))
    }, [repairs])
    // นัดของห้องอื่น (ไม่นับรายการที่กำลังแก้ไข) ใช้บอกว่าช่วงที่จะนัดมีงานอื่นแล้วกี่งาน (นัดซ้อนกันได้ เช่น ส่งช่างคนอื่นไป)
    const otherAppointments = upcoming.filter((r) => r.id !== editing?.id).map((r) => ({ date: r.appointment_date, period: r.appointment_period }))
    // ช่วงเวลาที่ผู้เช่าสะดวกและยังไม่ผ่านไป (ผู้ดูแลเลือกหนึ่งช่วงเป็นวันนัด)
    const slotChoices = editing && editing !== 'new' ? upcomingSlots(editing.available_slots) : []

    // รายการที่แสดง: กรองตามแท็บสถานะและประเภท แล้วค้นหาจากเลขห้อง
    const visible = repairs.filter((r) => {
        if (activeTab !== 'all' && r.status !== activeTab) return false
        if (categoryFilter !== 'all' && (r.category ?? 'other') !== categoryFilter) return false
        const q = search.trim().toLowerCase()
        return !q || r.room?.toLowerCase().includes(q)
    })
    // เรื่องที่ปักหมุดอยู่บนสุด ที่เหลือเรียงตามวันที่แจ้ง: ใหม่สุดก่อน (ค่าเริ่มต้น) หรือเก่าสุดก่อน
    const sorted = sortRepairs(visible, oldestFirst)

    // ปัก/เลิกปักหมุดจากหน้ารายการ (ไม่ต้องเปิดฟอร์ม)
    const togglePin = async (r) => {
        setPinError('')
        const { error } = await supabase.from('repairs').update({ pinned: !r.pinned }).eq('id', r.id)
        if (error) return setPinError(`ปักหมุดไม่สำเร็จ: ${error.message}`)
        await load()
    }

    // ล้างสถานะรูปที่เลือกในฟอร์ม
    const resetImageState = () => {
        setFile(null)
        setRemoveExisting(false)
        setAskNewTime(false)
    }

    // เปิดฟอร์มเพิ่มรายการแจ้งซ่อมใหม่
    const openNew = () => {
        setForm(emptyForm)
        resetImageState()
        setFormError('')
        setEditing('new')
    }

    // เปิดฟอร์มแก้ไขรายการแจ้งซ่อม โดยเติมข้อมูลเดิมลงในฟอร์ม
    const openEdit = (item) => {
        setForm(formFromRepair(item))
        resetImageState()
        setFormError('')
        setEditing(item)
    }

    // ปิดฟอร์ม (ปิดไม่ได้ระหว่างกำลังบันทึก)
    const close = () => {
        if (saving) return
        setEditing(null)
        setConfirmDelete(false)
    }

    // บันทึกรายการแจ้งซ่อม: ตรวจข้อมูล อัปโหลด/ลบรูป แล้วเพิ่มหรืออัปเดตในฐานข้อมูล
    const handleSave = async (e) => {
        e.preventDefault()
        // เรื่องที่เสร็จสิ้นแล้วแก้ไม่ได้
        if (editing !== 'new' && editing.status === 'done') return
        // 1. ตรวจข้อมูลที่จำเป็น
        const problemError = validateRepairForm({ form, editing, slotChoices })
        if (problemError) return setFormError(problemError)

        setSaving(true)
        setFormError('')

        const isNew = editing === 'new'
        const tenant = tenantOf(form.room)
        const oldPath = isNew ? null : editing.image_path
        // รูปเก็บในโฟลเดอร์ของผู้เช่าเจ้าของรายการ เพื่อให้ผู้เช่าเปิดดูได้
        const folder = (isNew ? tenant?.user_id : editing.user_id) || adminId

        // 2. มีรูปใหม่ให้อัปโหลดก่อน แล้วสรุปว่ารายการนี้จะใช้รูปไหน (ใหม่ / เดิม / ไม่มีรูป)
        let newPath = null
        if (file) {
            const res = await uploadRepairImage(file, folder)
            if (res.error) {
                setSaving(false)
                return setFormError(res.error)
            }
            newPath = res.path
        }
        const image_path = newPath ?? (removeExisting ? null : oldPath)

        // 3. บันทึกลงฐานข้อมูล: รายการใหม่ใช้ insert (ผูกห้องและผู้เช่า) รายการเดิมใช้ update
        const fields = repairFields({ form, editing, tenant, imagePath: image_path, askNewTime })
        const { error } = isNew
            ? await supabase.from('repairs').insert({
                ...fields,
                room: form.room,
                user_id: tenant?.user_id ?? null,
                // แอดมินแจ้งซ่อมเองได้เฉพาะห้องว่าง ผู้แจ้งจึงเป็นผู้ดูแล
                tenant_name: tenant?.name ?? 'ผู้ดูแล',
                // สร้างเป็น "เสร็จสิ้น" ทันที: บันทึกเวลาเสร็จด้วย (ฐานข้อมูลตั้งให้เฉพาะตอนเปลี่ยนสถานะ) ไม่งั้นรายงานไม่นับค่าซ่อมนี้
                completed_at: form.status === 'done' ? new Date().toISOString() : null,
            })
            : await supabase.from('repairs').update(fields).eq('id', editing.id)

        // บันทึกไม่สำเร็จ: ลบรูปที่เพิ่งอัปโหลดทิ้ง ไม่ให้มีไฟล์ค้าง
        if (error) {
            if (newPath) await removeRepairImage(newPath)
            setSaving(false)
            return setFormError(`บันทึกไม่สำเร็จ: ${error.message}`)
        }
        // ลบรูปเดิมออกจาก storage เมื่อถูกแทนที่หรือนำออก
        if (oldPath && oldPath !== image_path) await removeRepairImage(oldPath)

        // 4. โหลดรายการใหม่แล้วกลับไปหน้ารายการ
        await load()
        setSaving(false)
        setEditing(null)
    }

    // ลบรายการแจ้งซ่อมที่กำลังแก้ไข
    const handleDelete = async () => {
        setSaving(true)
        // สลิปค่าซ่อมที่เคยส่ง (ประวัติการชำระถูกลบตามเรื่องอัตโนมัติ แต่ไฟล์ใน storage ต้องลบเอง)
        const { data: slips } = await supabase.from('repair_payments').select('slip_path').eq('repair_id', editing.id)
        const { error } = await supabase.from('repairs').delete().eq('id', editing.id)
        if (error) {
            setSaving(false)
            setConfirmDelete(false)
            return setFormError(`ลบไม่สำเร็จ: ${error.message}`)
        }
        // ลบแถวสำเร็จแล้วค่อยลบรูปใน storage จากนั้นโหลดใหม่และกลับหน้ารายการ
        await removeRepairImage(editing.image_path)
        const slipPaths = (slips ?? []).map((p) => p.slip_path).filter(Boolean)
        if (slipPaths.length > 0) await supabase.storage.from('slips').remove(slipPaths)
        await load()
        setSaving(false)
        setConfirmDelete(false)
        setEditing(null)
    }

    // แท็บการ์ดสรุปด้านบน
    const tabs = [{ key: 'all', label: 'ทั้งหมด' }, ...repairStatusKeys.map((k) => ({ key: k, label: repairStatuses[k].label, short: repairStatuses[k].short }))]

    return (
        <div className="p-4 sm:p-6 flex flex-col gap-5">
            {/* หัวหน้า: ชื่อหน้า + ปุ่ม "แจ้งซ่อม" (แสดงเฉพาะตอนอยู่หน้ารายการ) */}
            <PageHeader flush title="ระบบแจ้งซ่อม" subtitle="จัดการเรื่องที่ผู้เช่าแจ้งซ่อม อัปเดตสถานะ และส่งข้อความถึงผู้เช่า" actions={
                <>
                {!editing && (
                    <button onClick={openNew} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-sm font-medium shadow-card flex items-center gap-1.5">
                        <Icon name="plus" className="w-4 h-4" />
                        แจ้งซ่อม
                    </button>
                )}
                </>
            } />

            {/* มีรายการที่กำลังเพิ่ม/แก้ไข แสดงฟอร์ม ไม่งั้นแสดงหน้ารายการ */}
            {editing ? (
                <AdminRepairForm
                    editing={editing}
                    form={form}
                    setForm={setForm}
                    saving={saving}
                    formError={formError}
                    rooms={rooms}
                    tenantOf={tenantOf}
                    slotChoices={slotChoices}
                    otherAppointments={otherAppointments}
                    askNewTime={askNewTime}
                    setAskNewTime={setAskNewTime}
                    file={file}
                    setFile={setFile}
                    removeExisting={removeExisting}
                    setRemoveExisting={setRemoveExisting}
                    onSubmit={handleSave}
                    onDelete={() => setConfirmDelete(true)}
                    onClose={close}
                />
            ) : (
                <AdminRepairList
                    upcoming={upcoming}
                    tabs={tabs}
                    counts={counts}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    categoryFilter={categoryFilter}
                    setCategoryFilter={setCategoryFilter}
                    oldestFirst={oldestFirst}
                    setOldestFirst={setOldestFirst}
                    search={search}
                    setSearch={setSearch}
                    loading={loading}
                    loadError={loadError}
                    pinError={pinError}
                    visible={visible}
                    sorted={sorted}
                    total={repairs.length}
                    payState={payState}
                    onOpen={openEdit}
                    onTogglePin={togglePin}
                />
            )}

            {/* หน้าต่างยืนยันก่อนลบรายการ */}
            {confirmDelete && (
                <ConfirmDialog title="ยืนยันการลบรายการ" confirmLabel="ลบรายการ" busy={saving} onCancel={() => setConfirmDelete(false)} onConfirm={handleDelete}>
                    ต้องการลบรายการแจ้งซ่อมห้อง <span className="font-semibold text-ink">{editing.room} ({editing.problem})</span> ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้
                </ConfirmDialog>
            )}
        </div>
    )
}

export default AdminRepairs
