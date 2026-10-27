import { StatusBadge } from './InvoiceParts'
import { baht, formatMonth } from '../lib/billing'
import { rowCalc } from '../lib/adminInvoices'

const thClass = 'px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10'
const tdClass = 'px-3 py-3 border-x border-line/60'

// ตารางใบแจ้งหนี้ (จอ xl ขึ้นไป) ใบที่รอตรวจพื้นสีฟ้า กดแถวเพื่อดูรายละเอียด มีแถวรวมท้ายตาราง
// totals = ผลของ invoiceTotals(), onOpen(id) = เปิดรายละเอียด, onEdit(invoice), onDelete(invoice)
export function InvoiceTable({ rows, totals, onOpen, onEdit, onDelete }) {
    return (
        <table className="hidden xl:table w-full min-w-[60rem] border-collapse text-sm">
            <thead className="sticky top-0 z-10">
                <tr className="bg-primary-dark text-white">
                    <th className={`${thClass} text-center w-12`}>#</th>
                    <th className={`${thClass} text-center`}>ห้อง</th>
                    <th className={`${thClass} text-left`}>ผู้เช่า</th>
                    <th className={`${thClass} text-center`}>เดือน</th>
                    <th className={`${thClass} text-right`}>ค่าเช่า</th>
                    <th className={`${thClass} text-right`}>ค่าน้ำ</th>
                    <th className={`${thClass} text-right`}>ค่าไฟ</th>
                    <th className={`${thClass} text-right`}>ส่วนกลาง</th>
                    <th className={`${thClass} text-right`}>ยอดรวม</th>
                    <th className={`${thClass} text-center`}>สถานะ</th>
                    <th className={`${thClass} text-center`}>จัดการ</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((i, index) => {
                    const c = rowCalc(i)
                    return (
                        <tr
                            key={i.id}
                            onClick={() => onOpen(i.id)}
                            className={`group cursor-pointer border-b border-line transition-colors hover:bg-mist/30 ${
                                i.status === 'review' ? 'bg-sky-50/70' : index % 2 ? 'bg-sand/40' : 'bg-white'
                            }`}
                        >
                            <td className={`${tdClass} text-center text-xs text-muted tabular-nums`}>{index + 1}</td>
                            <td className={`${tdClass} text-center`}>
                                <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold">{i.room}</span>
                            </td>
                            <td className={`${tdClass} font-medium text-ink`}>{i.tenant_name}</td>
                            <td className={`${tdClass} text-center text-muted whitespace-nowrap`}>{formatMonth(i.month)}</td>
                            <td className={`${tdClass} text-right tabular-nums`}>{baht(i.rent)}</td>
                            <td className={`${tdClass} text-right tabular-nums`} title={`${c.waterUnits} หน่วย`}>{baht(c.water)}</td>
                            <td className={`${tdClass} text-right tabular-nums`} title={`${c.elecUnits} หน่วย`}>{baht(c.elec)}</td>
                            <td className={`${tdClass} text-right tabular-nums text-muted`}>{baht(i.common_fee)}</td>
                            <td className={`${tdClass} text-right font-semibold text-primary-dark tabular-nums bg-primary/5`}>{baht(i.total)}</td>
                            <td className={`${tdClass} text-center`}><StatusBadge status={i.status} /></td>
                            <td className="border-x border-line/60 px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="inline-flex rounded-lg border border-line bg-white overflow-hidden divide-x divide-line text-sm">
                                    <button
                                        onClick={() => onOpen(i.id)}
                                        className={`px-3 py-1 ${i.status === 'review' ? 'bg-primary text-white hover:bg-primary-dark' : 'text-primary-dark hover:bg-mist/50'}`}
                                    >
                                        {i.status === 'review' ? 'ตรวจสอบ' : 'รายละเอียด'}
                                    </button>
                                    <button onClick={() => onEdit(i)} aria-label={`แก้ไขใบแจ้งหนี้ห้อง ${i.room}`} className="px-3 py-1 text-ink hover:bg-mist/50">แก้ไข</button>
                                    <button onClick={() => onDelete(i)} aria-label={`ลบใบแจ้งหนี้ห้อง ${i.room}`} className="px-3 py-1 text-red-600 hover:bg-red-50">ลบ</button>
                                </div>
                            </td>
                        </tr>
                    )
                })}
            </tbody>
            {/* แถวรวมท้ายตาราง */}
            {rows.length > 0 && (
                <tfoot className="sticky bottom-0">
                    <tr className="bg-mist/60 text-primary-dark font-semibold">
                        <td colSpan="4" className={`${tdClass} text-right`}>รวม {rows.length} รายการ</td>
                        <td className={`${tdClass} text-right tabular-nums`}>{baht(totals.rent)}</td>
                        <td className={`${tdClass} text-right tabular-nums`}>{baht(totals.water)}</td>
                        <td className={`${tdClass} text-right tabular-nums`}>{baht(totals.elec)}</td>
                        <td className={`${tdClass} text-right tabular-nums`}>{baht(totals.common)}</td>
                        <td className={`${tdClass} text-right tabular-nums`}>{baht(totals.total)}</td>
                        <td colSpan="2" className={tdClass} />
                    </tr>
                </tfoot>
            )}
        </table>
    )
}

// จอเล็ก/กลาง: ยอดรวม + การ์ดใบแจ้งหนี้
export function InvoiceCards({ rows, totals, onOpen, onEdit, onDelete }) {
    return (
        <>
            {rows.length > 0 && (
                <div className="xl:hidden flex items-center justify-between rounded-xl bg-mist/50 px-4 py-2.5 mb-3 text-sm font-semibold text-primary-dark">
                    <span>รวม {rows.length} รายการ</span>
                    <span className="tabular-nums">{baht(totals.total)}</span>
                </div>
            )}
            <div className="xl:hidden grid gap-3 md:grid-cols-2">
                {rows.map((i) => {
                    const c = rowCalc(i)
                    return (
                        <div
                            key={i.id}
                            className={`rounded-2xl border border-line p-4 flex flex-col gap-3 ${i.status === 'review' ? 'bg-sky-50/60' : 'bg-white'}`}
                        >
                            <button type="button" onClick={() => onOpen(i.id)} className="text-left flex items-start gap-3">
                                <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold text-center">{i.room}</span>
                                <div className="min-w-0 flex-1">
                                    <div className="font-medium text-ink truncate">{i.tenant_name}</div>
                                    <div className="text-xs text-muted">{formatMonth(i.month)}</div>
                                </div>
                                <div className="flex flex-col items-end gap-1.5">
                                    <div className="font-semibold text-primary-dark tabular-nums">{baht(i.total)}</div>
                                    <StatusBadge status={i.status} />
                                </div>
                            </button>
                            <div className="text-xs text-muted tabular-nums">
                                ค่าเช่า {baht(i.rent)} · น้ำ {baht(c.water)} · ไฟ {baht(c.elec)}{Number(i.common_fee) > 0 ? ` · ส่วนกลาง ${baht(i.common_fee)}` : ''}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onOpen(i.id)}
                                    className={`flex-1 py-2 rounded-xl text-sm ${i.status === 'review' ? 'bg-primary text-white hover:bg-primary-dark' : 'bg-mist/60 text-primary-dark hover:bg-mist'}`}
                                >
                                    {i.status === 'review' ? 'ตรวจสอบสลิป' : 'รายละเอียด'}
                                </button>
                                <button onClick={() => onEdit(i)} className="px-4 py-2 rounded-xl text-sm border border-line text-primary-dark hover:bg-mist/40">แก้ไข</button>
                                <button onClick={() => onDelete(i)} className="px-4 py-2 rounded-xl text-sm border border-red-200 text-red-600 hover:bg-red-50">ลบ</button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </>
    )
}
