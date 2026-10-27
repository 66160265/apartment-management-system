import { CountBar, Stat } from './ReportParts'
import { repairCategories } from '../data/repairs'
import { baht } from '../lib/billing'

// สถิติแจ้งซ่อมของหน้ารายงาน (pages/ReportsPage.jsx) ทั้งหมดในระบบ ไม่นับเรื่องที่ยกเลิก
// stats = ผลของ repairStats(), unpaid = ผลของ unpaidRepairSummary()
function RepairStatsSection({ stats, unpaid }) {
    return (
        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-4">
            <h2 className="font-medium text-primary-dark">สถิติแจ้งซ่อม</h2>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
                <Stat label="เรื่องแจ้งซ่อมทั้งหมด" value={stats.total} hint="ไม่นับเรื่องที่ยกเลิก" />
                <Stat label="ซ่อมเสร็จแล้ว" value={stats.doneCount} tone="text-emerald-700" />
                <Stat label="ยังไม่เสร็จ" value={stats.openCount} hint={stats.overdue.length > 0 ? `ค้างเกิน 7 วัน ${stats.overdue.length} เรื่อง` : undefined} tone={stats.overdue.length > 0 ? 'text-amber-700' : 'text-primary-dark'} />
                <Stat
                    label="ผู้เช่าที่ยังไม่ชำระค่าซ่อม"
                    value={`${unpaid.tenantCount} คน`}
                    hint={unpaid.repairCount > 0 ? `ค้างรวม ${baht(unpaid.total)} จาก ${unpaid.repairCount} เรื่อง` : 'ไม่มีค่าซ่อมค้างชำระ'}
                    tone={unpaid.tenantCount > 0 ? 'text-amber-700' : 'text-primary-dark'}
                />
                <Stat label="ค่าซ่อมทั้งหมด" value={baht(stats.costTotal)} hint={`หอพักจ่าย ${baht(stats.costOwner)} · ผู้เช่าจ่าย ${baht(stats.costTenant)}`} />
            </div>
            {stats.total > 0 && (
                <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                    <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-medium text-ink">แยกตามประเภท</h3>
                        <ul className="flex flex-col gap-2">
                            {stats.byCategory.map((c) => (
                                <CountBar key={c.key} label={repairCategories[c.key] ?? c.key} count={c.count} max={stats.byCategory[0].count} />
                            ))}
                        </ul>
                    </div>
                    <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-medium text-ink">ห้องที่แจ้งซ่อมบ่อย (5 อันดับ)</h3>
                        <ul className="flex flex-col gap-2">
                            {stats.byRoom.slice(0, 5).map((r) => (
                                <CountBar key={r.key} label={`ห้อง ${r.key}`} count={r.count} max={stats.byRoom[0].count} />
                            ))}
                        </ul>
                    </div>
                </div>
            )}
            {stats.overdue.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-amber-800">ค้างเกิน 7 วัน</h3>
                    <ul className="flex flex-col divide-y divide-line/60 text-sm">
                        {stats.overdue.map((r) => (
                            <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                                <span className="text-ink">{r.room} <span className="text-muted">· {r.problem}</span></span>
                                <span className="tabular-nums text-amber-700 font-medium whitespace-nowrap">{r.days} วัน</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    )
}

export default RepairStatsSection
