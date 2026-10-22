// ประวัติการแก้ไข (supabase/migrations/20261022000000_initial_schema.sql (ส่วน audit)): ชื่อเหตุการณ์ที่แสดง กลุ่มกรอง และการแปลงรายละเอียดให้อ่านง่าย

// ป้ายของ action ในตาราง audit_log
export const auditActions = {
    'invoice.create': { label: 'สร้างใบแจ้งหนี้', tone: 'bg-sky-50 text-sky-800 ring-sky-200' },
    'invoice.edit_total': { label: 'แก้ยอดใบแจ้งหนี้', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
    'invoice.status': { label: 'เปลี่ยนสถานะบิล', tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
    'invoice.delete': { label: 'ลบใบแจ้งหนี้', tone: 'bg-red-50 text-red-800 ring-red-200' },
    'payment.confirm': { label: 'ยืนยันรับเงิน', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
    'refund.done': { label: 'โอนคืนยอดเกิน', tone: 'bg-sky-50 text-sky-800 ring-sky-200' },
    'repair.cost': { label: 'แก้ค่าซ่อม', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
    'repair_payment.paid': { label: 'ยืนยันรับค่าซ่อม', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
    'repair_payment.rejected': { label: 'ปฏิเสธสลิปค่าซ่อม', tone: 'bg-red-50 text-red-800 ring-red-200' },
    'tenant.create': { label: 'เพิ่มผู้เช่า', tone: 'bg-sky-50 text-sky-800 ring-sky-200' },
    'tenant.delete': { label: 'ลบผู้เช่า', tone: 'bg-red-50 text-red-800 ring-red-200' },
    'settings.update': { label: 'แก้การตั้งค่า', tone: 'bg-violet-50 text-violet-800 ring-violet-200' },
    'contract.renew': { label: 'ต่อสัญญา', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
    'announcement.create': { label: 'ลงประกาศ', tone: 'bg-sky-50 text-sky-800 ring-sky-200' },
    'announcement.update': { label: 'แก้ประกาศ', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
    'announcement.delete': { label: 'ลบประกาศ', tone: 'bg-red-50 text-red-800 ring-red-200' },
}

// action ที่ไม่รู้จัก (เพิ่มในฐานข้อมูลภายหลัง) แสดงชื่อ action ตรง ๆ
export const auditActionOf = (action) => auditActions[action] ?? { label: action, tone: 'bg-slate-100 text-slate-700 ring-slate-200' }

// กลุ่มสำหรับตัวกรอง: value -> รายชื่อตาราง (entity) ที่รวมอยู่
export const auditGroups = [
    { value: 'all', label: 'ทั้งหมด', entities: null },
    { value: 'money', label: 'ใบแจ้งหนี้และการรับเงิน', entities: ['invoices', 'invoice_payments'] },
    { value: 'repairs', label: 'ค่าซ่อม', entities: ['repairs', 'repair_payments'] },
    { value: 'tenants', label: 'ผู้เช่า', entities: ['tenants'] },
    { value: 'announcements', label: 'ประกาศ', entities: ['announcements'] },
    { value: 'settings', label: 'การตั้งค่า', entities: ['app_settings'] },
]

// ชื่อช่องในตั้งค่า (คอลัมน์ app_settings) เป็นภาษาไทย
export const settingLabels = {
    apartment_name: 'ชื่อหอพัก',
    apartment_name_en: 'ชื่อภาษาอังกฤษ',
    address: 'ที่อยู่',
    phone: 'เบอร์โทร',
    email: 'อีเมล',
    bank_name: 'ธนาคาร',
    bank_account: 'เลขที่บัญชี',
    bank_holder: 'ชื่อบัญชี',
    promptpay_id: 'พร้อมเพย์',
    due_day: 'วันครบกำหนดชำระ',
    rate_water: 'ค่าน้ำต่อหน่วย',
    rate_electric: 'ค่าไฟต่อหน่วย',
    common_fee: 'ค่าส่วนกลาง',
    slip_verify_mode: 'โหมดตรวจสลิป',
    late_fee_per_day: 'ค่าปรับต่อวัน',
    late_fee_grace_days: 'วันผ่อนผัน',
    late_fee_cap: 'เพดานค่าปรับ',
}

// แสดงค่าใน detail ให้อ่านง่าย (null/ว่างเป็น "ว่าง")
const show = (v) => (v === null || v === undefined || v === '' ? 'ว่าง' : typeof v === 'object' ? JSON.stringify(v) : String(v))

// แถวรายละเอียดของเหตุการณ์ สำหรับแสดงเมื่อกดดู: [[หัวข้อ, ค่า], ...]
// การตั้งค่าแสดงเป็น "ชื่อช่อง: ค่าเดิม → ค่าใหม่" เหตุการณ์อื่นแสดงทีละคีย์
export function auditDetailRows(entry) {
    const detail = entry.detail ?? {}
    if (entry.action === 'settings.update') {
        return Object.entries(detail).map(([key, change]) => [settingLabels[key] ?? key, `${show(change?.old)} → ${show(change?.new)}`])
    }
    // แก้ประกาศ: "หัวข้อ: ค่าเดิม → ค่าใหม่" เหมือนการตั้งค่า
    if (entry.action === 'announcement.update') {
        const labels = { title: 'หัวข้อ', important: 'ประกาศสำคัญ' }
        return Object.entries(detail).map(([key, change]) => [labels[key] ?? key, `${show(change?.old)} → ${show(change?.new)}`])
    }
    const contractLabels = { previous_end_date: 'วันสิ้นสุดเดิม', new_end_date: 'วันสิ้นสุดใหม่', note: 'หมายเหตุ' }
    if (entry.action === 'contract.renew') return Object.entries(detail).map(([key, value]) => [contractLabels[key] ?? key, show(value)])
    return Object.entries(detail).map(([key, value]) => [key, show(value)])
}

// ชื่อผู้ทำรายการ: ระบบ / อีเมล / ผู้ใช้ที่ไม่ทราบอีเมล
export function auditActorName(entry) {
    if (entry.actor_role === 'system' || !entry.actor_id) return 'ระบบอัตโนมัติ'
    return entry.actor_email || (entry.actor_role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้เช่า')
}

// ค้นหาในรายการที่โหลดแล้ว (ห้อง สรุป ผู้ทำรายการ ชนิดเหตุการณ์)
export function matchesAudit(entry, keyword) {
    const k = keyword.trim().toLowerCase()
    if (!k) return true
    return [entry.room, entry.summary, auditActorName(entry), auditActionOf(entry.action).label]
        .some((v) => String(v ?? '').toLowerCase().includes(k))
}
