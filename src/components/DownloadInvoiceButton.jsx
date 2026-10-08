import { useState } from 'react'
import Icon from './Icon'
import { downloadInvoicePdf } from '../lib/invoicePdf'

// ปุ่มดาวน์โหลดใบแจ้งหนี้เป็นไฟล์ PDF (บันทึกลงเครื่องทันที)
// className ใช้กำหนดรูปแบบปุ่ม ส่วนข้อความ/ไอคอนเป็นของปุ่มเอง
function DownloadInvoiceButton({ invoice, className = '', label = 'ดาวน์โหลดใบแจ้งหนี้ PDF' }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const handleClick = async () => {
        setBusy(true)
        setError('')
        try {
            await downloadInvoicePdf(invoice)
        } catch (err) {
            console.error('สร้าง PDF ไม่สำเร็จ', err)
            setError('สร้างไฟล์ PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="flex flex-col gap-1.5">
            <button type="button" onClick={handleClick} disabled={busy} className={`flex items-center justify-center gap-2 ${className}`}>
                {busy ? (
                    <span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                ) : (
                    <Icon name="download" className="w-4 h-4" />
                )}
                {busy ? 'กำลังสร้างไฟล์...' : label}
            </button>
            {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
    )
}

export default DownloadInvoiceButton
