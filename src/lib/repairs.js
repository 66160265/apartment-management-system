import { supabase } from './supabaseClient'
import { MAX_SLOTS, REPAIR_HOURS, legacyPeriods } from '../data/repairs'

// ข้อจำกัดรูปแจ้งซ่อม: ไม่เกิน 5 MB และชนิดไฟล์ที่รับ (MIME -> นามสกุลไฟล์)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// ชื่อ bucket ใน Supabase Storage ที่เก็บรูปแจ้งซ่อม
const BUCKET = 'repairs'

// แสดงขนาดไฟล์เป็น KB หรือ MB
export const formatSize = (bytes) =>
    bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`

// 2026-10-08T... -> 8 ต.ค. 69
export const formatThaiDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-'

// คืนข้อความ error หรือสตริงว่างเมื่อไฟล์ใช้ได้
export function validateImage(file) {
    if (!IMAGE_TYPES[file.type]) return 'รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WEBP'
    if (file.size > MAX_IMAGE_SIZE) return 'ไฟล์ต้องมีขนาดไม่เกิน 5 MB'
    return ''
}

// อัปโหลดรูปไปที่โฟลเดอร์ของเจ้าของรายการ คืนค่า { path } หรือ { error }
export async function uploadRepairImage(file, folder) {
    const path = `${folder}/${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
    return error ? { error: `อัปโหลดรูปไม่สำเร็จ: ${error.message}` } : { path }
}

// ลบรูปแจ้งซ่อมออกจาก storage (ไม่มี path ก็ไม่ทำอะไร)
export async function removeRepairImage(path) {
    if (path) await supabase.storage.from(BUCKET).remove([path])
}

// ลิงก์ชั่วคราวสำหรับดูรูป (bucket เป็น private)
export async function getRepairImageUrl(path) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
    return data?.signedUrl ?? null
}

// วันที่วันนี้แบบ YYYY-MM-DD (เวลาท้องถิ่น)
export const todayIso = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 2026-10-20 -> จ. 20 ต.ค. 69
export const formatThaiDay = (isoDate) =>
    isoDate
        ? new Date(`${isoDate}T00:00:00`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' })
        : '-'

// เวลาเริ่มที่เลือกได้ 09:00, 10:00, ..., 17:00
const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const toHhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export const repairTimeOptions = Array.from(
    { length: (toMinutes(REPAIR_HOURS.end) - toMinutes(REPAIR_HOURS.start)) / REPAIR_HOURS.step + 1 },
    (_, i) => toHhmm(toMinutes(REPAIR_HOURS.start) + i * REPAIR_HOURS.step),
)

// เวลาเริ่ม -> ช่วงนัด 1 ครั้ง เช่น "09:00" -> "09:00-10:00"
export const periodAt = (start) => `${start}-${toHhmm(toMinutes(start) + REPAIR_HOURS.step)}`

// แปลงค่าแบบเดิม (morning) เป็นช่วงเวลา "09:00-12:00"
export const normalizePeriod = (period) => legacyPeriods[period] ?? period ?? ''

// "13:00-15:30" -> { start: '13:00', end: '15:30' }
export const parsePeriod = (period) => {
    const [start = '', end = ''] = normalizePeriod(period).split('-')
    return { start, end }
}

// เวลาถูกต้อง: เป็นช่วงนัด 1 ครั้งที่เริ่มตามเวลาที่เลือกได้ (09:00-10:00 ... 17:00-18:00)
export const isValidPeriod = (period) => {
    const { start } = parsePeriod(period)
    return repairTimeOptions.includes(start) && normalizePeriod(period) === periodAt(start)
}

// "09:00-10:00" -> "09:00 น." (ช่วงแบบเดิมที่ยาวกว่า 1 ครั้ง เช่น "13:00-15:30" -> "13:00-15:30 น.")
export const formatPeriod = (period) => {
    const { start, end } = parsePeriod(period)
    if (!start || !end) return ''
    return isValidPeriod(period) ? `${start} น.` : `${start}-${end} น.`
}

// สองช่วงเวลาซ้อนกันไหม (ใช้เตือนนัดชน)
export const periodsOverlap = (a, b) => {
    const p = parsePeriod(a)
    const q = parsePeriod(b)
    return p.start < q.end && q.start < p.end
}

// วัน + ช่วงเวลา เช่น "จ. 20 ต.ค. 69 · 13:00-15:30 น."
export const formatSlot = (date, period) => {
    const p = formatPeriod(period)
    return `${formatThaiDay(date)}${p ? ` · ${p}` : ''}`
}

// นัด (date + period) อยู่ภายในช่วงที่ผู้เช่าสะดวกช่วงใดช่วงหนึ่งไหม
export const isInSlots = (slots, date, period) => {
    const { start, end } = parsePeriod(period)
    return (slots ?? []).some((s) => {
        const p = parsePeriod(s.period)
        return s.date === date && p.start <= start && end <= p.end
    })
}

// ช่วงแบบเดิม (เช่น "13:00-15:30", morning) -> เวลานัด 1 ครั้งที่เริ่มตามต้นช่วง (ปัดลงเป็นเวลาที่เลือกได้)
export const toSlotPeriod = (period) => {
    if (isValidPeriod(period)) return normalizePeriod(period)
    const { start } = parsePeriod(period)
    const fit = [...repairTimeOptions].reverse().find((t) => t <= start) ?? repairTimeOptions[0]
    return periodAt(fit)
}

// ตัดช่วงเวลาที่ผ่านไปแล้วทิ้ง (ใช้ตอนเปิดฟอร์มแก้ไข) แปลงช่วงแบบเดิมเป็นเวลานัด 1 ครั้ง เรียงตามวัน และเก็บไว้ไม่เกิน MAX_SLOTS
export const upcomingSlots = (slots) =>
    (slots ?? [])
        .filter((s) => s.date >= todayIso())
        .map((s) => ({ ...s, period: toSlotPeriod(s.period) }))
        .sort((a, b) => (a.date + a.period).localeCompare(b.date + b.period))
        .slice(0, MAX_SLOTS)

// ---- เวลาที่มีนัดซ่อมของห้องอื่นแล้ว (เลือกซ้ำไม่ได้) ----

// วัน + เวลานี้ชนกับนัดที่มีอยู่แล้วไหม (booked = [{ date, period }])
export const isBooked = (booked, date, period) => (booked ?? []).some((b) => b.date === date && periodsOverlap(b.period, period))

// เวลานัดแรกที่ยังว่างภายในช่วงที่ผู้เช่าสะดวก (null = เต็มทั้งช่วง)
export const firstFreePeriod = (slot, booked) =>
    repairTimeOptions.map(periodAt).find((p) => isInSlots([slot], slot.date, p) && !isBooked(booked, slot.date, p)) ?? null

// นัดซ่อมที่ยังไม่ถึงของทุกห้อง (เฉพาะวันและเวลา ไม่มีข้อมูลห้อง) ไม่นับรายการ excludeId
export async function loadBookedTimes(excludeId = null) {
    const { data, error } = await supabase.rpc('repair_booked_times', { p_exclude: excludeId })
    return error ? [] : (data ?? []).map((r) => ({ date: r.appointment_date, period: r.appointment_period }))
}

// ตรวจช่วงเวลาที่ผู้เช่ากรอก: คืนข้อความ error หรือสตริงว่าง
export function validateAvailability({ slots, allowEntry, urgency, booked = [] }) {
    if (slots.some((s) => !s.date || !s.period)) return 'กรุณาเลือกวันและเวลาให้ครบทุกช่อง'
    if (slots.some((s) => !isValidPeriod(s.period))) return `กรุณาเลือกเวลาระหว่าง ${REPAIR_HOURS.start}-${REPAIR_HOURS.end} น.`
    if (slots.some((s) => s.date < todayIso())) return 'ไม่สามารถเลือกวันที่ผ่านมาแล้ว'
    const keys = slots.map((s) => `${s.date}|${s.period}`)
    if (new Set(keys).size !== keys.length) return 'มีวันและเวลาซ้ำกัน'
    const taken = slots.find((s) => isBooked(booked, s.date, s.period))
    if (taken) return `${formatSlot(taken.date, taken.period)} มีห้องอื่นนัดหรือเลือกไว้แล้ว กรุณาเลือกเวลาอื่น`
    if (slots.length === 0 && !allowEntry && urgency !== 'emergency')
        return 'กรุณาเลือกช่วงเวลาที่สะดวกอย่างน้อย 1 ช่วง หรืออนุญาตให้ช่างเข้าห้องได้แม้ไม่อยู่'
    return ''
}
