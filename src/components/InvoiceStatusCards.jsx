import Icon from './Icon'
import { baht, formatMonth } from '../lib/billing'
import { summaryCards } from '../lib/adminInvoices'

// ผู้เช่าโอนเกินและยังไม่ได้โอนคืน: แสดงรายการให้แอดมินกดเข้าไปบันทึกเมื่อโอนคืนแล้ว (หน้าใบแจ้งหนี้ของแอดมิน)
export function PendingRefunds({ refunds, onOpen }) {
    if (refunds.length === 0) return null
    return (
        <div className="rounded-2xl bg-sky-50 ring-1 ring-sky-200 text-sky-900 p-4 flex flex-col gap-2">
            <div className="font-medium">
                รอโอนคืนผู้เช่า {refunds.length} รายการ รวม {baht(refunds.reduce((sum, i) => sum + Number(i.refund_amount), 0))}
            </div>
            <ul className="flex flex-col gap-1.5">
                {refunds.map((i) => (
                    <li key={i.id}>
                        <button type="button" onClick={() => onOpen(i.id)} className="w-full flex items-center justify-between gap-3 text-left text-sm bg-white/70 hover:bg-white rounded-xl px-3 py-2">
                            <span>ห้อง {i.room} · {i.tenant_name} · {formatMonth(i.month)}</span>
                            <span className="font-semibold tabular-nums">{baht(i.refund_amount)}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    )
}

// การ์ดสรุปตามสถานะ (กดเพื่อกรอง) การ์ดรอตรวจสอบมีป้ายเตือนเมื่อมีสลิปรอ
// จอเล็กซ่อน: แท็บสถานะในกล่องรายการมีจำนวนและกรองได้เหมือนกัน
// stats = ผลของ invoiceStats()
export function StatusCards({ stats, filter, onChange }) {
    return (
        <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-3">
            {summaryCards.map((c) => {
                const active = filter === c.value
                const urgent = c.value === 'review' && stats.review.count > 0
                return (
                    <button
                        key={c.value}
                        onClick={() => onChange(c.value)}
                        aria-pressed={active}
                        className={`text-left rounded-xl sm:rounded-2xl p-2.5 sm:p-4 bg-white shadow-card border-2 transition ${
                            active ? 'border-primary' : 'border-transparent hover:border-mist'
                        }`}
                    >
                        <div className="flex items-center justify-between gap-1 text-xs sm:text-sm leading-tight text-muted">
                            <span>{c.label}</span>
                            <span className={`hidden sm:grid place-items-center w-8 h-8 shrink-0 rounded-lg ${c.tone}`}><Icon name={c.icon} className="w-[18px] h-[18px]" /></span>
                        </div>
                        <div className="mt-1 sm:mt-2 flex items-baseline gap-2">
                            <span className="text-xl sm:text-2xl font-semibold text-primary-dark">{stats[c.value].count}</span>
                            <span className="hidden sm:inline text-xs text-muted">รายการ</span>
                            {urgent && <span className="ml-auto text-[11px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">รอคุณตรวจ</span>}
                        </div>
                        <div className="text-xs text-muted mt-0.5 tabular-nums">{baht(stats[c.value].sum)}</div>
                    </button>
                )
            })}
        </div>
    )
}
