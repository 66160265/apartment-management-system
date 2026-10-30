import MonthlyColumns from './MonthlyColumns'
import { ExportButton, MobileCard, Stat } from './ReportParts'
import { baht, formatMonth } from '../lib/billing'

// ส่วนการใช้น้ำ-ไฟของหน้ารายงาน (pages/ReportsPage.jsx)

// แนวโน้มการใช้น้ำ-ไฟย้อนหลัง (แยกสองกราฟ เพราะคนละหน่วยและคนละสเกล)
// waterRows/electricRows = [{ key, label, value }] รายเดือน
export function UtilityTrend({ month, waterRows, electricRows }) {
    return (
        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-4">
            <h2 className="font-medium text-primary-dark">แนวโน้มการใช้น้ำ-ไฟ 12 เดือนล่าสุด (ถึง {formatMonth(month)})</h2>
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                <MonthlyColumns title="หน่วยน้ำรวมทุกห้อง" unit="หน่วย" color="#2a78d6" rows={waterRows} />
                <MonthlyColumns title="หน่วยไฟรวมทุกห้อง" unit="หน่วย" color="#eb6834" rows={electricRows} />
            </div>
        </section>
    )
}

// การใช้น้ำ-ไฟของเดือนที่เลือก utility = ผลของ utilityStats(), usageRows = ผลของ roomUsage(), invoiceCount = จำนวนใบของเดือนนั้น
export function UtilityUsage({ month, utility, usageRows, invoiceCount, onExport }) {
    return (
        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-medium text-primary-dark">การใช้น้ำ-ไฟ เดือน {formatMonth(month)}</h2>
                <ExportButton onClick={onExport}>การใช้น้ำ-ไฟรายห้อง (CSV)</ExportButton>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="น้ำรวม" value={`${utility.waterUnits.toLocaleString()} หน่วย`} hint={utility.waterAvgRate !== null ? `ค่าน้ำ ${baht(utility.waterCost)} · เฉลี่ย ${utility.waterAvgRate} บาท/หน่วย` : 'ยังไม่มีข้อมูล'} />
                <Stat label="ไฟรวม" value={`${utility.elecUnits.toLocaleString()} หน่วย`} hint={utility.elecAvgRate !== null ? `ค่าไฟ ${baht(utility.elecCost)} · เฉลี่ย ${utility.elecAvgRate} บาท/หน่วย` : 'ยังไม่มีข้อมูล'} />
                <Stat label="ค่าน้ำ + ค่าไฟรวม" value={baht(utility.totalCost)} hint={`จาก ${invoiceCount} ใบแจ้งหนี้`} />
            </div>
            {usageRows.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">ยังไม่มีใบแจ้งหนี้ของเดือนนี้</p>
            ) : (
                <>
                    <ul className="md:hidden flex flex-col gap-2 max-h-96 overflow-y-auto">
                        {usageRows.map((r) => (
                            <MobileCard
                                key={r.room}
                                title={<><span className="font-medium">{r.room}</span> <span className="text-muted">· {r.tenant}</span></>}
                                aside={<span className="font-semibold tabular-nums text-primary-dark">{baht(r.totalCost)}</span>}
                                rows={[
                                    [`น้ำ ${r.water.toLocaleString()} หน่วย`, baht(r.waterCost)],
                                    [`ไฟ ${r.electric.toLocaleString()} หน่วย`, baht(r.elecCost)],
                                ]}
                            />
                        ))}
                    </ul>
                    <div className="hidden md:block border border-line rounded-xl overflow-hidden">
                        <div className="max-h-80 overflow-auto">
                            <table className="w-full text-sm min-w-[560px] table-fixed">
                                {/* ห้อง/ผู้เช่ากว้างกว่า ช่องตัวเลข 3 ช่องเท่ากัน */}
                                <colgroup>
                                    <col className="w-[34%]" />
                                    <col className="w-[22%]" />
                                    <col className="w-[22%]" />
                                    <col className="w-[22%]" />
                                </colgroup>
                                <thead className="bg-sand/40 sticky top-0 border-b border-line text-xs text-muted">
                                    <tr>
                                        <th className="py-2.5 px-4 text-left font-normal">ห้อง / ผู้เช่า</th>
                                        <th className="py-2.5 px-4 text-right font-normal">น้ำ</th>
                                        <th className="py-2.5 px-4 text-right font-normal">ไฟ</th>
                                        <th className="py-2.5 px-4 text-right font-normal">ค่าน้ำ + ค่าไฟ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line/60">
                                    {usageRows.map((r) => (
                                        <tr key={r.room}>
                                            <td className="py-2.5 px-4 text-ink truncate">
                                                <span className="font-medium">{r.room}</span> <span className="text-muted">· {r.tenant}</span>
                                            </td>
                                            <td className="py-2.5 px-4 text-right tabular-nums">
                                                {r.water.toLocaleString()} หน่วย
                                                <div className="text-xs text-muted">{baht(r.waterCost)}</div>
                                            </td>
                                            <td className="py-2.5 px-4 text-right tabular-nums">
                                                {r.electric.toLocaleString()} หน่วย
                                                <div className="text-xs text-muted">{baht(r.elecCost)}</div>
                                            </td>
                                            <td className="py-2.5 px-4 text-right tabular-nums font-medium text-primary-dark">{baht(r.totalCost)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-sand/40 border-t border-line font-medium text-ink">
                                    <tr>
                                        <td className="py-2.5 px-4">รวม {usageRows.length} ห้อง</td>
                                        <td className="py-2.5 px-4 text-right tabular-nums">{utility.waterUnits.toLocaleString()} หน่วย</td>
                                        <td className="py-2.5 px-4 text-right tabular-nums">{utility.elecUnits.toLocaleString()} หน่วย</td>
                                        <td className="py-2.5 px-4 text-right tabular-nums text-primary-dark">{baht(utility.totalCost)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </section>
    )
}
