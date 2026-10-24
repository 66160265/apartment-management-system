import { useState } from 'react'
import Icon from './Icon'
import { downloadReceiptPdf } from '../lib/receiptPdf'

// ปุ่มดาวน์โหลดใบเสร็จรับเงินเป็นไฟล์ PDF (บันทึกลงเครื่องทันที) receipt = ข้อมูลจาก lib/receipts.js
function DownloadReceiptButton({ receipt, className = '', label = 'ใบเสร็จ' }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const handleClick = async () => {
        setBusy(true)
        setError('')
        try {
            await downloadReceiptPdf(receipt)
        } catch (err) {
            console.error('สร้างใบเสร็จ PDF ไม่สำเร็จ', err)
            setError('สร้างไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง')
        } finally {
            setBusy(false)
        }
    }

    return (
        <span className="inline-flex flex-col items-end gap-1">
            <button type="button" onClick={handleClick} disabled={busy} className={`inline-flex items-center gap-1.5 ${className}`}>
                {busy ? <span className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin" /> : <Icon name="download" className="w-3.5 h-3.5" />}
                {busy ? 'กำลังสร้าง...' : label}
            </button>
            {error && <span className="text-[11px] text-red-600">{error}</span>}
        </span>
    )
}

export default DownloadReceiptButton
