import { Avatar, ContractBadge } from './TenantParts'
import { REQUIRED_DOCS, formatDate } from '../lib/tenants'

// ตารางและการ์ดรายชื่อผู้เช่าในหน้าผู้เช่าของแอดมิน (pages/TenantsPage.jsx)
// docCounts = จำนวนเอกสารหลักต่อห้อง, onOpen(tenant) = เปิดหน้ารายละเอียด

// คลาสของช่องในตารางและหัวตาราง
const cell = 'px-3 py-3 border-x border-line/60'
const head = 'px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10'

// ป้ายสถานะเอกสาร "ครบ" หรือ "จำนวนที่มี/จำนวนที่ต้องมี" (label = ข้อความนำหน้า เช่น "เอกสาร ")
function DocsBadge({ docs, label = '' }) {
    const complete = docs >= REQUIRED_DOCS.length
    return (
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
            complete ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
        }`}>
            {label}{complete ? 'ครบ' : `${docs}/${REQUIRED_DOCS.length}`}
        </span>
    )
}

// จอใหญ่: ตารางผู้เช่า (ชื่อ ห้อง เบอร์ ระยะสัญญา สถานะสัญญา เอกสาร) กดแถวเพื่อดูรายละเอียด
export function TenantRows({ rows, docCounts, onOpen }) {
    return (
        <table className="hidden xl:table w-full min-w-[56rem] border-collapse text-sm">
            <thead className="sticky top-0 z-10">
                <tr className="bg-primary-dark text-white">
                    <th className={`${head} text-center w-12`}>#</th>
                    <th className={`${head} text-left`}>ผู้เช่า</th>
                    <th className={`${head} text-center`}>ห้อง</th>
                    <th className={`${head} text-left`}>เบอร์โทร</th>
                    <th className={`${head} text-center`}>ระยะสัญญา</th>
                    <th className={`${head} text-center`}>สถานะสัญญา</th>
                    <th className={`${head} text-center`}>เอกสาร</th>
                    <th className={`${head} text-center`}>จัดการ</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((t, index) => (
                    <tr
                        key={t.room}
                        onClick={() => onOpen(t)}
                        className={`cursor-pointer border-b border-line transition-colors hover:bg-mist/30 ${index % 2 ? 'bg-sand/40' : 'bg-white'}`}
                    >
                        <td className={`${cell} text-center text-xs text-muted tabular-nums`}>{index + 1}</td>
                        <td className={cell}>
                            <div className="flex items-center gap-3">
                                <Avatar name={t.name} />
                                <div>
                                    <div className="font-medium text-ink">{t.name}</div>
                                    {t.username && <div className="text-xs text-muted">@{t.username.toLowerCase()}</div>}
                                </div>
                            </div>
                        </td>
                        <td className={`${cell} text-center`}>
                            <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold">{t.room}</span>
                        </td>
                        <td className={`${cell} tabular-nums`}>{t.phone}</td>
                        <td className={`${cell} text-center text-muted whitespace-nowrap`}>{formatDate(t.startDate)} – {formatDate(t.endDate)}</td>
                        <td className={`${cell} text-center`}><ContractBadge endDate={t.endDate} showHint /></td>
                        <td className={`${cell} text-center`}><DocsBadge docs={docCounts[t.room] ?? 0} /></td>
                        <td className="border-x border-line/60 px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => onOpen(t)} className="px-4 py-1 rounded-lg text-sm bg-mist/60 text-primary-dark hover:bg-mist">รายละเอียด</button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

// จอเล็ก/กลาง: แสดงเป็นการ์ด
export function TenantCards({ rows, docCounts, onOpen }) {
    return (
        <div className="xl:hidden grid gap-3 md:grid-cols-2">
            {rows.map((t) => (
                <button
                    key={t.room}
                    type="button"
                    onClick={() => onOpen(t)}
                    className="text-left rounded-2xl border border-line bg-white p-4 flex flex-col gap-3 hover:border-secondary transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <Avatar name={t.name} />
                        <div className="min-w-0 flex-1">
                            <div className="font-medium text-ink truncate">{t.name}</div>
                            {t.username && <div className="text-xs text-muted">@{t.username.toLowerCase()}</div>}
                        </div>
                        <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold text-center">{t.room}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <div className="text-xs text-muted">เบอร์โทร</div>
                            <div className="tabular-nums">{t.phone}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted">ระยะสัญญา</div>
                            <div>{formatDate(t.startDate)} – {formatDate(t.endDate)}</div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <ContractBadge endDate={t.endDate} showHint />
                        <DocsBadge docs={docCounts[t.room] ?? 0} label="เอกสาร " />
                    </div>
                </button>
            ))}
        </div>
    )
}
