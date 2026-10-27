import { balanceOf, baht, daysLate, formatMonth, isPartiallyPaid, lateFeeOf, paidOf } from '../lib/billing'
import { formatDueDate } from '../lib/tenantDashboard'

// การ์ดสรุปยอดที่ต้องชำระ ส่วนบนของหน้าชำระเงินของผู้เช่า
// lateNotice = ข้อความเตือนค่าปรับ (ว่างได้)
function PaymentAmountCard({ invoice, room, dueDay, lateNotice }) {
    return (
        <div className="bg-white rounded-2xl p-4 sm:p-6 md:p-8 shadow-card border border-line text-center flex flex-col items-center justify-center">
            <span className="text-xs md:text-sm text-muted font-medium">
                ยอดที่ต้องชำระ · ประจำเดือน {invoice ? formatMonth(invoice.month) : '-'} (ห้อง {room})
            </span>
            <div className="text-3xl sm:text-5xl font-extrabold text-ink mt-2 tracking-tight tabular-nums">
                {invoice ? baht(balanceOf(invoice)) : '฿0'}
            </div>
            {invoice && lateFeeOf(invoice) > 0 && invoice.status !== 'paid' && (
                <span className="text-xs md:text-sm text-red-600 font-medium mt-1">
                    รวมค่าปรับล่าช้า {baht(lateFeeOf(invoice))} (เกินกำหนด {daysLate(invoice)} วัน)
                </span>
            )}
            {invoice && isPartiallyPaid(invoice) && (
                <span className="text-xs md:text-sm text-amber-700 font-medium mt-1">
                    ยอดบิล {baht(invoice.total)} · ชำระแล้ว {baht(paidOf(invoice))}
                </span>
            )}
            <span className="text-xs md:text-sm text-red-600 font-semibold mt-2">
                ภายในวันที่ {invoice ? formatDueDate(invoice, dueDay) : '-'}
            </span>
            {lateNotice && <span className="text-xs text-red-600 mt-1">{lateNotice}</span>}
        </div>
    )
}

export default PaymentAmountCard
