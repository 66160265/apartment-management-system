import { baht, formatMonth, formatShortDate } from '../lib/billing'
import Icon from './Icon'

// ค้างชำระหลายใบ: แสดงรายการทั้งหมด เลือกใบที่จะดู/จ่ายได้ (ถ้ามีใบเดียว การ์ดการดำเนินการในหน้าภาพรวมครอบคลุมแล้ว)
// unpaid = ผลของ tenantUnpaid() onPay(id) เรียกเมื่อกด "ชำระ" ของใบนั้น
function UnpaidInvoicesAlert({ unpaid, onPay }) {
    if (unpaid.length <= 1) return null

    return (
        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col gap-3">
            <h3 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                <Icon name="alert" className="w-4 h-4" />
                มี {unpaid.length} ใบที่ยังต้องชำระ · รวม {baht(unpaid.reduce((sum, u) => sum + u.balance, 0))}
            </h3>
            <div className="flex flex-col divide-y divide-amber-200/70">
                {unpaid.map((u) => (
                    <div key={u.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <div>
                            <span className="font-semibold text-ink">{formatMonth(u.month)}</span>
                            <span className={`ml-2 text-xs font-medium ${u.daysLate > 0 ? 'text-red-600' : 'text-muted'}`}>
                                {u.daysLate > 0 ? `เกินกำหนด ${u.daysLate} วัน` : `ครบกำหนด ${formatShortDate(u.dueDate)}`}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="font-bold tabular-nums text-ink">{baht(u.balance)}</span>
                            <button
                                type="button"
                                onClick={() => onPay(u.id)}
                                className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-semibold transition cursor-pointer"
                            >
                                ชำระ
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}

export default UnpaidInvoicesAlert
