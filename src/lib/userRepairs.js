import { supabase } from './supabaseClient'
import { upcomingSlots, validateAvailability } from './repairs'

// ตรรกะของหน้าแจ้งซ่อมฝั่งผู้เช่า (pages/UserRepairsPage.jsx) แยกไว้ให้ทดสอบได้และให้หน้าจอสั้นลง

// ค่าเริ่มต้นของฟอร์มแจ้งซ่อมใหม่
export const emptyForm = {
    problem: '',
    detail: '',
    // ยังไม่เลือก ผู้เช่าต้องเลือกประเภทเองก่อนส่ง
    category: '',
    allow_entry: false,
    slots: [],
}

// ฟอร์มแก้ไข: เติมข้อมูลเดิมของรายการลงฟอร์ม (เหลือเฉพาะช่วงเวลาที่ยังไม่ผ่านไป)
export const formFromRepair = (repair) => ({
    problem: repair.problem,
    detail: repair.detail,
    category: repair.category ?? 'other',
    allow_entry: repair.allow_entry ?? false,
    slots: upcomingSlots(repair.available_slots),
})

// ผู้ดูแลขอให้เลือกเวลาใหม่ (ล้างเวลาที่เลือกไว้ เช่น ช่างไม่ว่าง)
export const needsNewTime = (r) => r.status === 'pending' && (r.available_slots ?? []).length === 0 && !r.allow_entry

// รายการที่ผู้เช่าต้องทำอะไรต่อ: ยืนยันวันนัดที่ผู้ดูแลเสนอ หรือยืนยันผลการซ่อม
export const needsAction = (r) => (r.status === 'in_progress' && r.appointment_state === 'proposed') || (r.status === 'done' && !r.tenant_confirmed_at)

// ตรวจฟอร์มแจ้งซ่อมก่อนส่ง คืนข้อความ error ภาษาไทย หรือ '' ถ้าผ่าน
export function validateRepairSubmit(form) {
    if (!form.category) return 'กรุณาเลือกประเภทงานซ่อม'
    if (!form.problem.trim()) return 'กรุณาระบุปัญหาที่พบ'
    // ต้องบอกว่าช่างเข้าได้เมื่อไร (ยกเว้นอนุญาตให้เข้าห้องได้แม้ไม่อยู่)
    return validateAvailability({ slots: form.slots, allowEntry: form.allow_entry, urgency: 'normal' }) || ''
}

// ฟิลด์ที่จะบันทึกลงตาราง repairs (รายการใหม่ใช้ insert รายการเดิมใช้ update)
export const repairSubmitFields = (form, imagePath) => ({
    problem: form.problem.trim(),
    detail: form.detail.trim(),
    image_path: imagePath,
    category: form.category,
    allow_entry: form.allow_entry,
    available_slots: form.slots,
})

// ข้อมูลตั้งต้นก่อนโหลดเสร็จ
export const initialData = { repairs: [], payments: [], loading: true, loadError: '' }

// ดึงรายการแจ้งซ่อมของผู้ใช้ (RLS ให้อ่านได้เฉพาะรายการของตัวเองอยู่แล้ว)
export async function fetchRepairs(userId) {
    const [{ data, error }, paymentsRes] = await Promise.all([
        supabase.from('repairs').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        // สลิปค่าซ่อมที่ส่งแล้ว (รอตรวจ/ชำระแล้ว) ใช้บอกสถานะการชำระในรายการ
        supabase.from('repair_payments').select('repair_id, status').eq('user_id', userId).in('status', ['review', 'paid']),
    ])
    if (error) return { ...initialData, loading: false, loadError: `โหลดข้อมูลไม่สำเร็จ: ${error.message}` }
    return { repairs: data, payments: paymentsRes.error ? [] : paymentsRes.data, loading: false, loadError: '' }
}
