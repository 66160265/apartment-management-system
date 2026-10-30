import Icon from './Icon'
import { RepairStatusBadge } from './RepairParts'
import { repairCategories } from '../data/repairs'
import { baht } from '../lib/billing'
import { formatSlot, formatThaiDate } from '../lib/repairs'
import { needsAction, needsNewTime } from '../lib/userRepairs'

const thClass = 'px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10'

// ป้ายบอกสิ่งที่ผู้เช่าต้องทำหรือสถานะค่าซ่อมของเรื่องหนึ่ง (แสดงใต้ป้ายสถานะ)
// ids = { unpaid, review, paid } ชุดเลขเรื่องที่ค้างชำระ / รอตรวจสลิป / ชำระแล้ว
function RepairNotes({ repair: r, ids, spaced = false }) {
    // spaced = มีระยะห่างบนเมื่ออยู่ใต้ป้ายสถานะในตาราง (ในการ์ดใช้ระยะห่างของการ์ดเอง)
    const m = spaced ? ' mt-1' : ''
    return (
        <>
            {needsAction(r) && <div className={`text-xs font-semibold text-red-600${m}`}>รอคุณยืนยัน</div>}
            {needsNewTime(r) && <div className={`text-xs font-semibold text-red-600${m}`}>กรุณาเลือกเวลาใหม่</div>}
            {ids.unpaid.has(r.id) && <div className={`text-xs font-semibold text-amber-700${m}`}>ค้างชำระ {baht(r.cost)}</div>}
            {ids.review.has(r.id) && <div className={`text-xs font-semibold text-sky-700${m}`}>รอตรวจสอบสลิป</div>}
            {ids.paid.has(r.id) && <div className={`text-xs font-semibold text-emerald-700${m}`}>ชำระค่าซ่อมแล้ว</div>}
        </>
    )
}

// ตารางรายการ (จอใหญ่) กดแถวเพื่อเปิดดู/แก้ไข รายการที่รออยู่พื้นสีฟ้า
function RepairTable({ rows, ids, onOpen }) {
    return (
        <table className="hidden xl:table w-full min-w-[44rem] border-collapse text-sm">
            <thead className="sticky top-0 z-10">
                <tr className="bg-primary-dark text-white">
                    <th className={`${thClass} text-center w-12`}>#</th>
                    <th className={`${thClass} text-center`}>วันที่แจ้ง</th>
                    <th className={`${thClass} text-left`}>ปัญหา</th>
                    <th className={`${thClass} text-left`}>วันนัดซ่อม</th>
                    <th className={`${thClass} text-center`}>สถานะ</th>
                    <th className={`${thClass} text-center`}>จัดการ</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((r, index) => (
                    <tr
                        key={r.id}
                        onClick={() => onOpen(r)}
                        className={`cursor-pointer border-b border-line transition-colors hover:bg-mist/30 ${r.status === 'pending' ? 'bg-sky-50/50' : index % 2 ? 'bg-sand/40' : 'bg-white'}`}
                    >
                        <td className="px-3 py-3 border-x border-line/60 text-center text-xs text-muted tabular-nums">{index + 1}</td>
                        <td className="px-3 py-3 border-x border-line/60 text-center text-muted whitespace-nowrap">{formatThaiDate(r.created_at)}</td>
                        <td className="px-3 py-3 border-x border-line/60 font-medium text-ink">
                            <span className="inline-flex items-center gap-2">
                                {r.problem}
                                {r.image_path && <Icon name="image" className="w-4 h-4 text-secondary" />}
                            </span>
                        </td>
                        <td className="px-3 py-3 border-x border-line/60 text-muted whitespace-nowrap">
                            {r.status === 'in_progress' && r.appointment_date ? formatSlot(r.appointment_date, r.appointment_period) : '-'}
                        </td>
                        <td className="px-3 py-3 border-x border-line/60 text-center">
                            <RepairStatusBadge status={r.status} />
                            <RepairNotes repair={r} ids={ids} spaced />
                        </td>
                        <td className="border-x border-line/60 px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => onOpen(r)} className="px-4 py-1 rounded-lg text-sm bg-mist/60 text-primary-dark hover:bg-mist whitespace-nowrap">
                                {r.status === 'pending' ? 'แก้ไข' : needsAction(r) ? 'ยืนยัน' : 'ดูรายละเอียด'}
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

// การ์ดรายการแทนตาราง (จอเล็ก/กลาง)
function RepairCards({ rows, ids, onOpen }) {
    return (
        <div className="xl:hidden grid gap-3 md:grid-cols-2">
            {rows.map((r) => (
                <div
                    key={r.id}
                    className={`rounded-2xl border border-line p-4 flex flex-col gap-3 ${r.status === 'pending' ? 'bg-sky-50/60' : 'bg-white'}`}
                >
                    <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="font-medium text-ink wrap-break-word">
                                {r.problem}
                                {r.image_path && <Icon name="image" className="inline-block ml-2 -mt-0.5 w-4 h-4 text-secondary" />}
                            </div>
                            <div className="text-xs text-muted mt-0.5">แจ้งเมื่อ {formatThaiDate(r.created_at)}</div>
                            {r.status === 'in_progress' && r.appointment_date && (
                                <div className="text-xs text-violet-700 mt-0.5">นัด {formatSlot(r.appointment_date, r.appointment_period)}</div>
                            )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <RepairStatusBadge status={r.status} />
                        </div>
                    </div>
                    <RepairNotes repair={r} ids={ids} />
                    <button onClick={() => onOpen(r)} className="py-2 rounded-xl text-sm bg-mist/60 text-primary-dark hover:bg-mist">
                        {r.status === 'pending' ? 'แก้ไขเรื่องนี้' : needsAction(r) ? 'ตรวจสอบและยืนยัน' : 'ดูรายละเอียด'}
                    </button>
                </div>
            ))}
        </div>
    )
}

// หน้ารายการแจ้งซ่อมของผู้เช่า: การ์ดสรุปห้องและจำนวนที่ยังไม่เสร็จ แท็บสถานะ ตัวกรอง และตาราง/การ์ดรายการ
// active = จำนวนที่ยังไม่เสร็จ, actionCount = จำนวนที่รอผู้เช่าดำเนินการ, countOf(key) = จำนวนตามแท็บ
// visible = รายการที่ผ่านตัวกรองและเรียงแล้ว, total = จำนวนรายการทั้งหมด, ids = { unpaid, review, paid }
function UserRepairList({
    room, active, actionCount, tabs, countOf, activeTab, setActiveTab,
    categoryFilter, setCategoryFilter, oldestFirst, setOldestFirst,
    visible, total, ids, onOpen, onNew,
}) {
    return (
        <>
            {/* การ์ดสรุปห้องและจำนวนที่ยังไม่เสร็จ */}
            <div className="rounded-2xl bg-linear-to-br from-primary-dark to-primary text-white p-5 sm:p-6 shadow-card flex items-center justify-between gap-4">
                <div>
                    <div className="text-sm text-white/75">ห้อง {room}</div>
                    <div className="text-2xl sm:text-3xl font-semibold mt-1">
                        {active > 0 ? `${active} รายการที่ยังไม่เสร็จ` : 'ไม่มีรายการค้างซ่อม'}
                    </div>
                    {actionCount > 0 && (
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-sm">
                            <Icon name="bell" className="w-4 h-4" />
                            {actionCount} รายการรอคุณดำเนินการ
                        </div>
                    )}
                </div>
                <Icon name="wrench" className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 text-white/30" />
            </div>

            {/* แท็บสถานะพร้อมจำนวน (กดเพื่อกรอง) */}
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
                {tabs.map((t) => {
                    const isActive = activeTab === t.key
                    return (
                        <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            aria-pressed={isActive}
                            className={`text-left rounded-xl sm:rounded-2xl p-2.5 sm:p-4 bg-white shadow-card border-2 transition ${isActive ? 'border-primary' : 'border-transparent hover:border-mist'}`}
                        >
                            <div className="text-xs sm:text-sm leading-tight text-muted"><span className="sm:hidden">{t.short ?? t.label}</span><span className="hidden sm:inline">{t.label}</span></div>
                            <div className="mt-1 flex items-baseline gap-2">
                                <span className="text-xl sm:text-2xl font-semibold text-primary-dark">{countOf(t.key)}</span>
                                <span className="hidden sm:inline text-xs text-muted">รายการ</span>
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* ยังไม่เคยแจ้งซ่อม: ปุ่มแจ้งรายการแรก / มีรายการ: กล่องรายการ */}
            {total === 0 ? (
                <div className="bg-white rounded-2xl border border-line shadow-card text-center py-12 text-muted">
                    <p>ยังไม่เคยแจ้งซ่อม</p>
                    <button onClick={onNew} className="mt-3 text-primary hover:underline font-medium">แจ้งซ่อมรายการแรก</button>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5">
                    {/* หัวกล่อง: จำนวนรายการ + ตัวกรองประเภท + ปุ่มเรียงลำดับ */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <h2 className="font-medium text-primary-dark">
                            รายการแจ้งซ่อม
                            <span className="ml-2 text-sm font-normal text-muted">({visible.length})</span>
                        </h2>
                        {/* จอเล็ก: ประเภทกับปุ่มเรียงอยู่แถวเดียวกัน กว้างและสูงเท่ากัน */}
                        <div className="w-full sm:w-auto grid grid-cols-2 gap-2 sm:flex sm:items-center">
                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                aria-label="กรองตามประเภท"
                                className="h-9 min-w-0 w-full sm:w-auto border border-line bg-sand/50 rounded-xl px-3 text-sm outline-none focus:border-secondary focus:bg-white"
                            >
                                <option value="all">ทุกประเภท</option>
                                {Object.entries(repairCategories).map(([k, label]) => (
                                    <option key={k} value={k}>{label}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => setOldestFirst((v) => !v)}
                                className="h-9 min-w-0 flex items-center justify-center gap-1.5 whitespace-nowrap border border-line bg-sand/50 rounded-xl px-3 text-[16px] sm:text-sm text-ink hover:bg-white"
                            >
                                <Icon name="calendar" className="w-4 h-4 text-muted" />
                                {oldestFirst ? 'เก่าสุด → ใหม่สุด' : 'ใหม่สุด → เก่าสุด'}
                            </button>
                        </div>
                    </div>

                    {visible.length === 0 ? (
                        <p className="text-center py-12 text-muted">ไม่มีรายการที่ตรงกับเงื่อนไข</p>
                    ) : (
                        <div className="xl:overflow-auto xl:max-h-[36rem] xl:rounded-xl xl:border xl:border-line xl:shadow-sm">
                            <RepairTable rows={visible} ids={ids} onOpen={onOpen} />
                            <RepairCards rows={visible} ids={ids} onOpen={onOpen} />
                        </div>
                    )}
                </div>
            )}
        </>
    )
}

export default UserRepairList
