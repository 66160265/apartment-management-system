import { supabase } from './supabaseClient'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

const BUCKET = 'repairs'

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

export async function removeRepairImage(path) {
    if (path) await supabase.storage.from(BUCKET).remove([path])
}

// ลิงก์ชั่วคราวสำหรับดูรูป (bucket เป็น private)
export async function getRepairImageUrl(path) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
    return data?.signedUrl ?? null
}
