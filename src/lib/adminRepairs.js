import { formatSlot, isInSlots, isValidPeriod, normalizePeriod, todayIso, validateTechnician } from './repairs'
import { selectAll } from './selectAll'
import { supabase } from './supabaseClient'

// ตรรกะของหน้าแจ้งซ่อมฝั่งแอดมิน (components/AdminRepairs.jsx) แยกไว้ให้ทดสอบได้และให้หน้าจอสั้นลง

// ค่าเริ่มต้นของฟอร์มแจ้งซ่อมใหม่ (สถานะเริ่มที่ "รอดำเนินการ")
export const emptyForm = {
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
    technician_phone: '',
    confirmed: false,
    // ปักหมุดอยู่ไหม (ปัก/เลิกปักด้วยปุ่มหมุดในหน้ารายการ ฟอร์มส่งค่าเดิมกลับไป)
    pinned: false,
    // ค่าใช้จ่ายและผู้รับผิดชอบ
    cost: '',
    cost_payer: 'owner',
}

// ฟอร์มแก้ไข: เติมข้อมูลเดิมของรายการลงฟอร์ม
export const formFromRepair = (item) => ({
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
    technician_phone: item.technician_phone ?? '',
    pinned: Boolean(item.pinned),
    confirmed: item.appointment_state === 'confirmed',
    cost: Number(item.cost) > 0 ? String(item.cost) : '',
    cost_payer: item.cost_payer ?? 'owner',
})

// เวลา วัน เดือน ปี เช่น "11:15 น. 16 ต.ค. 69"
export const formatTimeDate = (iso) => {
    if (!iso) return '-'
    const d = new Date(iso)
    const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    const date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
    return `${time} น. ${date}`
}

// เรียงเลขห้องแบบตัวเลข (เช่น 101 < 201 < 1001)
const byRoom = (a, b) => a.localeCompare(b, undefined, { numeric: true })

// ข้อมูลตั้งต้นก่อนโหลดเสร็จ: รายการแจ้งซ่อม เลขห้อง ผู้เช่า และสถานะการโหลด
export const initialData = { repairs: [], rooms: [], tenants: [], payments: [], loading: true, loadError: '' }

// ดึงข้อมูลทั้งหมดที่หน้านี้ใช้ (ไม่แตะ state เพื่อเรียกใช้ได้ทั้งใน effect และหลังบันทึก)
export async function fetchRepairsData() {
    // ดึงพร้อมกัน: แจ้งซ่อม (ใหม่สุดก่อน), เลขห้องทั้งหมด, ผู้เช่าของแต่ละห้อง, สถานะการชำระค่าซ่อม
    const [repairsRes, roomsRes, tenantsRes, paymentsRes] = await Promise.all([
        selectAll(() => supabase.from('repairs').select('*').order('created_at', { ascending: false }).order('id')),
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

// ค่าใช้จ่ายในฟอร์ม (ช่องว่าง = 0)
export const costOf = (form) => (form.cost === '' ? 0 : Number(form.cost))

// ตรวจฟอร์มก่อนบันทึก คืนข้อความ error ภาษาไทย หรือ '' ถ้าผ่าน
// editing = 'new' หรือรายการที่กำลังแก้ไข, slotChoices = ช่วงเวลาที่ผู้เช่าสะดวกและยังไม่ผ่านไป
export function validateRepairForm({ form, editing, slotChoices }) {
    const isNew = editing === 'new'
    if (!form.room) return 'กรุณาเลือกห้อง'
    if (!form.problem.trim()) return 'กรุณาระบุปัญหา'
    if (!isNew && editing.status === 'in_progress' && form.status === 'pending') return 'เรื่องที่กำลังดำเนินการแล้ว เปลี่ยนกลับเป็นรอดำเนินการไม่ได้'
    if ((isNew || editing.status === 'pending') && form.status === 'done') return 'เรื่องที่รอดำเนินการ ต้องเปลี่ยนเป็น "กำลังดำเนินการ" ก่อน จึงเปลี่ยนเป็นเสร็จสิ้นได้'
    // กำลังดำเนินการ: ต้องเลือกวันนัดจากช่วงที่ผู้เช่าส่งมาก่อน ถ้าทุกช่วงผ่านไปแล้ว ให้ผู้เช่าเลือกใหม่
    // (ผู้เช่าไม่ได้เลือกเวลา เช่น อนุญาตให้เข้าห้องได้เลย หรือแอดมินแจ้งซ่อมเอง = ไม่มีวันนัด)
    const apptChanged = isNew || form.appointment_date !== (editing.appointment_date ?? '') || form.appointment_period !== normalizePeriod(editing.appointment_period)
    if (form.status === 'in_progress' && !isNew && editing.status !== 'in_progress' && !form.appointment_date && editing.available_slots?.length > 0) {
        return slotChoices.length > 0
            ? 'กรุณาเลือกวันเวลานัดจากที่ผู้เช่าส่งมาก่อนเปลี่ยนเป็น "กำลังดำเนินการ"'
            : 'เวลาที่ผู้เช่าเลือกผ่านไปแล้ว กรุณากด "ให้ผู้เช่าเลือกเวลาใหม่"'
    }
    if (form.status === 'in_progress' && form.appointment_date && apptChanged) {
        if (form.appointment_date < todayIso() || !isValidPeriod(form.appointment_period)) {
            return `${formatSlot(form.appointment_date, form.appointment_period)} ผ่านไปแล้วหรือไม่ถูกต้อง กรุณากด "ให้ผู้เช่าเลือกเวลาใหม่"`
        }
    }
    // กำลังดำเนินการ: ต้องรู้ชื่อและเบอร์โทรช่าง (ผู้เช่าเห็นข้อมูลนี้ ฐานข้อมูลตรวจซ้ำอีกชั้น)
    if (form.status === 'in_progress') {
        const techError = validateTechnician(form.technician, form.technician_phone)
        if (techError) return techError
    }
    if (!(costOf(form) >= 0)) return 'ค่าใช้จ่ายต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป'
    return ''
}

// ช่วงที่ผู้เช่าส่งมาของเรื่องที่กำลังดำเนินการ/เสร็จสิ้นแล้ว พร้อมบอกว่าช่วงไหนเป็นวันนัด (chosen)
// วันนัดไม่อยู่ในรายการ (เช่น ผู้ดูแลนัดเองตอนผู้เช่าอนุญาตให้เข้าห้อง) = เพิ่มต่อท้าย คืน null ถ้าไม่มีวันนัดหรือสถานะยังไม่ถึง
export function lockedSlotsOf(editing) {
    if (!editing || editing === 'new' || !['in_progress', 'done'].includes(editing.status) || !editing.appointment_date) return null
    const apptPeriod = normalizePeriod(editing.appointment_period)
    const list = (editing.available_slots ?? []).map((s) => ({
        ...s,
        chosen: s.date === editing.appointment_date && s.period === apptPeriod,
    }))
    return list.some((s) => s.chosen) ? list : [...list, { date: editing.appointment_date, period: apptPeriod, chosen: true }]
}

// ฟิลด์ที่จะบันทึกลงตาราง repairs (รายการใหม่ใช้ insert รายการเดิมใช้ update)
// tenant = ผู้เช่าของห้องที่เลือก (ใช้กับรายการใหม่), imagePath = รูปที่รายการนี้จะใช้ (ใหม่ / เดิม / null)
export function repairFields({ form, editing, tenant, imagePath, askNewTime }) {
    const isNew = editing === 'new'
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
        problem: form.problem.trim(),
        detail: form.detail.trim(),
        status: form.status,
        admin_note: form.admin_note.trim(),
        image_path: imagePath,
        category: form.category,
        urgency: form.urgency,
        appointment_date: keepAppt && form.appointment_date ? form.appointment_date : null,
        appointment_period: keepAppt && form.appointment_date ? form.appointment_period : null,
        appointment_state: keepAppt && form.appointment_date ? appointmentState : null,
        technician: form.technician.trim(),
        technician_phone: form.technician_phone.trim(),
        // เสร็จสิ้น ไม่ต้องปักหมุดอีก (ฐานข้อมูลเอาออกให้ด้วย)
        pinned: form.status === 'done' ? false : form.pinned,
        cost: costOf(form),
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
    return fields
}
