import { useState } from 'react'
import Icon from './Icon'
import { baht, formatMonth } from '../lib/billing'

// หน้าต่างยืนยันการลบใบแจ้งหนี้
function InvoiceDeleteModal({ invoice, onConfirm, onCancel }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    // กดยืนยันลบ: เรียก onConfirm แล้วแสดงข้อความ error ถ้าลบไม่สำเร็จ
    const handleDelete = async () => {
        setBusy(true)
        const err = await onConfirm(invoice)
        setBusy(false)
        if (err) setError(err)
    }

    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 shadow-xl w-[420px] max-w-[92vw] flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <span className="grid place-items-center w-10 h-10 rounded-full bg-red-50 text-red-600"><Icon name="trash" className="w-5 h-5" /></span>
                    <h2 className="text-lg font-semibold text-primary-dark">ลบใบแจ้งหนี้</h2>
                </div>
                {/* รายละเอียดใบที่จะลบ + คำเตือนถ้าเป็นใบที่ชำระแล้ว */}
                <p className="text-sm text-ink">
                    ลบใบแจ้งหนี้เดือน {formatMonth(invoice.month)} ของห้อง {invoice.room} ({invoice.tenant_name}) ยอด {baht(invoice.total)}
                    {invoice.slip_path && ' พร้อมรูปสลิปที่แนบมา'} ผู้เช่าจะไม่เห็นใบแจ้งหนี้นี้อีก การลบไม่สามารถกู้คืนได้
                </p>
                {invoice.status === 'paid' && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">ใบแจ้งหนี้นี้ชำระเงินแล้ว การลบจะทำให้ประวัติการชำระหายไป</p>
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="border border-line text-muted hover:bg-sand px-4 py-1.5 rounded-lg">ยกเลิก</button>
                    <button onClick={handleDelete} disabled={busy} className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-4 py-1.5 rounded-lg">
                        {busy ? 'กำลังลบ...' : 'ลบใบแจ้งหนี้'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default InvoiceDeleteModal
