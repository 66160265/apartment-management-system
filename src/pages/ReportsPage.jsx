import { useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { currentMonth, formatMonth, thaiDateOf } from '../lib/billing'
import { downloadCsv } from '../lib/downloadCsv'
import {
    csvFileName, expiringContracts, invoiceColumns, monthlyColumns, monthlyRows, monthlySummary, monthOf, moveOutColumns, occupancy, outstandingColumns, outstandingRows,
    owedFromMoveOuts, paymentColumns, recentMonths, repairStats, reportYears, roomUsage, toCsv, trendRows, unpaidRepairSummary, utilityColumns, utilityHistory, utilityStats, vacancyRows,
    yearlyColumns, yearlySummary,
} from '../lib/reports'
import { useReportData } from '../lib/useReportData'
import { useSettings } from '../lib/useSettings'
import TrendChart from '../components/TrendChart'
import ExpensesSection from '../components/ExpensesSection'
import { MonthlyHistory, OutstandingSection, YearlySummary } from '../components/ReportMoney'
import RepairStatsSection from '../components/ReportRepairs'
import { MoveOutsSection, VacancyAndContracts } from '../components/ReportRooms'
import { MonthSummary, OccupancyStats } from '../components/ReportSummary'
import { UtilityTrend, UtilityUsage } from '../components/ReportUtility'
import { SkeletonCardGrid, SkeletonTable } from '../components/Skeleton.jsx'

// รายงานสำหรับแอดมิน: อัตราเข้าพัก รายรับ-ยอดค้างรายเดือน และส่งออก CSV (เปิดใน Excel/ส่งให้นักบัญชีได้)
// รายรับนับตามวันที่ได้รับเงินจริง (วันที่ยืนยันสลิป) ไม่ใช่เดือนของใบแจ้งหนี้
// หน้านี้โหลดข้อมูล (useReportData) คำนวณสรุป (lib/reports.js) และส่งออก CSV ส่วนที่แสดงผลแยกอยู่ใน components/Report*.jsx
function ReportsPage() {
    // วันครบกำหนดจากหน้าตั้งค่า ใช้นับ "เกินกำหนดกี่วัน" ของใบที่ไม่ได้บันทึกวันครบกำหนดไว้
    const { dueDay } = useSettings()
    const [month, setMonth] = useState(currentMonth())
    const { data, loading, error, now, reload } = useReportData()

    const months = useMemo(() => recentMonths(currentMonth(), 12), [])
    const summary = useMemo(() => monthlySummary(data, month, now), [data, month, now])
    const rows12 = useMemo(() => monthlyRows(data, months, now), [data, months, now])
    const occ = useMemo(() => occupancy(data.rooms), [data.rooms])
    const outstanding = useMemo(() => outstandingRows(data.invoices, now, dueDay), [data.invoices, now, dueDay])
    const outstandingTotal = outstanding.reduce((acc, r) => acc + r.balance, 0)
    const owedAfterMoveOut = owedFromMoveOuts(data.moveOuts)
    // ห้องว่าง (ว่างมากี่วัน) สัญญาที่หมดใน 90 วัน และสถิติแจ้งซ่อม
    const vacancies = useMemo(() => vacancyRows(data.rooms, data.moveOuts, now), [data.rooms, data.moveOuts, now])
    const expiring = useMemo(() => expiringContracts(data.tenants, now, 90), [data.tenants, now])
    const rstats = useMemo(() => repairStats(data.repairs, now), [data.repairs, now])
    const unpaidRepair = useMemo(() => unpaidRepairSummary(data.repairs, data.repairPayments), [data.repairs, data.repairPayments])
    const invoiceById = useMemo(() => Object.fromEntries(data.invoices.map((i) => [i.id, i])), [data.invoices])

    // ใบแจ้งหนี้ที่ออกในเดือนที่เลือก (บิลของเดือนก่อนหน้า)
    const exportInvoices = () =>
        downloadCsv(csvFileName('ใบแจ้งหนี้', summary.billMonth), toCsv(data.invoices.filter((i) => i.month === summary.billMonth).sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true })), invoiceColumns))
    const exportPayments = () =>
        downloadCsv(
            csvFileName('การรับเงิน', month),
            toCsv(data.invoicePayments.filter((p) => monthOf(p.confirmed_at) === month).sort((a, b) => a.confirmed_at.localeCompare(b.confirmed_at)), paymentColumns(invoiceById)),
        )
    const exportOutstanding = () => downloadCsv(csvFileName('ยอดค้างชำระ', thaiDateOf(now)), toCsv(outstanding, outstandingColumns))
    // การใช้น้ำ-ไฟของเดือนที่เลือก (เดิมอยู่ในหน้าภาพรวม ย้ายมาไว้ที่นี่)
    const monthInvoices = useMemo(() => data.invoices.filter((i) => i.month === month), [data.invoices, month])
    const utility = useMemo(() => utilityStats(monthInvoices), [monthInvoices])
    const usageRows = useMemo(() => roomUsage(monthInvoices), [monthInvoices])
    // แนวโน้มหน่วยน้ำ-ไฟ 12 เดือนล่าสุด (นับถึงเดือนที่เลือก) ใช้ใบแจ้งหนี้ทั้งหมดที่โหลดมา
    const history = useMemo(() => utilityHistory(data.invoices, month, 12), [data.invoices, month])
    const waterRows = useMemo(() => history.map((h) => ({ key: h.month, label: formatMonth(h.month), value: h.water })), [history])
    const electricRows = useMemo(() => history.map((h) => ({ key: h.month, label: formatMonth(h.month), value: h.electric })), [history])
    const exportUtility = () => downloadCsv(csvFileName('การใช้น้ำไฟ', month), toCsv(usageRows, utilityColumns))
    const exportMoveOuts = () => downloadCsv(csvFileName('ย้ายออกและเงินประกัน', thaiDateOf(now)), toCsv(data.moveOuts, moveOutColumns))
    // แนวโน้มรายรับ-รายจ่าย 12 เดือนล่าสุด (นับถึงเดือนที่เลือก)
    const trend = useMemo(() => trendRows(data, month, 12, now).map((r) => ({ ...r, key: r.month, label: formatMonth(r.month) })), [data, month, now])
    // สรุปรายปี (ปี ค.ศ. ในข้อมูล แสดงเป็น พ.ศ.)
    const years = useMemo(() => reportYears(data, now), [data, now])
    const [year, setYear] = useState(() => thaiDateOf(new Date()).slice(0, 4))
    const yearly = useMemo(() => yearlySummary(data, year, now), [data, year, now])
    const exportYearly = () => downloadCsv(csvFileName('สรุปรายปี', year), toCsv([...yearly.rows, { ...yearly.totals, month: 'รวม' }], yearlyColumns))
    const exportMonthly = () => downloadCsv(csvFileName('สรุปรายเดือน', `${months.at(-1)}_${months[0]}`), toCsv([...rows12].reverse(), monthlyColumns))

    return (
        <>
            <PageHeader title="รายงาน" subtitle="อัตราเข้าพัก รายรับ ยอดค้างชำระ และส่งออก CSV สำหรับทำบัญชี" />

            <div className="px-4 sm:px-6 pb-8 flex flex-col gap-4 sm:gap-6">
                {error ? (
                    <p className="text-center py-10 text-red-600">{error}</p>
                ) : loading ? (
                    <div className="flex flex-col gap-4 sm:gap-6"><SkeletonCardGrid count={4} /><SkeletonTable rows={5} cols={5} /></div>
                ) : (
                    <>
                        <OccupancyStats occ={occ} outstandingCount={outstanding.length} outstandingTotal={outstandingTotal} />
                        <MonthSummary month={month} onMonthChange={setMonth} summary={summary} onExportInvoices={exportInvoices} onExportPayments={exportPayments} />

                        {/* ค่าใช้จ่ายของหอพักของเดือนที่เลือก */}
                        <ExpensesSection month={month} expenses={data.expenses} invoices={data.invoices} onChanged={reload} />

                        {/* แนวโน้มรายรับ-รายจ่าย 12 เดือน */}
                        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-3">
                            <h2 className="font-medium text-primary-dark">แนวโน้ม 12 เดือนล่าสุด (ถึง {formatMonth(month)})</h2>
                            <TrendChart title="รายรับและรายจ่ายรายเดือน" rows={trend} />
                            <p className="text-xs text-muted">รายรับ = เงินที่ได้รับจริงในเดือนนั้น · รายจ่าย = ค่าซ่อมที่หอพักเป็นคนจ่าย + ค่าใช้จ่ายอื่นของหอพักที่บันทึกไว้ (ค่าไฟ ค่าน้ำ ฯลฯ)</p>
                        </section>

                        <OutstandingSection outstanding={outstanding} onExport={exportOutstanding} />
                        <VacancyAndContracts vacancies={vacancies} expiring={expiring} />
                        <RepairStatsSection stats={rstats} unpaid={unpaidRepair} />
                        <MonthlyHistory rows={rows12} onExport={exportMonthly} />
                        <YearlySummary year={year} onYearChange={setYear} years={years} yearly={yearly} onExport={exportYearly} />
                        <UtilityTrend month={month} waterRows={waterRows} electricRows={electricRows} />
                        <UtilityUsage month={month} utility={utility} usageRows={usageRows} invoiceCount={monthInvoices.length} onExport={exportUtility} />

                        {/* ย้ายออกและเงินประกัน */}
                        {data.moveOuts.length > 0 && <MoveOutsSection moveOuts={data.moveOuts} owed={owedAfterMoveOut} onExport={exportMoveOuts} />}
                    </>
                )}
            </div>
        </>
    )
}

export default ReportsPage
