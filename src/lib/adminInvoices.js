import { calcInvoice, currentMonth } from './billing'
import { selectAll } from './selectAll'
import { supabase } from './supabaseClient'

// ตรรกะของหน้าใบแจ้งหนี้ฝั่งแอดมิน (components/AdminInvoices.jsx) แยกไว้ให้ทดสอบได้และให้หน้าจอสั้นลง

// อัตราค่าบริการเป็น null = ใช้ค่าเริ่มต้นจากหน้า "ตั้งค่า" (แก้ในฟอร์มเพื่อกำหนดเฉพาะใบนี้)
export const makeEmptyForm = () => ({
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

// ฟอร์มแก้ไข: เติมข้อมูลเดิมของใบแจ้งหนี้ลงฟอร์ม
export const formFromInvoice = (invoice) => ({
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

// การ์ดสรุป/แท็บกรองตามสถานะใบแจ้งหนี้
export const summaryCards = [
    { value: 'all', label: 'ทั้งหมด', icon: 'receipt', tone: 'bg-slate-100 text-slate-600' },
    { value: 'pending', label: 'รอชำระ', icon: 'clock', tone: 'bg-amber-50 text-amber-700' },
    { value: 'review', label: 'รอตรวจสอบ', short: 'รอตรวจ', icon: 'review', tone: 'bg-sky-50 text-sky-700' },
    { value: 'paid', label: 'ชำระแล้ว', icon: 'checkCircle', tone: 'bg-emerald-50 text-emerald-700' },
]

// ดึงข้อมูลทั้งหมดที่หน้านี้ใช้ (ไม่แตะ state เพื่อเรียกใช้ได้ทั้งใน effect และหลังบันทึก)
export async function fetchInvoicesData() {
    // ดึงผู้เช่า, ค่าเช่าของแต่ละห้อง และใบแจ้งหนี้ทั้งหมดพร้อมกัน
    const [tenantsRes, roomsRes, invoicesRes] = await Promise.all([
        supabase.from('tenants').select('room, name, user_id'),
        supabase.from('rooms').select('number, rent'),
        selectAll(() => supabase.from('invoices').select('*').order('created_at', { ascending: false }).order('id')),
    ])
    return { tenantsRes, roomsRes, invoicesRes }
}

// ค่าที่ใช้แสดงและคำนวณจากฟอร์ม: อัตราที่ยังไม่ได้กำหนดใช้ค่าจากหน้าตั้งค่า, ผู้เช่าของห้องที่เลือก,
// ใบที่กำลังแก้ไข (ใช้ค่าเช่าที่บันทึกไว้ในใบเดิม), ตัวเลขในฟอร์ม และยอดที่คำนวณได้
export function invoiceFormValues({ form, settings, tenants, invoices, rents, editingId }) {
    const view = {
        ...form,
        waterRate: form.waterRate ?? settings.rateWater,
        elecRate: form.elecRate ?? settings.rateElectric,
        commonFee: form.commonFee ?? settings.commonFee,
    }
    const tenant = tenants.find((t) => t.room === form.room)
    const editing = invoices.find((i) => i.id === editingId)
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
    return { view, tenant, editing, rent, numbers, calc: calcInvoice({ rent, ...numbers }) }
}

// ตรวจฟอร์มก่อนบันทึก คืนข้อความ error ภาษาไทย หรือ '' ถ้าผ่าน
// เลือกห้องและกรอกมิเตอร์ครบ, มิเตอร์ไม่ถอยหลัง, อัตราไม่ติดลบ, ห้องมีบัญชีผู้เช่า (ไม่งั้นผู้เช่าเห็นใบนี้ไม่ได้)
export function validateInvoiceForm({ form, tenant, numbers, editingId }) {
    if (!tenant || form.waterCurr === '' || form.elecCurr === '') return 'กรุณาเลือกห้องและกรอกมิเตอร์น้ำ/ไฟให้ครบ'
    if (numbers.waterCurr < numbers.waterPrev || numbers.elecCurr < numbers.elecPrev) return 'มิเตอร์ปัจจุบันต้องไม่น้อยกว่าหน่วยก่อนหน้า'
    if (numbers.waterRate < 0 || numbers.elecRate < 0 || numbers.commonFee < 0 || [numbers.waterRate, numbers.elecRate, numbers.commonFee].some(Number.isNaN)) {
        return 'อัตราค่าน้ำ ค่าไฟ และค่าส่วนกลางต้องเป็นตัวเลขที่ไม่ติดลบ'
    }
    if (!editingId && !tenant.user_id) return 'ห้องนี้ยังไม่มีบัญชีผู้เช่า จึงส่งใบแจ้งหนี้ไม่ได้'
    return ''
}

// ค่าที่บันทึกลงใบแจ้งหนี้ (ชื่อคอลัมน์ในฐานข้อมูล)
export const invoiceAmounts = (numbers, total) => ({
    water_prev: numbers.waterPrev,
    water_curr: numbers.waterCurr,
    water_rate: numbers.waterRate,
    elec_prev: numbers.elecPrev,
    elec_curr: numbers.elecCurr,
    elec_rate: numbers.elecRate,
    common_fee: numbers.commonFee,
    total,
})

// คำนวณหน่วยและค่าน้ำ/ไฟของใบแจ้งหนี้แต่ละแถวเพื่อแสดงในตาราง
export const rowCalc = (i) =>
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

// จำนวนและยอดรวมของแต่ละสถานะ (แสดงบนการ์ดสรุป) คืน { all: { count, sum }, pending: ..., review: ..., paid: ... }
export const invoiceStats = (invoices) =>
    Object.fromEntries(
        summaryCards.map((c) => {
            const list = invoices.filter((i) => c.value === 'all' || i.status === c.value)
            return [c.value, { count: list.length, sum: list.reduce((acc, i) => acc + Number(i.total), 0) }]
        })
    )

// รายการที่แสดง: กรองตามสถานะ เดือน และคำค้นหา (ห้อง/ชื่อ) เรียงเดือนใหม่สุดก่อน แล้วตามเลขห้อง
export function filterInvoices(invoices, { filter, monthFilter, search }) {
    const keyword = search.trim().toLowerCase()
    return invoices
        .filter((i) => filter === 'all' || i.status === filter)
        .filter((i) => monthFilter === 'all' || i.month === monthFilter)
        .filter((i) => !keyword || i.room.includes(keyword) || i.tenant_name.toLowerCase().includes(keyword))
        .sort((a, b) => b.month.localeCompare(a.month) || a.room.localeCompare(b.room, undefined, { numeric: true }))
}

// ยอดรวมของรายการที่แสดง (แถวรวมท้ายตาราง)
export const invoiceTotals = (visible) =>
    visible.reduce(
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
