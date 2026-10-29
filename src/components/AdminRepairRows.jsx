import Icon from './Icon'
import { RepairStatusBadge, UrgencyBadge } from './RepairParts'
import { baht } from '../lib/billing'
import { formatThaiDate } from '../lib/repairs'

// แถวและการ์ดรายการแจ้งซ่อมในหน้ารายการของแอดมิน (components/AdminRepairList.jsx)

// สถานะการชำระค่าซ่อมที่ผู้เช่าจ่าย แสดงใต้ป้ายสถานะ (ไม่มีค่าซ่อมที่ผู้เช่าต้องจ่าย = ไม่แสดง)
const payLabels = {
    review: { text: 'รอตรวจสอบสลิป', tone: 'text-sky-700' },
    unpaid: { text: 'รอผู้เช่าชำระ', tone: 'text-amber-700' },
    paid: { text: 'ชำระค่าซ่อมแล้ว', tone: 'text-emerald-700' },
}
function PayState({ state }) {
    const label = payLabels[state]
    return label ? <div className={`text-xs font-semibold mt-1 ${label.tone}`}>{label.text}</div> : null
}

// ค่าซ่อมและผู้รับผิดชอบ (ไม่มีค่าใช้จ่าย = "-") ใช้ในตารางและการ์ดรายการ
function RepairCost({ repair, inline = false }) {
    if (!(Number(repair.cost) > 0)) return inline ? null : '-'
    const tenantPays = repair.cost_payer === 'tenant'
    const payer = tenantPays ? 'ผู้เช่าจ่าย' : 'หอพักจ่าย'
    if (inline) return <div className="text-xs text-muted">ค่าซ่อม {baht(repair.cost)} · <span className={tenantPays ? 'text-rose-700' : ''}>{payer}</span></div>
    return (
        <>
            <div className="font-medium text-ink tabular-nums">{baht(repair.cost)}</div>
            <div className={`text-xs ${tenantPays ? 'text-rose-700' : 'text-muted'}`}>{payer}</div>
        </>
    )
}

// ปุ่มปัก/เลิกปักหมุดในหน้ารายการ (เฉพาะเรื่องที่ยังไม่เสร็จ เรื่องเสร็จสิ้นไม่มีปุ่ม)
function PinButton({ repair, onToggle }) {
    if (!['pending', 'in_progress'].includes(repair.status)) return null
    return (
        <button
            type="button"
            onClick={() => onToggle(repair)}
            aria-pressed={Boolean(repair.pinned)}
            title={repair.pinned ? 'เลิกปักหมุด' : 'ปักหมุดเรื่องเร่งด่วน'}
            aria-label={repair.pinned ? 'เลิกปักหมุด' : 'ปักหมุดเรื่องเร่งด่วน'}
            className={`inline-grid place-items-center w-9 h-8 rounded-lg align-middle transition-colors ${repair.pinned ? 'bg-primary text-white hover:bg-primary-dark' : 'bg-sand text-muted hover:text-primary hover:bg-mist/60'}`}
        >
            <Icon name="pin" className="w-4 h-4" />
        </button>
    )
}

const thClass = 'px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10'

// ตารางรายการ (จอ xl ขึ้นไป) กดแถวไหนก็ได้เพื่อเปิดจัดการ รายการรอดำเนินการพื้นสีฟ้า
// payState(r) = สถานะการชำระค่าซ่อมของเรื่อง, onOpen(r) = เปิดจัดการ, onTogglePin(r) = ปัก/เลิกปักหมุด
export function RepairTable({ rows, payState, onOpen, onTogglePin }) {
    return (
        <table className="hidden xl:table w-full min-w-[56rem] border-collapse text-sm">
            <thead className="sticky top-0 z-10">
                <tr className="bg-primary-dark text-white">
                    <th className={`${thClass} text-center w-12`}>#</th>
                    <th className={`${thClass} text-center`}>ห้อง</th>
                    <th className={`${thClass} text-left`}>ปัญหา</th>
                    <th className={`${thClass} text-center`}>วันที่แจ้ง</th>
                    <th className={`${thClass} text-center`}>วันที่เสร็จสิ้น</th>
                    <th className={`${thClass} text-center`}>ค่าซ่อม</th>
                    <th className={`${thClass} text-center`}>สถานะ</th>
                    <th className={`${thClass} text-center`}>จัดการ</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((r, index) => (
                    <tr
                        key={r.id}
                        onClick={() => onOpen(r)}
                        className={`cursor-pointer border-b border-line transition-colors hover:bg-mist/30 ${r.pinned ? 'bg-red-50' : r.status === 'pending' ? 'bg-sky-50/50' : index % 2 ? 'bg-sand/40' : 'bg-white'}`}
                    >
                        <td className="px-3 py-3 border-x border-line/60 text-center text-xs text-muted tabular-nums">{index + 1}</td>
                        <td className="px-3 py-3 border-x border-line/60 text-center">
                            <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold">{r.room}</span>
                        </td>
                        <td className="px-3 py-3 border-x border-line/60 font-medium text-ink">
                            <span className="inline-flex items-center gap-2">
                                {r.problem}
                                {r.image_path && <Icon name="image" className="w-4 h-4 text-secondary" />}
                                <UrgencyBadge urgency={r.urgency} />
                            </span>
                        </td>
                        <td className="px-3 py-3 border-x border-line/60 text-center text-muted whitespace-nowrap">{formatThaiDate(r.created_at)}</td>
                        <td className="px-3 py-3 border-x border-line/60 text-center text-muted whitespace-nowrap">
                            {r.status === 'done' && r.completed_at ? formatThaiDate(r.completed_at) : '-'}
                        </td>
                        <td className="px-3 py-3 border-x border-line/60 text-center text-muted whitespace-nowrap"><RepairCost repair={r} /></td>
                        <td className="px-3 py-3 border-x border-line/60 text-center"><RepairStatusBadge status={r.status} /><PayState state={payState(r)} /></td>
                        <td className="border-x border-line/60 px-2 py-2 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <PinButton repair={r} onToggle={onTogglePin} />
                            <button onClick={() => onOpen(r)} className="ml-1.5 px-4 py-1 rounded-lg text-sm bg-mist/60 text-primary-dark hover:bg-mist">จัดการ</button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

// การ์ดรายการแทนตาราง (จอเล็ก/กลาง)
export function RepairCards({ rows, payState, onOpen, onTogglePin }) {
    return (
        <div className="xl:hidden grid gap-3 md:grid-cols-2">
            {rows.map((r) => (
                <div
                    key={r.id}
                    className={`rounded-2xl p-4 flex flex-col gap-3 border border-line ${r.pinned ? 'bg-red-50' : r.status === 'pending' ? 'bg-sky-50/60' : 'bg-white'}`}
                >
                    <div className="flex items-start gap-3">
                        <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold text-center">{r.room}</span>
                        <div className="min-w-0 flex-1">
                            <div className="font-medium text-ink flex items-center gap-1.5">
                                {r.problem}
                            </div>
                            <div className="text-xs text-muted">แจ้ง {formatThaiDate(r.created_at)}</div>
                            {r.status === 'done' && r.completed_at && (
                                <div className="text-xs text-emerald-700">เสร็จสิ้น {formatThaiDate(r.completed_at)}</div>
                            )}
                            <RepairCost repair={r} inline />
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <RepairStatusBadge status={r.status} />
                            <PayState state={payState(r)} />
                            <UrgencyBadge urgency={r.urgency} />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <PinButton repair={r} onToggle={onTogglePin} />
                        <button onClick={() => onOpen(r)} className="flex-1 py-2 rounded-xl text-sm bg-mist/60 text-primary-dark hover:bg-mist">จัดการเรื่องนี้</button>
                    </div>
                </div>
            ))}
        </div>
    )
}
