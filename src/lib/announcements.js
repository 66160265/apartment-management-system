import { supabase } from './supabaseClient'

// ประกาศถึงผู้เช่าทุกคน (ตาราง announcements ในไฟล์ supabase/migrations/20261022000000_initial_schema.sql ส่วน contracts-announcements)
// แอดมินลง/แก้/ลบ ผู้เช่าอ่านอย่างเดียว ลงประกาศใหม่แล้วผู้เช่าทุกคนได้แจ้งเตือนในเว็บ (แก้ประกาศไม่แจ้งซ้ำ)

// ความยาวสูงสุด (ตรงกับ check ในฐานข้อมูล)
export const TITLE_MAX = 120
export const BODY_MAX = 2000

// ตรวจก่อนส่ง คืนข้อความ error หรือสตริงว่าง
export function validateAnnouncement({ title, body }) {
    const t = (title ?? '').trim()
    if (!t) return 'กรุณากรอกหัวข้อประกาศ'
    if (t.length > TITLE_MAX) return `หัวข้อยาวเกินไป (ไม่เกิน ${TITLE_MAX} ตัวอักษร)`
    if ((body ?? '').trim().length > BODY_MAX) return `เนื้อหายาวเกินไป (ไม่เกิน ${BODY_MAX} ตัวอักษร)`
    return ''
}

// ประกาศล่าสุดก่อน (จำกัด limit รายการ) คืน null เมื่อโหลดไม่ได้ (เช่น ยังไม่มีตาราง) ให้หน้าเว็บทำงานต่อโดยไม่แสดงอะไร
export async function loadAnnouncements(limit = 100) {
    const { data, error } = await supabase
        .from('announcements')
        .select('id, title, body, important, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(limit)
    return error ? null : (data ?? [])
}

// ลงประกาศ: คืนข้อความ error หรือ null เมื่อสำเร็จ
export async function createAnnouncement({ title, body, important }) {
    const invalid = validateAnnouncement({ title, body })
    if (invalid) return invalid
    const { error } = await supabase.from('announcements').insert({ title: title.trim(), body: (body ?? '').trim(), important: Boolean(important) })
    return error ? error.message : null
}

// แก้ประกาศ (ไม่แจ้งเตือนซ้ำ)
export async function updateAnnouncement(id, { title, body, important }) {
    const invalid = validateAnnouncement({ title, body })
    if (invalid) return invalid
    const { error } = await supabase.from('announcements').update({ title: title.trim(), body: (body ?? '').trim(), important: Boolean(important) }).eq('id', id)
    return error ? error.message : null
}

export async function deleteAnnouncement(id) {
    const { error } = await supabase.from('announcements').delete().eq('id', id)
    return error ? error.message : null
}

// จำนวนผู้เช่าที่มีบัญชี = คนที่จะได้แจ้งเตือนเมื่อลงประกาศ (แอดมินอ่านได้) คืน null ถ้านับไม่ได้
export async function countRecipients() {
    const { count, error } = await supabase.from('tenants').select('room', { count: 'exact', head: true }).not('user_id', 'is', null)
    return error ? null : (count ?? 0)
}

// ประกาศนี้ยังใหม่อยู่ไหม (ภายใน days วันนับจากเวลาที่ลง) ใช้เลือกประกาศที่จะขึ้นหน้าแรกผู้เช่า
export function isRecent(iso, days, now = new Date()) {
    const at = new Date(iso).getTime()
    return Number.isFinite(at) && now.getTime() - at <= days * 86400000
}
