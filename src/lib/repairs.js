import { supabase } from './supabaseClient'
import { MAX_SLOTS, REPAIR_BREAK, REPAIR_HOURS } from '../data/repairs'

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

// เวลาทั้งหมดในขอบเขต 09:00, 10:00, ..., 18:00
const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const toHhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const allTimes = Array.from(
    { length: (toMinutes(REPAIR_HOURS.end) - toMinutes(REPAIR_HOURS.start)) / REPAIR_HOURS.step + 1 },
    (_, i) => toHhmm(toMinutes(REPAIR_HOURS.start) + i * REPAIR_HOURS.step),
)

// เวลาเริ่มที่เลือกได้ 09:00, 10:00, 11:00, 13:00, ..., 17:00 (ไม่รวมเวลาสิ้นสุดของวัน และเวลาพัก 12:00)
export const repairStartOptions = allTimes.slice(0, -1).filter((t) => t !== REPAIR_BREAK.start)

// เวลาสิ้นสุดที่เลือกได้ เมื่อเริ่มตอน start: ตั้งแต่ 1 ชั่วโมงหลังเวลาเริ่มถึง 18:00 (ยังไม่เลือกเวลาเริ่ม = ทุกเวลาหลัง 09:00)
export const repairEndOptions = (start) => allTimes.filter((t) => t > (start || REPAIR_HOURS.start))

// ช่วงนี้เริ่มในเวลาพักของช่างไหม (12:00-13:00)
export const isBreakTime = (period) => {
    const { start } = parsePeriod(period)
    return start >= REPAIR_BREAK.start && start < REPAIR_BREAK.end
}

// ช่วงเวลาที่ไม่มีค่า (null) เป็นสตริงว่าง
export const normalizePeriod = (period) => period ?? ''

// "13:00-15:30" -> { start: '13:00', end: '15:30' }
export const parsePeriod = (period) => {
    const [start = '', end = ''] = normalizePeriod(period).split('-')
    return { start, end }
}

// ช่วงเวลาถูกต้อง: เวลาเริ่มและสิ้นสุดเป็นเวลาที่เลือกได้ และสิ้นสุดหลังเวลาเริ่ม (เช่น 09:00-16:00)
export const isValidPeriod = (period) => {
    const { start, end } = parsePeriod(period)
    return repairStartOptions.includes(start) && repairEndOptions(start).includes(end)
}

// "09:00-16:00" -> "09:00-16:00 น."
export const formatPeriod = (period) => {
    const { start, end } = parsePeriod(period)
    return start && end ? `${start}-${end} น.` : ''
}

// สองช่วงเวลาซ้อนกันไหม (ใช้บอกผู้ดูแลว่าช่วงนี้มีงานอื่นแล้วกี่งาน)
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

// ตัดช่วงเวลาที่ผ่านไปแล้วทิ้ง (ใช้ตอนเปิดฟอร์มแก้ไข) เรียงตามวัน และเก็บไว้ไม่เกิน MAX_SLOTS
export const upcomingSlots = (slots) =>
    (slots ?? [])
        .filter((s) => s.date >= todayIso())
        .sort((a, b) => (a.date + a.period).localeCompare(b.date + b.period))
        .slice(0, MAX_SLOTS)

// เวลานัดนี้ผ่านไปแล้วไหม: วันก่อนหน้า หรือวันนี้แต่เวลาเริ่มเลยมาแล้ว (เวลาท้องถิ่นของเครื่อง)
export const isPastTime = (date, period) => {
    const today = todayIso()
    if (date < today) return true
    if (date > today) return false
    const now = new Date()
    const nowHhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    return parsePeriod(period).start <= nowHhmm
}

// จำนวนนัดซ่อมของห้องอื่นที่ทับกับวันและช่วงนี้ (appointments = [{ date, period }]) ใช้เตือนผู้ดูแล ไม่ได้ห้ามนัด
export const countOverlaps = (appointments, date, period) =>
    (appointments ?? []).filter((a) => a.date === date && periodsOverlap(a.period, period)).length

// ตรวจช่วงเวลาที่ผู้เช่ากรอก: คืนข้อความ error หรือสตริงว่าง
export function validateAvailability({ slots, allowEntry, urgency }) {
    if (slots.some((s) => !s.date || !parsePeriod(s.period).start || !parsePeriod(s.period).end)) return 'กรุณาเลือกวัน เวลาเริ่ม และเวลาสิ้นสุดให้ครบทุกช่อง'
    const onBreak = slots.find((s) => isBreakTime(s.period))
    if (onBreak) return `เวลา ${REPAIR_BREAK.start}-${REPAIR_BREAK.end} น. เป็นเวลาพักของช่าง กรุณาเลือกช่วงเวลาอื่น`
    if (slots.some((s) => !isValidPeriod(s.period))) return `กรุณาเลือกช่วงเวลาระหว่าง ${REPAIR_HOURS.start}-${REPAIR_HOURS.end} น. โดยเวลาสิ้นสุดต้องหลังเวลาเริ่ม`
    if (slots.some((s) => s.date < todayIso())) return 'ไม่สามารถเลือกวันที่ผ่านมาแล้ว'
    if (slots.some((s) => isPastTime(s.date, s.period))) return 'เวลานี้ผ่านไปแล้ว กรุณาเลือกเวลาอื่น'
    // ช่วงในวันเดียวกันห้ามซ้อนกัน (เลือกช่วงยาวช่วงเดียวแทนได้)
    if (slots.some((s, i) => slots.some((o, j) => j < i && o.date === s.date && periodsOverlap(o.period, s.period))))
        return 'มีช่วงเวลาในวันเดียวกันซ้อนกัน กรุณารวมเป็นช่วงเดียวหรือเลือกเวลาอื่น'
    if (slots.length === 0 && !allowEntry && urgency !== 'emergency')
        return 'กรุณาเลือกช่วงเวลาที่สะดวกอย่างน้อย 1 ช่วง หรืออนุญาตให้ช่างเข้าห้องได้แม้ไม่อยู่'
    return ''
}

// ตรวจข้อมูลช่างตอนเปลี่ยนเป็น "กำลังดำเนินการ": ต้องมีชื่อและเบอร์โทร (ตัวเลข 9-10 หลัก ใส่ขีดหรือเว้นวรรคได้) คืนข้อความ error หรือสตริงว่าง
export function validateTechnician(name, phone) {
    if (!name.trim() || !phone.trim()) return 'กรุณาใส่ชื่อช่างและเบอร์โทรช่างก่อนเปลี่ยนเป็น "กำลังดำเนินการ"'
    const digits = phone.replace(/\D/g, '')
    if (!/^[\d\s()+-]+$/.test(phone.trim()) || digits.length < 9 || digits.length > 10) return 'เบอร์โทรช่างไม่ถูกต้อง (ตัวเลข 9-10 หลัก)'
    return ''
}

// เรียงรายการแจ้งซ่อม: เรื่องที่ปักหมุดอยู่บนสุด (ปักล่าสุดก่อน) ที่เหลือเรียงตามวันที่แจ้ง ใหม่สุดก่อน หรือเก่าสุดก่อน
export function sortRepairs(list, oldestFirst = false) {
    return [...list].sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
        if (a.pinned) return String(b.pinned_at ?? '').localeCompare(String(a.pinned_at ?? ''))
        return (oldestFirst ? 1 : -1) * a.created_at.localeCompare(b.created_at)
    })
}
