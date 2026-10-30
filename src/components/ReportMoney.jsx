import { ExportButton, MobileCard, Stat } from './ReportParts'
import { baht, formatMonth } from '../lib/billing'

// ส่วนเงินของหน้ารายงาน (pages/ReportsPage.jsx): ยอดค้างชำระ รายเดือนย้อนหลัง และสรุปรายปี

// ยอดค้างชำระ (แสดง 50 รายการแรก ที่เหลือดูในไฟล์ CSV) outstanding = ผลของ outstandingRows()
export function OutstandingSection({ outstanding, onExport }) {
    return (
        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-medium text-primary-dark">ยอดค้างชำระ ({outstanding.length} ใบ)</h2>
                <ExportButton onClick={onExport}>ยอดค้างชำระ (CSV)</ExportButton>
            </div>
            {outstanding.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">ไม่มียอดค้างชำระ</p>
            ) : (
                <>
                    <ul className="md:hidden flex flex-col gap-2">
                        {outstanding.slice(0, 50).map((r) => (
                            <MobileCard
                                key={`${r.room}-${r.month}`}
                                title={<><span className="font-medium">{r.room}</span> <span className="text-muted">· {r.tenant}</span></>}
                                aside={<span className="font-semibold tabular-nums text-amber-700">{baht(r.balance)}</span>}
                                rows={[
                                    ['บิลเดือน', formatMonth(r.month)],
                                    ['ยอดบิล', baht(r.total)],
                                    ['เกินกำหนด', r.daysLate > 0 ? `${r.daysLate} วัน` : '-', r.daysLate > 0 ? 'text-red-600 font-medium' : 'text-muted'],
                                ]}
                            />
                        ))}
                    </ul>
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm min-w-[600px]">
                            <thead>
                                <tr className="text-left text-muted border-b border-line">
                                    <th className="py-2 pr-3">ห้อง / ผู้เช่า</th>
                                    <th className="py-2 px-3">เดือน</th>
                                    <th className="py-2 px-3 text-right">ยอดบิล</th>
                                    <th className="py-2 px-3 text-right">ค้างชำระ</th>
                                    <th className="py-2 pl-3 text-right">เกินกำหนด</th>
                                </tr>
                            </thead>
                            <tbody>
                                {outstanding.slice(0, 50).map((r) => (
                                    <tr key={`${r.room}-${r.month}`} className="border-b border-line/60">
                                        <td className="py-2 pr-3 text-ink">{r.room} <span className="text-muted">· {r.tenant}</span></td>
                                        <td className="py-2 px-3">{formatMonth(r.month)}</td>
                                        <td className="py-2 px-3 text-right tabular-nums">{baht(r.total)}</td>
                                        <td className="py-2 px-3 text-right tabular-nums font-medium text-amber-700">{baht(r.balance)}</td>
                                        <td className={`py-2 pl-3 text-right tabular-nums ${r.daysLate > 0 ? 'text-red-600 font-medium' : 'text-muted'}`}>{r.daysLate > 0 ? `${r.daysLate} วัน` : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {outstanding.length > 50 && <p className="text-xs text-muted">แสดง 50 รายการแรก ดูทั้งหมดในไฟล์ CSV</p>}
                </>
            )}
        </section>
    )
}

// รายเดือนย้อนหลัง 12 เดือน rows = ผลของ monthlyRows()
export function MonthlyHistory({ rows, onExport }) {
    return (
        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-medium text-primary-dark">รายเดือนย้อนหลัง 12 เดือน</h2>
                <ExportButton onClick={onExport}>สรุปรายเดือน (CSV)</ExportButton>
            </div>
            <p className="-mt-1 text-xs text-muted">คอลัมน์ "ใบที่ออก / เรียกเก็บ / ยังค้าง" นับตามเดือนที่ออกบิล: แถวเดือน ต.ค. คือใบแจ้งหนี้ค่าเช่า น้ำ ไฟ ของเดือน ก.ย. ที่ออกในเดือน ต.ค. ส่วน "รับเงิน" นับตามเดือนที่ได้รับเงินจริง</p>
            <ul className="md:hidden flex flex-col gap-2">
                {rows.map((r) => (
                    <MobileCard
                        key={r.month}
                        title={<span className="font-medium">{formatMonth(r.month)}</span>}
                        aside={<span className={`font-semibold tabular-nums ${r.net < 0 ? 'text-red-700' : 'text-emerald-700'}`}>คงเหลือ {baht(r.net)}</span>}
                        rows={[
                            ['รับเงิน', baht(r.receivedTotal), 'text-emerald-700'],
                            ['รายจ่าย', baht(r.spent)],
                            [`เรียกเก็บ (${r.issuedCount} ใบ)`, baht(r.billed)],
                            ['ยังค้าง', baht(r.outstanding), r.outstanding > 0 ? 'text-amber-700 font-medium' : 'text-ink'],
                            ['ซ่อม (หอจ่าย)', baht(r.repairCost)],
                            ['ค่าใช้จ่ายหอ', baht(r.expenseTotal)],
                            ['โอนคืน', baht(r.refunded)],
                        ]}
                    />
                ))}
            </ul>
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm min-w-[1040px] table-fixed">
                    {/* ความกว้างคอลัมน์คงที่: เดือนและจำนวนใบแคบ ช่องเงิน 8 ช่องกว้างเท่ากัน */}
                    <colgroup>
                        <col className="w-[10%]" />
                        <col className="w-[7%]" />
                        {Array.from({ length: 8 }, (_, i) => <col key={i} className="w-[10.375%]" />)}
                    </colgroup>
                    <thead>
                        <tr className="text-left text-muted border-b border-line">
                            <th className="py-2 pr-3">เดือน</th>
                            <th className="py-2 px-3 text-right">ใบที่ออก</th>
                            <th className="py-2 px-3 text-right">เรียกเก็บ</th>
                            <th className="py-2 px-3 text-right">รับเงิน</th>
                            <th className="py-2 px-3 text-right">ค่าซ่อม (ผู้เช่าจ่าย)</th>
                            <th className="py-2 px-3 text-right">ค่าซ่อม (หอพักจ่าย)</th>
                            <th className="py-2 px-3 text-right">ค่าใช้จ่ายหอ</th>
                            <th className="py-2 px-3 text-right">โอนคืน</th>
                            <th className="py-2 px-3 text-right">คงเหลือ</th>
                            <th className="py-2 pl-3 text-right">ยังค้าง</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.month} className="border-b border-line/60">
                                <td className="py-2 pr-3 font-medium text-ink">{formatMonth(r.month)}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{r.issuedCount}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.billed)}</td>
                                <td className="py-2 px-3 text-right tabular-nums text-emerald-700">{baht(r.receivedTotal)}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.repairTenantCost)}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.repairCost)}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.expenseTotal)}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.refunded)}</td>
                                <td className={`py-2 px-3 text-right tabular-nums font-medium ${r.net < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{baht(r.net)}</td>
                                <td className={`py-2 pl-3 text-right tabular-nums ${r.outstanding > 0 ? 'text-amber-700 font-medium' : ''}`}>{baht(r.outstanding)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-muted">"รับเงิน" นับตามวันที่ได้รับเงินจริง (วันที่ยืนยันสลิป) เช่น ใบเดือน ก.ย. ที่ผู้เช่าจ่ายในเดือน ต.ค. จะนับเป็นรายรับของเดือน ต.ค. ส่วน "ยังค้าง" คือยอดของใบเดือนนั้นที่ยังไม่ได้จ่าย ณ วันนี้</p>
        </section>
    )
}

// สรุปรายปี years = ปีที่เลือกได้ (ค.ศ.), yearly = ผลของ yearlySummary() ปีแสดงเป็น พ.ศ.
export function YearlySummary({ year, onYearChange, years, yearly, onExport }) {
    return (
        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-medium text-primary-dark">สรุปรายปี {Number(year) + 543}</h2>
                <div className="flex items-center gap-2">
                    <select value={year} onChange={(e) => onYearChange(e.target.value)} aria-label="เลือกปี" className="border border-line bg-sand/50 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-secondary">
                        {years.map((y) => <option key={y} value={y}>พ.ศ. {Number(y) + 543}</option>)}
                    </select>
                    <ExportButton onClick={onExport}>สรุปรายปี (CSV)</ExportButton>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                <Stat label="รับเงินจริงทั้งปี" value={baht(yearly.totals.receivedTotal)} hint={`เรียกเก็บ ${baht(yearly.totals.billed)} จาก ${yearly.totals.issuedCount} ใบ`} tone="text-emerald-700" />
                <Stat label="ค่าซ่อมที่หอพักจ่าย" value={baht(yearly.totals.repairCost)} hint={`ผู้เช่าจ่ายเอง ${baht(yearly.totals.repairTenantCost)}`} />
                <Stat label="ค่าใช้จ่ายของหอพัก" value={baht(yearly.totals.expenseTotal)} hint="ค่าไฟ ค่าน้ำ ค่าแม่บ้าน ฯลฯ ที่บันทึกไว้" mobileHint={null} />
                <Stat label="คงเหลือทั้งปี" value={baht(yearly.totals.net)} hint="รับเงินจริง − รายจ่ายทั้งหมด" mobileHint={null} tone={yearly.totals.net < 0 ? 'text-red-700' : 'text-emerald-700'} />
            </div>
            <ul className="md:hidden flex flex-col gap-2">
                {yearly.rows.map((r) => (
                    <MobileCard
                        key={r.month}
                        title={<span className="font-medium">{formatMonth(r.month)}</span>}
                        aside={<span className={`font-semibold tabular-nums ${r.net < 0 ? 'text-red-700' : 'text-emerald-700'}`}>คงเหลือ {baht(r.net)}</span>}
                        rows={[
                            ['รับเงินจริง', baht(r.receivedTotal), 'text-emerald-700'],
                            ['รายจ่ายรวม', baht(r.spent)],
                            ['ซ่อม (หอจ่าย)', baht(r.repairCost)],
                            ['ค่าใช้จ่ายหอ', baht(r.expenseTotal)],
                            ['โอนคืน', baht(r.refunded)],
                        ]}
                    />
                ))}
                <MobileCard
                    className="bg-sand/50"
                    title={<span className="font-semibold">รวมทั้งปี</span>}
                    aside={<span className={`font-semibold tabular-nums ${yearly.totals.net < 0 ? 'text-red-700' : 'text-emerald-700'}`}>คงเหลือ {baht(yearly.totals.net)}</span>}
                    rows={[
                        ['รับเงินจริง', baht(yearly.totals.receivedTotal), 'text-emerald-700 font-semibold'],
                        ['รายจ่ายรวม', baht(yearly.totals.spent), 'text-ink font-semibold'],
                    ]}
                />
            </ul>
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm min-w-[760px] table-fixed">
                    <colgroup>
                        <col className="w-[12%]" />
                        {Array.from({ length: 5 }, (_, i) => <col key={i} className="w-[17.6%]" />)}
                    </colgroup>
                    <thead>
                        <tr className="text-left text-muted border-b border-line">
                            <th className="py-2 pr-3">เดือน</th>
                            <th className="py-2 px-3 text-right">รับเงินจริง</th>
                            <th className="py-2 px-3 text-right">ค่าซ่อม (หอพักจ่าย)</th>
                            <th className="py-2 px-3 text-right">ค่าใช้จ่ายหอ</th>
                            <th className="py-2 px-3 text-right">รายจ่ายรวม</th>
                            <th className="py-2 pl-3 text-right">คงเหลือ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {yearly.rows.map((r) => (
                            <tr key={r.month} className="border-b border-line/60">
                                <td className="py-2 pr-3 font-medium text-ink">{formatMonth(r.month)}</td>
                                <td className="py-2 px-3 text-right tabular-nums text-emerald-700">{baht(r.receivedTotal)}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.repairCost)}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.expenseTotal)}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.refunded)}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.spent)}</td>
                                <td className={`py-2 pl-3 text-right tabular-nums font-medium ${r.net < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{baht(r.net)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="font-semibold text-ink border-t-2 border-line">
                            <td className="py-2.5 pr-3">รวมทั้งปี</td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-emerald-700">{baht(yearly.totals.receivedTotal)}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums">{baht(yearly.totals.repairCost)}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums">{baht(yearly.totals.expenseTotal)}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums">{baht(yearly.totals.spent)}</td>
                            <td className={`py-2.5 pl-3 text-right tabular-nums ${yearly.totals.net < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{baht(yearly.totals.net)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <p className="text-xs text-muted">นับตั้งแต่ต้นปีถึงเดือนปัจจุบัน รายรับนับตามวันที่ได้รับเงินจริง · ค่าปรับที่เก็บได้ทั้งปี {baht(yearly.totals.lateFees)}</p>
        </section>
    )
}
