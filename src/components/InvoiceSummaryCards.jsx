import { invoiceStatuses } from '../data/billing'
import { balanceOf, baht, daysLate, formatDateTime, formatMonth, isPartiallyPaid, lateFeeOf, paidOf } from '../lib/billing'
import { formatDueDate } from '../lib/tenantDashboard'

// การ์ดสรุปตัวเลขของใบแจ้งหนี้ที่กำลังดู: ยอดใบแจ้งหนี้ และสถานะ (หน้าภาพรวมผู้เช่า)
// จอเล็กก็วาง 2 ใบคู่กัน (ตัวเลขเล็กลงและขอบในแคบลง)
function InvoiceSummaryCards({ invoice, dueDay }) {
    return (
        <div className="grid grid-cols-2 gap-3 sm:gap-5">
            {/* 1. ยอดเดือนนี้ */}
            <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-card border border-line flex flex-col justify-between min-w-0">
                <span className="text-sm font-medium text-muted">ยอดใบแจ้งหนี้</span>
                <div className="mt-2 sm:mt-3">
                    <div className="text-2xl sm:text-4xl font-bold text-ink tracking-tight tabular-nums">
                        {invoice ? baht(invoice.total) : '฿0'}
                    </div>
                    <div className="text-xs text-muted mt-1.5 font-medium">
                        {invoice ? `เดือน ${formatMonth(invoice.month)}` : 'ไม่มีใบแจ้งหนี้'}
                    </div>
                    {invoice && lateFeeOf(invoice) > 0 && invoice.status !== 'paid' && (
                        <div className="text-xs text-red-600 mt-1 font-medium">
                            เกินกำหนด {daysLate(invoice)} วัน · ค่าปรับ {baht(lateFeeOf(invoice))}
                        </div>
                    )}
                    {invoice && isPartiallyPaid(invoice) && (
                        <div className="text-xs text-amber-700 mt-1 font-medium">
                            ชำระแล้ว {baht(paidOf(invoice))} · เหลือ {baht(balanceOf(invoice))}
                        </div>
                    )}
                </div>
            </div>

            {/* 2. สถานะ */}
            <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-card border border-line flex flex-col justify-between min-w-0">
                <span className="text-sm font-medium text-muted">สถานะ</span>
                <div className="mt-2 sm:mt-3">
                    <div className="text-xl sm:text-3xl font-bold tracking-tight">
                        {invoice ? (
                            <span
                                className={
                                    invoice.status === 'paid'
                                        ? 'text-emerald-600'
                                        : invoice.status === 'review'
                                        ? 'text-sky-600'
                                        : 'text-amber-600'
                                }
                            >
                                {invoiceStatuses[invoice.status]?.label || invoice.status}
                            </span>
                        ) : (
                            <span className="text-muted/70 font-normal">ไม่มีรายการ</span>
                        )}
                    </div>
                    <div className="text-xs text-muted mt-1.5 font-medium">
                        {invoice ? (
                            invoice.status === 'paid' ? (
                                `ชำระเรียบร้อยเมื่อ ${formatDateTime(invoice.reviewed_at)}`
                            ) : invoice.status === 'review' ? (
                                `ส่งสลิปเมื่อ ${formatDateTime(invoice.slip_uploaded_at)} (รอตรวจ)`
                            ) : (
                                `ภายในวันที่ ${formatDueDate(invoice, dueDay)}`
                            )
                        ) : (
                            'ทุกรายการชำระครบถ้วนแล้ว'
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default InvoiceSummaryCards
