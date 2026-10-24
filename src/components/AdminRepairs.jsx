// หน้าระบบแจ้งซ่อมฝั่งแอดมิน (แสดงในหน้า /repairs เมื่อผู้ใช้เป็นแอดมิน)
import { useEffect, useMemo, useState } from 'react'
import PageHeader from './PageHeader'
import Icon from './Icon'
import { ConfirmDialog, RepairImage, RepairImagePicker, RepairStatusBadge, SlotList, UrgencyBadge } from './RepairParts'
import { repairCategories, repairStatuses, repairStatusKeys } from '../data/repairs'
import { baht, formatDateTime } from '../lib/billing'
import { AdminRepairPayment } from './RepairPayment'
import { owesRepairCost } from '../lib/repairPayments'
import { formatSlot, formatThaiDate, isBooked, isInSlots, isValidPeriod, normalizePeriod, removeRepairImage, todayIso, upcomingSlots, uploadRepairImage } from '../lib/repairs'
import { useRealtimeReload } from '../lib/realtime'
import { supabase } from '../lib/supabaseClient'
import { SkeletonTable } from './Skeleton.jsx'

// คลาส Tailwind ของช่องกรอก/ตัวเลือกในฟอร์ม (ใช้ร่วมกันทุกช่อง)
const inputClass = 'w-full border border-line rounded-xl px-4 py-2 text-ink text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30 bg-white disabled:bg-sand/60 disabled:text-muted'
// ค่าเริ่มต้นของฟอร์มแจ้งซ่อมใหม่ (สถานะเริ่มที่ "รอดำเนินการ")
const emptyForm = {
    room: '',
    problem: '',
    detail: '',
    status: 'pending',
    admin_note: '',
    category: 'other',
    urgency: 'normal',
    // นัดหมาย: วัน ช่วงเวลา ช่าง และ confirmed = ตกลงกับผู้เช่าแล้ว (เช่น คุยทางโทรศัพท์) ไม่ต้องรอผู้เช่ากดยืนยัน
    appointment_date: '',
    appointment_period: '',
    technician: '',
    confirmed: false,
    // ค่าใช้จ่ายและผู้รับผิดชอบ
    cost: '',
    cost_payer: 'owner',
}

// เวลา วัน เดือน ปี เช่น "11:15 น. 16 ต.ค. 69"
const formatTimeDate = (iso) => {
    if (!iso) return '-'
    const d = new Date(iso)
    const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    const date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
    return `${time} น. ${date}`
}

// เรียงเลขห้องแบบตัวเลข (เช่น 101 < 201 < 1001)
const byRoom = (a, b) => a.localeCompare(b, undefined, { numeric: true })

// ข้อมูลตั้งต้นก่อนโหลดเสร็จ: รายการแจ้งซ่อม เลขห้อง ผู้เช่า และสถานะการโหลด
const initialData = { repairs: [], rooms: [], tenants: [], payments: [], loading: true, loadError: '' }

// ดึงข้อมูลทั้งหมดที่หน้านี้ใช้ (ไม่แตะ state เพื่อเรียกใช้ได้ทั้งใน effect และหลังบันทึก)
async function fetchData() {
    // ดึงพร้อมกัน: แจ้งซ่อม (ใหม่สุดก่อน), เลขห้องทั้งหมด, ผู้เช่าของแต่ละห้อง, สถานะการชำระค่าซ่อม
    const [repairsRes, roomsRes, tenantsRes, paymentsRes] = await Promise.all([
        supabase.from('repairs').select('*').order('created_at', { ascending: false }),
        supabase.from('rooms').select('number'),
        supabase.from('tenants').select('room, name, user_id'),
        supabase.from('repair_payments').select('repair_id, status').in('status', ['review', 'paid']),
    ])
    // ตารางไหนโหลดไม่สำเร็จ ให้แสดงข้อความ error แทนข้อมูล
    const error = repairsRes.error || roomsRes.error || tenantsRes.error
    if (error) return { ...initialData, loading: false, loadError: `โหลดข้อมูลไม่สำเร็จ: ${error.message}` }
    return {
        repairs: repairsRes.data,
        rooms: roomsRes.data.map((r) => r.number).sort(byRoom),
        tenants: tenantsRes.data,
        // ตารางชำระค่าซ่อมโหลดไม่ได้ = ไม่แสดงสถานะการชำระ หน้ายังใช้ได้
        payments: paymentsRes.error ? [] : paymentsRes.data,
        loading: false,
        loadError: '',
    }
}

// สถานะการชำระค่าซ่อมที่ผู้เช่าจ่าย แสดงใต้ป้ายสถานะ (ไม่มีค่าซ่อมที่ผู้เช่าต้องจ่าย = ไม่แสดง)
const payLabels = {
    review: { text: 'รอตรวจสอบสลิป', tone: 'text-sky-700' },
    unpaid: { text: 'รอผู้เช่าชำระ', tone: 'text-amber-700' },
    paid: { text: 'ชำระค่าซ่อมแล้ว', tone: 'text-emerald-700' },
}
function PayState({ state }) {
    const label = payLabels[state]
    return label ? <div className={`text-xs font-semibold mt-1 ${label.tone}`}>{label.text}</div> : null
}

// ค่าซ่อมและผู้รับผิดชอบ (ไม่มีค่าใช้จ่าย = "-") ใช้ในตารางและการ์ดรายการ
function RepairCost({ repair, inline = false }) {
    if (!(Number(repair.cost) > 0)) return inline ? null : '-'
    const tenantPays = repair.cost_payer === 'tenant'
    const payer = tenantPays ? 'ผู้เช่าจ่าย' : 'หอพักจ่าย'
    if (inline) return <div className="text-xs text-muted">ค่าซ่อม {baht(repair.cost)} · <span className={tenantPays ? 'text-rose-700' : ''}>{payer}</span></div>
    return (
        <>
            <div className="font-medium text-ink tabular-nums">{baht(repair.cost)}</div>
            <div className={`text-xs ${tenantPays ? 'text-rose-700' : 'text-muted'}`}>{payer}</div>
        </>
    )
}

// ไอคอนและสีของการ์ดสรุปแต่ละสถานะ
const summaryMeta = {
    all: { icon: 'wrench', tone: 'bg-slate-100 text-slate-600' },
    pending: { icon: 'clock', tone: 'bg-sky-50 text-sky-700' },
    in_progress: { icon: 'review', tone: 'bg-amber-50 text-amber-700' },
    done: { icon: 'checkCircle', tone: 'bg-emerald-50 text-emerald-700' },
    cancelled: { icon: 'ban', tone: 'bg-slate-100 text-slate-600' },
}

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

    // โหลดซ้ำหลังบันทึก/ลบ
    const load = async () => setData(await fetchData())

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
        fetchData().then((result) => {
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
    // เวลาที่ไม่ว่าง (ไม่นับรายการที่กำลังแก้ไข): นัดของห้องอื่น + วันเวลาที่ผู้เช่าห้องอื่นเลือกไว้ในเรื่องที่รอดำเนินการ
    const booked = [
        ...upcoming.filter((r) => r.id !== editing?.id).map((r) => ({ date: r.appointment_date, period: r.appointment_period })),
        ...repairs.filter((r) => r.status === 'pending' && r.id !== editing?.id).flatMap((r) => (r.available_slots ?? []).filter((s) => s.date >= todayIso())),
    ]

    // รายการที่แสดง: กรองตามแท็บสถานะและประเภท แล้วค้นหาจากเลขห้อง
    const visible = repairs.filter((r) => {
        if (activeTab !== 'all' && r.status !== activeTab) return false
        if (categoryFilter !== 'all' && (r.category ?? 'other') !== categoryFilter) return false
        const q = search.trim().toLowerCase()
        return !q || r.room?.toLowerCase().includes(q)
    })
    // เรียงตามวันที่แจ้ง: ใหม่สุดก่อน (ค่าเริ่มต้น) หรือเก่าสุดก่อน
    visible.sort((a, b) => (oldestFirst ? 1 : -1) * a.created_at.localeCompare(b.created_at))

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
        setForm({
            room: item.room,
            problem: item.problem,
            detail: item.detail,
            status: item.status,
            admin_note: item.admin_note,
            category: item.category ?? 'other',
            urgency: item.urgency ?? 'normal',
            appointment_date: item.appointment_date ?? '',
            appointment_period: normalizePeriod(item.appointment_period),
            technician: item.technician ?? '',
            confirmed: item.appointment_state === 'confirmed',
            cost: Number(item.cost) > 0 ? String(item.cost) : '',
            cost_payer: item.cost_payer ?? 'owner',
        })
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

    // สร้างฟังก์ชันจัดการ onChange ของช่องในฟอร์มตาม key
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

    // เปลี่ยนสถานะ: เปลี่ยนเป็น "กำลังดำเนินการ" ครั้งแรก ให้ใช้วันเวลาที่ผู้เช่าเลือกไว้เป็นวันนัด (ถ้าเวลานั้นยังว่าง)
    const changeStatus = (status) => {
        setAskNewTime(false)
        setForm((f) => {
            if (status !== 'in_progress' || f.appointment_date || editing === 'new') return { ...f, status }
            const slot = upcomingSlots(editing.available_slots).find((s) => !isBooked(booked, s.date, s.period))
            return slot ? { ...f, status, appointment_date: slot.date, appointment_period: slot.period } : { ...f, status }
        })
    }

    // บันทึกรายการแจ้งซ่อม: ตรวจข้อมูล อัปโหลด/ลบรูป แล้วเพิ่มหรืออัปเดตในฐานข้อมูล
    const handleSave = async (e) => {
        e.preventDefault()
        // เรื่องที่เสร็จสิ้นแล้วแก้ไม่ได้
        if (editing !== 'new' && editing.status === 'done') return
        // 1. ตรวจข้อมูลที่จำเป็น
        const isNew = editing === 'new'
        const problem = form.problem.trim()
        if (!form.room) return setFormError('กรุณาเลือกห้อง')
        if (!problem) return setFormError('กรุณาระบุปัญหา')
        // กำลังดำเนินการ: วันนัด = เวลาที่ผู้เช่าเลือก (ใส่ให้ตอนเปลี่ยนสถานะ) ถ้าเวลานั้นไม่ว่างหรือผ่านไปแล้ว ให้ผู้เช่าเลือกใหม่
        // (ผู้เช่าไม่ได้เลือกเวลา เช่น อนุญาตให้เข้าห้องได้เลย หรือแอดมินแจ้งซ่อมเอง = ไม่มีวันนัด)
        const apptChanged = isNew || form.appointment_date !== (editing.appointment_date ?? '') || form.appointment_period !== normalizePeriod(editing.appointment_period)
        if (form.status === 'in_progress' && !isNew && editing.status !== 'in_progress' && !form.appointment_date && editing.available_slots?.length > 0)
            return setFormError('เวลาที่ผู้เช่าเลือกไม่ว่างหรือผ่านไปแล้ว กรุณากด "ให้ผู้เช่าเลือกเวลาใหม่"')
        if (form.status === 'in_progress' && form.appointment_date && apptChanged) {
            if (form.appointment_date < todayIso() || !isValidPeriod(form.appointment_period) || isBooked(booked, form.appointment_date, form.appointment_period))
                return setFormError(`${formatSlot(form.appointment_date, form.appointment_period)} ไม่ว่างหรือผ่านไปแล้ว กรุณากด "ให้ผู้เช่าเลือกเวลาใหม่"`)
        }
        // ยกเลิก/ไม่รับเรื่อง ต้องบอกเหตุผลให้ผู้เช่าทราบ
        if (form.status === 'cancelled' && !form.admin_note.trim()) return setFormError('กรุณาระบุเหตุผลที่ยกเลิกในช่องหมายเหตุถึงผู้เช่า')
        const cost = form.cost === '' ? 0 : Number(form.cost)
        if (!(cost >= 0)) return setFormError('ค่าใช้จ่ายต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป')

        setSaving(true)
        setFormError('')

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
        // สถานะนัด: ห้องว่าง / ตรงกับช่วงที่ผู้เช่าเลือกไว้ / แอดมินติ๊กว่าตกลงกันแล้ว = ยืนยันเลย, ไม่งั้นรอผู้เช่ายืนยัน
        const ownerId = isNew ? tenant?.user_id : editing.user_id
        const slots = isNew ? [] : editing.available_slots
        const withAppt = form.status === 'in_progress'
        const appointmentState = !withAppt
            ? isNew ? null : editing.appointment_state
            : !ownerId || form.confirmed || isInSlots(slots, form.appointment_date, form.appointment_period)
              ? 'confirmed'
              : 'proposed'
        const keepAppt = withAppt || form.status === 'done'
        const fields = {
            problem,
            detail: form.detail.trim(),
            status: form.status,
            admin_note: form.admin_note.trim(),
            image_path,
            category: form.category,
            urgency: form.urgency,
            appointment_date: keepAppt && form.appointment_date ? form.appointment_date : null,
            appointment_period: keepAppt && form.appointment_date ? form.appointment_period : null,
            appointment_state: keepAppt && form.appointment_date ? appointmentState : null,
            technician: form.technician.trim(),
            cost,
            // แอดมินแจ้งเอง (ห้องว่าง ไม่มีผู้เช่า) หอพักรับผิดชอบค่าใช้จ่ายเสมอ
            cost_payer: isNew || !editing.user_id ? 'owner' : form.cost_payer,
            // ให้ผู้เช่าเลือกเวลาใหม่: ล้างเวลาที่ผู้เช่าเลือกไว้ (ฐานข้อมูลจะแจ้งเตือนผู้เช่าให้เลือกใหม่)
            ...(askNewTime && { available_slots: [], allow_entry: false }),
        }
        // เรื่องที่ผู้เช่าแจ้ง: ไม่ส่งปัญหา รายละเอียด และรูปไปแก้ (ฐานข้อมูลไม่ให้แอดมินแก้ส่วนนี้)
        if (!isNew && editing.user_id) {
            delete fields.problem
            delete fields.detail
            delete fields.image_path
        }
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

    // ค่าที่ใช้ตอนแสดงผล: เป็นรายการใหม่ไหม, รูปเดิมที่ยังแสดงในฟอร์ม, และรายการแท็บ (ทั้งหมด + ทุกสถานะ)
    const isNew = editing === 'new'
    const existingPath = editing && !isNew && !removeExisting ? editing.image_path : null
    // เสร็จสิ้นแล้ว = ดูได้อย่างเดียว แก้อะไรไม่ได้อีก (ฐานข้อมูลล็อกไว้ด้วย)
    const locked = Boolean(editing) && !isNew && editing.status === 'done'
    const fieldLocked = saving || locked
    // มีผู้เช่าเป็นเจ้าของเรื่องไหม (แอดมินแจ้งเองสำหรับห้องว่าง = ไม่มี) ใช้ซ่อนส่วนที่เกี่ยวกับผู้เช่า
    const hasTenant = Boolean(editing) && !isNew && Boolean(editing.user_id)
    // การ์ดสรุปด้านบน (ไม่แสดงสถานะยกเลิก แต่ยังนับรวมใน "ทั้งหมด")
    const tabs = [{ key: 'all', label: 'ทั้งหมด' }, ...repairStatusKeys.filter((k) => k !== 'cancelled').map((k) => ({ key: k, label: repairStatuses[k].label }))]
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
                <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-card p-6 md:p-8 max-w-3xl mx-auto border border-line flex flex-col gap-5">
                    {/* ===== ฟอร์มเพิ่ม/แก้ไขรายการแจ้งซ่อม ===== */}
                    {/* หัวฟอร์ม: ชื่อฟอร์ม + ป้ายสถานะปัจจุบัน (เฉพาะตอนแก้ไข) */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-primary-dark">{isNew ? 'แจ้งซ่อมใหม่' : 'จัดการรายการแจ้งซ่อม'}</h2>
                        {!isNew && <RepairStatusBadge status={editing.status} />}
                    </div>
                    {locked && (
                        <p className="-mt-2 text-sm text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                            <Icon name="checkCircle" className="w-4 h-4 shrink-0" />
                            เรื่องนี้ซ่อมเสร็จสิ้นแล้ว ดูข้อมูลได้อย่างเดียว แก้ไขไม่ได้
                        </p>
                    )}

                    {/* เลือกห้อง (แก้ได้เฉพาะรายการใหม่) และช่องแสดงผู้แจ้ง/วันที่แจ้ง (อ่านอย่างเดียว) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-muted mb-1">ห้อง</label>
                            <select value={form.room} onChange={set('room')} disabled={!isNew || saving} className={inputClass} required>
                                <option value="">เลือกห้อง</option>
                                {/* แจ้งซ่อมใหม่เลือกได้เฉพาะห้องว่าง (ห้องที่มีผู้เช่า ให้ผู้เช่าแจ้งเอง) */}
                                {rooms.map((n) => (
                                    <option key={n} value={n} disabled={isNew && Boolean(tenantOf(n))}>
                                        {n}{tenantOf(n) ? ` — ${tenantOf(n).name}` : ' (ว่าง)'}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-muted mb-1">{isNew ? 'ผู้แจ้ง' : 'วันที่แจ้ง'}</label>
                            <input
                                disabled
                                value={isNew ? (form.room ? 'ผู้ดูแล' : '-') : formatTimeDate(editing.created_at)}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    {/* ประเภท และวันที่เสร็จสิ้น (อ่านอย่างเดียว) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-muted mb-1">ประเภท</label>
                            <select value={form.category} onChange={set('category')} disabled={fieldLocked} className={inputClass}>
                                {Object.entries(repairCategories).map(([k, label]) => (
                                    <option key={k} value={k}>{label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-muted mb-1">วันที่เสร็จสิ้น</label>
                            <input disabled value={!isNew && editing.status === 'done' ? formatTimeDate(editing.completed_at) : '-'} className={inputClass} />
                        </div>
                    </div>

                    {/* ข้อมูลจากผู้เช่า: เวลาที่สะดวก เบอร์ติดต่อ และข้อความล่าสุด (แอดมินแจ้งเอง ไม่มีผู้เช่า = ไม่แสดง) */}
                    {hasTenant && (
                        <div className="rounded-xl bg-sand/60 border border-line p-4 flex flex-col gap-3">
                            <div className="text-sm font-medium text-primary-dark">เวลาที่ผู้เช่าสะดวกให้ช่างเข้า</div>
                            <SlotList
                                slots={editing.available_slots}
                                allowEntry={editing.allow_entry}
                                note={editing.availability_note}
                            />
                            {/* ช่างไม่ว่างตามเวลาที่ผู้เช่าเลือก: กดแล้วบันทึก = ล้างเวลาเดิมและแจ้งเตือนให้ผู้เช่าเลือกเวลาใหม่ */}
                            {(editing.available_slots?.length > 0 || editing.allow_entry) && ['pending', 'in_progress'].includes(editing.status) &&
                                (askNewTime ? (
                                    <div className="self-start flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-amber-50 border border-amber-200 text-amber-900">
                                        <Icon name="alert" className="w-4 h-4 shrink-0" />
                                        <span>บันทึกแล้วจะแจ้งให้ผู้เช่าเลือกเวลาใหม่</span>
                                        <button type="button" onClick={() => {
                                                setAskNewTime(false)
                                                setForm((f) => ({ ...f, status: editing.status, appointment_date: editing.appointment_date ?? '', appointment_period: normalizePeriod(editing.appointment_period) }))
                                            }}
                                            disabled={saving}
                                            className="text-xs text-primary hover:underline"
                                        >
                                            ยกเลิก
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAskNewTime(true)
                                            setForm((f) => ({ ...f, status: 'pending', appointment_date: '', appointment_period: '' }))
                                        }}
                                        disabled={saving}
                                        className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-white border border-line text-primary-dark hover:bg-mist/40"
                                    >
                                        <Icon name="calendar" className="w-4 h-4" />
                                        ให้ผู้เช่าเลือกเวลาใหม่
                                    </button>
                                ))}
                            {editing.contact_phone && (
                                <a href={`tel:${editing.contact_phone}`} className="text-sm text-primary hover:underline flex items-center gap-1.5">
                                    <Icon name="phone" className="w-4 h-4" />
                                    โทรหาผู้เช่า {editing.contact_phone}
                                </a>
                            )}
                            {editing.tenant_message && (
                                <div className="rounded-lg bg-amber-50 border-l-4 border-amber-400 px-3 py-2 text-sm">
                                    <div className="text-xs font-semibold text-amber-800">ข้อความล่าสุดจากผู้เช่า</div>
                                    <p className="whitespace-pre-line wrap-break-word">{editing.tenant_message}</p>
                                </div>
                            )}
                            {editing.reopen_count > 0 && <p className="text-xs text-red-600">ผู้เช่าแจ้งว่ายังไม่หาย {editing.reopen_count} ครั้ง</p>}
                            {editing.status === 'done' && (
                                <p className={`text-xs ${editing.tenant_confirmed_at ? 'text-emerald-700' : 'text-muted'}`}>
                                    {editing.tenant_confirmed_at ? `ผู้เช่ายืนยันว่าใช้งานได้ปกติเมื่อ ${formatDateTime(editing.tenant_confirmed_at)}` : 'รอผู้เช่าตรวจสอบและยืนยันผลการซ่อม'}
                                </p>
                            )}
                        </div>
                    )}

                    {/* ชื่อปัญหา (บังคับกรอก) */}
                    <div>
                        <label className="block text-sm text-muted mb-1">ปัญหา{hasTenant && !locked && <span className="text-xs"> (ผู้เช่าเป็นผู้แจ้ง แก้ไขไม่ได้)</span>}</label>
                        <input required maxLength={200} value={form.problem} onChange={set('problem')} disabled={fieldLocked || hasTenant} placeholder="เช่น หลอดไฟขาด" className={inputClass} />
                    </div>

                    {/* รายละเอียดเพิ่มเติม */}
                    <div>
                        <label className="block text-sm text-muted mb-1">รายละเอียดเพิ่มเติม</label>
                        <textarea rows={3} maxLength={2000} value={form.detail} onChange={set('detail')} disabled={fieldLocked || hasTenant} placeholder="อธิบายอาการ ตำแหน่ง หรือช่วงเวลาที่สะดวกให้ช่างเข้า" className={inputClass} />
                    </div>

                    {/* เปลี่ยนสถานะงานซ่อม (ผู้เช่าจะได้รับแจ้งเตือนเมื่อสถานะเปลี่ยน) */}
                    <div>
                        <label className="block text-sm text-muted mb-1">สถานะ</label>
                        <select value={form.status} onChange={(e) => changeStatus(e.target.value)} disabled={fieldLocked} className={inputClass}>
                            {/* เลือก "ยกเลิก" ไม่ได้ (ถ้ารายการอยู่ในสถานะนั้น ยังแสดงค่าปัจจุบันไว้แต่กดเลือกไม่ได้) */}
                            {repairStatusKeys.map((k) => {
                                const blocked = k === 'cancelled'
                                if (blocked && form.status !== k) return null
                                return (
                                    <option key={k} value={k} disabled={blocked} hidden={blocked}>{repairStatuses[k].label}</option>
                                )
                            })}
                        </select>
                    </div>

                    {/* เสร็จสิ้น: ค่าใช้จ่าย ผู้รับผิดชอบค่าใช้จ่าย และชื่อช่าง */}
                    {form.status === 'done' && (
                        <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm text-muted mb-1">ค่าใช้จ่าย (บาท)</label>
                                    <input type="number" min="0" step="0.01" value={form.cost} onChange={set('cost')} disabled={fieldLocked} placeholder="0" className={inputClass} />
                                </div>
                                <div>
                                    <label className="block text-sm text-muted mb-1">ผู้รับผิดชอบค่าใช้จ่าย</label>
                                    {/* แอดมินแจ้งเอง (ไม่มีผู้เช่า): หอพักรับผิดชอบเสมอ แสดงเป็นช่องอ่านอย่างเดียว */}
                                    {hasTenant ? (
                                        <select value={form.cost_payer} onChange={set('cost_payer')} disabled={fieldLocked} className={inputClass}>
                                            <option value="owner">หอพัก (ของเสื่อมตามอายุการใช้งาน)</option>
                                            <option value="tenant">ผู้เช่า (ทำเสียหายเอง)</option>
                                        </select>
                                    ) : (
                                        <input disabled value="หอพัก (ของเสื่อมตามอายุการใช้งาน)" className={inputClass} />
                                    )}
                                </div>
                            </div>
                            <input maxLength={100} value={form.technician} onChange={set('technician')} disabled={fieldLocked} placeholder="ชื่อช่าง (ถ้ามี)" className={inputClass} />
                        </div>
                    )}

                    {/* ค่าซ่อมที่ผู้เช่าต้องชำระ: ตรวจสลิป ยืนยัน/ปฏิเสธ (มีสลิปรอตรวจหรือชำระแล้ว แก้ยอดค่าใช้จ่ายไม่ได้) */}
                    {!isNew && <AdminRepairPayment repair={editing} />}

                    {/* คำแนะนำเมื่อเลือกสถานะที่ล้างนัดเดิม */}
                    {!isNew && editing.appointment_date && (form.status === 'pending' || form.status === 'cancelled') && editing.status === 'in_progress' && (
                        <p className="-mt-2 text-xs text-muted">
                            นัดเดิม ({formatSlot(editing.appointment_date, editing.appointment_period)}) จะถูกยกเลิก
                            {form.status === 'pending' && ' ใช้กรณีช่างไปแล้วไม่พบผู้เช่า หรือต้องเลื่อนนัด'}
                        </p>
                    )}

                    {/* ข้อความจากแอดมินถึงผู้เช่า (แอดมินแจ้งเองสำหรับห้องว่าง ไม่มีผู้เช่า จึงไม่แสดง) */}
                    {hasTenant && (
                        <div>
                            <label className="block text-sm text-muted mb-1">หมายเหตุถึงผู้เช่า (ผู้เช่าจะเห็นข้อความนี้)</label>
                            <textarea rows={2} maxLength={1000} value={form.admin_note} onChange={set('admin_note')} disabled={fieldLocked} placeholder={form.status === 'cancelled' ? 'เหตุผลที่ยกเลิก เช่น ซ่อมเรียบร้อยแล้วจากการแจ้งครั้งก่อน' : 'เช่น รออะไหล่ 2-3 วัน, ช่างจะโทรหาก่อนเข้า 30 นาที'} className={inputClass} />
                        </div>
                    )}

                    {/* แนบ/เปลี่ยน/นำรูปออก (นำออกแล้วจะลบรูปเดิมตอนบันทึก) */}
                    <div>
                        <label className="block text-sm text-muted mb-1">รูปภาพ</label>
                        {/* เรื่องที่ผู้เช่าแจ้ง หรือเสร็จสิ้นแล้ว: ดูรูปได้อย่างเดียว */}
                        {locked || hasTenant ? (
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
                                onPick={(f) => setFile(f)}
                                onClear={() => {
                                    setFile(null)
                                    setRemoveExisting(true)
                                }}
                            />
                        )}
                    </div>

                    {/* ข้อความ error ของฟอร์ม */}
                    {formError && <p className="text-sm text-red-600">{formError}</p>}

                    {/* ปุ่มด้านล่าง: ลบ (เฉพาะตอนแก้ไข) ทางซ้าย, ยกเลิก/บันทึก ทางขวา */}
                    <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4 pt-4 border-t border-line">
                        {!isNew ? (
                            <button type="button" disabled={saving} onClick={() => setConfirmDelete(true)} className="border border-red-500 text-red-600 hover:bg-red-50 rounded-xl px-8 py-2.5 text-sm font-semibold w-full sm:w-auto">
                                ลบ
                            </button>
                        ) : (
                            <div />
                        )}
                        <div className="flex gap-3 w-full sm:w-auto justify-end">
                            <button type="button" onClick={close} disabled={saving} className="border border-line text-muted hover:bg-sand rounded-xl px-8 py-2.5 text-sm font-semibold flex-1 sm:flex-initial">
                                {locked ? 'ปิด' : 'ยกเลิก'}
                            </button>
                            {!locked && (
                                <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark text-white rounded-xl px-10 py-2.5 text-sm font-semibold shadow-card flex-1 sm:flex-initial">
                                    {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            ) : (
                <>
                    {/* ===== หน้ารายการแจ้งซ่อม ===== */}
                    {/* การ์ดสรุปจำนวนตามสถานะ กดเพื่อกรองรายการ (ทำหน้าที่เป็นแท็บ) */}
                    {/* นัดซ่อมที่จะถึง (ตารางงานช่าง) */}
                    {upcoming.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-card p-5">
                            <h2 className="font-medium text-primary-dark mb-3 flex items-center gap-2">
                                <Icon name="calendar" className="w-5 h-5" />
                                นัดซ่อมที่จะถึง
                                <span className="text-sm font-normal text-muted">({upcoming.length})</span>
                            </h2>
                            <div className="flex flex-col divide-y divide-line">
                                {upcoming.slice(0, 8).map((r) => {
                                    const isToday = r.appointment_date === todayIso()
                                    return (
                                        <button key={r.id} onClick={() => openEdit(r)} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left hover:bg-sand/50 rounded-lg px-2">
                                            <span className={`text-sm font-medium whitespace-nowrap ${isToday ? 'text-red-600' : 'text-ink'}`}>
                                                {isToday && 'วันนี้ · '}
                                                {formatSlot(r.appointment_date, r.appointment_period)}
                                            </span>
                                            <span className="inline-block px-2 py-0.5 rounded-lg bg-mist/60 text-primary-dark text-sm font-semibold">{r.room}</span>
                                            <span className="text-sm text-ink flex-1 min-w-32">{r.problem}</span>
                                            {r.allow_entry && <span className="text-xs text-emerald-700">เข้าห้องได้</span>}
                                            {r.appointment_state === 'proposed' && <span className="text-xs font-medium text-amber-700">รอผู้เช่ายืนยัน</span>}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {tabs.map((t) => {
                            const active = activeTab === t.key
                            const meta = summaryMeta[t.key]
                            return (
                                <button
                                    key={t.key}
                                    onClick={() => setActiveTab(t.key)}
                                    aria-pressed={active}
                                    className={`text-left rounded-2xl p-4 bg-white shadow-card border-2 transition ${active ? 'border-primary' : 'border-transparent hover:border-mist'}`}
                                >
                                    <div className="flex items-center justify-between text-sm text-muted">
                                        <span>{t.label}</span>
                                        <span className={`grid place-items-center w-8 h-8 rounded-lg ${meta.tone}`}><Icon name={meta.icon} className="w-[18px] h-[18px]" /></span>
                                    </div>
                                    <div className="mt-2 flex items-baseline gap-2">
                                        <span className="text-2xl font-semibold text-primary-dark">{counts[t.key] ?? 0}</span>
                                        <span className="text-xs text-muted">รายการ</span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    {/* กล่องรายการ */}
                    <div className="bg-white rounded-2xl shadow-card p-5">
                        {/* หัวกล่อง: จำนวนรายการที่แสดง + ช่องค้นหา */}
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
                                <div className="flex items-center gap-2 border border-line bg-sand/50 rounded-xl px-3 py-1.5 w-48 max-w-full focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/15 focus-within:bg-white">
                                    <Icon name="search" className="w-4 h-4 text-muted" />
                                    <input
                                        type="search"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="ค้นหาห้อง"
                                        className="outline-none w-full bg-transparent text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* กำลังโหลด/โหลดไม่สำเร็จ แสดงข้อความ ไม่งั้นแสดงรายการ */}
                        {loading || loadError ? (
                            loading ? <SkeletonTable rows={6} cols={5} /> : <p className="text-center py-12 text-red-600">{loadError}</p>
                        ) : (
                            <div className="xl:overflow-auto xl:max-h-[36rem] xl:rounded-xl xl:border xl:border-line xl:shadow-sm">
                                {/* จอใหญ่ (xl ขึ้นไป): ตาราง กดแถวไหนก็ได้เพื่อเปิดจัดการ รายการรอดำเนินการพื้นสีฟ้า */}
                                <table className="hidden xl:table w-full min-w-[56rem] border-collapse text-sm">
                                    <thead className="sticky top-0 z-10">
                                        <tr className="bg-primary-dark text-white">
                                            <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center w-12">#</th>
                                            <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">ห้อง</th>
                                            <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-left">ปัญหา</th>
                                            <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">วันที่แจ้ง</th>
                                            <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">วันที่เสร็จสิ้น</th>
                                            <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">ค่าซ่อม</th>
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
                                                <td className="px-3 py-3 border-x border-line/60 text-center">
                                                    <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold">{r.room}</span>
                                                </td>
                                                <td className="px-3 py-3 border-x border-line/60 font-medium text-ink">
                                                    <span className="inline-flex items-center gap-2">
                                                        {r.problem}
                                                        {r.image_path && <Icon name="image" className="w-4 h-4 text-secondary" />}
                                                        <UrgencyBadge urgency={r.urgency} />
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 border-x border-line/60 text-center text-muted whitespace-nowrap">{formatThaiDate(r.created_at)}</td>
                                                <td className="px-3 py-3 border-x border-line/60 text-center text-muted whitespace-nowrap">
                                                    {r.status === 'done' && r.completed_at ? formatThaiDate(r.completed_at) : '-'}
                                                </td>
                                                <td className="px-3 py-3 border-x border-line/60 text-center text-muted whitespace-nowrap"><RepairCost repair={r} /></td>
                                                <td className="px-3 py-3 border-x border-line/60 text-center"><RepairStatusBadge status={r.status} /><PayState state={payState(r)} /></td>
                                                <td className="border-x border-line/60 px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <button onClick={() => openEdit(r)} className="px-4 py-1 rounded-lg text-sm bg-mist/60 text-primary-dark hover:bg-mist">จัดการ</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {/* จอเล็ก/กลาง: แสดงเป็นการ์ดแทนตาราง */}
                                <div className="xl:hidden grid gap-3 md:grid-cols-2">
                                    {visible.map((r) => (
                                        <div
                                            key={r.id}
                                            className={`rounded-2xl border border-line p-4 flex flex-col gap-3 ${r.status === 'pending' ? 'bg-sky-50/60' : 'bg-white'}`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold text-center">{r.room}</span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-medium text-ink">{r.problem}</div>
                                                    <div className="text-xs text-muted">แจ้ง {formatThaiDate(r.created_at)}</div>
                                                    {r.status === 'done' && r.completed_at && (
                                                        <div className="text-xs text-emerald-700">เสร็จสิ้น {formatThaiDate(r.completed_at)}</div>
                                                    )}
                                                    <RepairCost repair={r} inline />
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <RepairStatusBadge status={r.status} />
                                                    <PayState state={payState(r)} />
                                                    <UrgencyBadge urgency={r.urgency} />
                                                </div>
                                            </div>
                                            <button onClick={() => openEdit(r)} className="py-2 rounded-xl text-sm bg-mist/60 text-primary-dark hover:bg-mist">จัดการเรื่องนี้</button>
                                        </div>
                                    ))}
                                </div>
                                {/* ไม่มีรายการ: แยกข้อความระหว่าง "ยังไม่มีเลย" กับ "ค้นหา/กรองแล้วไม่เจอ" */}
                                {visible.length === 0 && (
                                    <div className="py-12 text-center text-muted">
                                        <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-full bg-sand text-muted"><Icon name="wrench" className="w-6 h-6" /></span>
                                        {repairs.length === 0 ? 'ยังไม่มีรายการแจ้งซ่อม' : 'ไม่พบรายการที่ตรงกับเงื่อนไข'}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
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
