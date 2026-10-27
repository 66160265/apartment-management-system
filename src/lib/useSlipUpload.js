import { useEffect, useRef, useState } from 'react'
import { requestSlipVerify } from './slipVerify'
import { supabase } from './supabaseClient'

// ข้อจำกัดรูปสลิป: ไม่เกิน 5 MB และชนิดไฟล์ที่รับ (MIME -> นามสกุล)
const MAX_SIZE = 5 * 1024 * 1024
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// แสดงขนาดไฟล์เป็น KB หรือ MB
export const formatSize = (bytes) =>
    bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
        : `${Math.ceil(bytes / 1024)} KB`

// การแนบและส่งสลิปของผู้เช่า (หน้าชำระเงินใน pages/UserDashboardPage.jsx)
// userId = เจ้าของโฟลเดอร์ไฟล์ใน Storage, invoice = ใบที่กำลังชำระ
// reload = โหลดข้อมูลหน้าใหม่หลังส่งสำเร็จ, onDone = เรียกท้ายสุด (หน้าจอใช้กลับไปหน้าภาพรวม)
export function useSlipUpload({ userId, invoice, reload, onDone }) {
    // ไฟล์สลิปที่เลือก, รูปตัวอย่าง, กำลังลากไฟล์, error, กำลังส่ง, ส่งสำเร็จ และ ref ของช่องเลือกไฟล์
    const [file, setFile] = useState(null)
    const [preview, setPreview] = useState(null)
    const [isDragging, setIsDragging] = useState(false)
    const [error, setError] = useState('')
    const [uploading, setUploading] = useState(false)
    const [success, setSuccess] = useState(false)
    const fileInputRef = useRef(null)

    // จัดการล้าง URL ตัวอย่างรูปเมื่อเปลี่ยนรูป
    useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

    // เลือกไฟล์สลิป: ตรวจชนิดและขนาดก่อนรับ
    const pickFile = (picked) => {
        setError('')
        setSuccess(false)
        if (!picked) return
        if (!TYPES[picked.type]) {
            setError('รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WEBP เท่านั้น')
            return
        }
        if (picked.size > MAX_SIZE) {
            setError('ขนาดไฟล์ต้องไม่เกิน 5 MB')
            return
        }
        setFile(picked)
        setPreview(URL.createObjectURL(picked))
    }

    // ล้างไฟล์สลิปที่เลือก รูปตัวอย่าง และข้อความ error
    const clearFile = () => {
        setFile(null)
        setPreview(null)
        setError('')
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // ส่งหลักฐานสลิปการโอน
    const submit = async () => {
        if (!file || !invoice) return
        setUploading(true)
        setError('')

        try {
            // ตั้งชื่อไฟล์ในโฟลเดอร์ของผู้ใช้: {userId}/{invoiceId}-{เวลา}.{นามสกุล}
            const ext = TYPES[file.type] || 'jpg'
            const path = `${userId || invoice.user_id}/${invoice.id}-${Date.now()}.${ext}`

            // อัปโหลดไปยัง Supabase Storage bucket 'slips'
            const { error: storageError } = await supabase.storage
                .from('slips')
                .upload(path, file, { contentType: file.type })

            if (storageError) {
                throw new Error(`อัปโหลดไฟล์ไม่สำเร็จ: ${storageError.message}`)
            }

            // เรียก RPC submit_slip สำหรับผู้เช่า
            const { error: rpcError } = await supabase.rpc('submit_slip', {
                p_invoice: invoice.id,
                p_path: path,
            })

            if (rpcError) {
                await supabase.storage.from('slips').remove([path])
                throw new Error(`ส่งสลิปไม่สำเร็จ: ${rpcError.message}`)
            }

            // ส่งสำเร็จ: โหลดข้อมูลใหม่ ล้างไฟล์ แสดงข้อความสำเร็จ แล้วให้หน้าจอไปต่อ
            // สั่งตรวจสลิปด้วยระบบ ไม่รอผล (โหมดปิดหรือตรวจไม่ได้ แอดมินยังตรวจด้วยตาได้)
            requestSlipVerify(invoice.id)
            await reload()
            clearFile()
            setSuccess(true)
            onDone?.()
        } catch (err) {
            console.error('Error submitting slip:', err)
            setError(err.message || 'เกิดข้อผิดพลาดในการส่งหลักฐาน')
        } finally {
            setUploading(false)
        }
    }

    return { file, preview, isDragging, setIsDragging, error, uploading, success, setSuccess, fileInputRef, pickFile, clearFile, submit }
}
