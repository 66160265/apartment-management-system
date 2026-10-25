import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon'
import MonthPicker from '../components/MonthPicker'
import PageHeader from '../components/PageHeader'
import { baht, currentMonth, formatMonth, thaiDateOf } from '../lib/billing'
import { repairCategories } from '../data/repairs'
import { formatDate } from '../lib/tenants'
import { downloadCsv } from '../lib/downloadCsv'
import {
    csvFileName, expiringContracts, invoiceColumns, monthlyColumns, monthlyRows, monthlySummary, monthOf, moveOutColumns, occupancy, outstandingColumns, outstandingRows,
    owedFromMoveOuts, paymentColumns, recentMonths, repairStats, reportYears, roomUsage, toCsv, trendRows, unpaidRepairSummary, utilityColumns, utilityHistory, utilityStats, vacancyRows,
    yearlyColumns, yearlySummary,
} from '../lib/reports'
import { useRealtimeReload } from '../lib/realtime'
import { supabase } from '../lib/supabaseClient'
import MonthlyColumns from '../components/MonthlyColumns'
import TrendChart from '../components/TrendChart'
import ExpensesSection from '../components/ExpensesSection'
import { useSettings } from '../lib/useSettings'
import { SkeletonCardGrid, SkeletonTable } from '../components/Skeleton.jsx'
import { selectAll } from '../lib/selectAll'

// รายงานสำหรับแอดมิน: อัตราเข้าพัก รายรับ-ยอดค้างรายเดือน และส่งออก CSV (เปิดใน Excel/ส่งให้นักบัญชีได้)
// รายรับนับตามวันที่ได้รับเงินจริง (วันที่ยืนยันสลิป) ไม่ใช่เดือนของใบแจ้งหนี้

const emptyData = { rooms: [], invoices: [], invoicePayments: [], repairPayments: [], moveOuts: [], repairs: [], tenants: [], expenses: [] }

// แถบเทียบสัดส่วน (ใช้ในสถิติแจ้งซ่อม)
function CountBar({ label, count, max }) {
    return (
        <li className="flex items-center gap-3 text-sm">
            <span className="w-40 shrink-0 truncate text-ink" title={label}>{label}</span>
            <span className="flex-1 h-2 rounded-full bg-sand overflow-hidden">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }} />
            </span>
            <span className="w-14 shrink-0 text-right tabular-nums text-muted">{count} งาน</span>
        </li>
    )
}

// mobileHint: คำอธิบายแทนบนจอเล็ก (null = ซ่อนคำอธิบายบนจอเล็ก, ไม่ส่ง = ใช้ hint เดิม)
function Stat({ label, value, hint, mobileHint, tone = 'text-primary-dark', className = '' }) {
    const hasMobile = mobileHint !== undefined
    return (
        <div className={`bg-white rounded-2xl shadow-card p-3 sm:p-4 ${className}`}>
            <div className="text-xs sm:text-sm leading-tight text-muted">{label}</div>
            <div className={`text-lg sm:text-2xl font-semibold mt-1 tabular-nums ${tone}`}>{value}</div>
            {hasMobile && mobileHint && <div className="sm:hidden text-xs text-muted mt-0.5">{mobileHint}</div>}
            {hint && <div className={`text-xs text-muted mt-0.5 ${hasMobile ? 'hidden sm:block' : ''}`}>{hint}</div>}
        </div>
    )
}

// การ์ดแทนแถวตารางบนจอเล็ก (ต่ำกว่า md): หัวการ์ด + คู่ ชื่อ/ค่า 2 คอลัมน์
// rows = [[ชื่อ, ค่า, className ของค่า]] ข้ามแถวที่ค่าเป็น null
function MobileCard({ title, aside, rows, className = '' }) {
    return (
        <li className={`rounded-xl border border-line p-3 ${className}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm text-ink">{title}</div>
                {aside && <div className="shrink-0 text-sm text-right">{aside}</div>}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {rows.filter((r) => r[1] !== null).map(([k, v, cls = 'text-ink']) => (
                    <div key={k} className="flex items-baseline justify-between gap-2 min-w-0">
                        <dt className="text-muted truncate">{k}</dt>
                        <dd className={`tabular-nums whitespace-nowrap ${cls}`}>{v}</dd>
                    </div>
                ))}
            </dl>
        </li>
    )
}

// short: ชื่อปุ่มสั้นบนจอเล็ก
function ExportButton({ onClick, children, short }) {
    return (
        <button type="button" onClick={onClick} className="flex items-center justify-center gap-1.5 border border-line bg-white text-primary-dark hover:bg-mist/40 px-3 sm:px-3.5 py-1.5 rounded-xl text-sm whitespace-nowrap">
            <Icon name="download" className="w-4 h-4 shrink-0" />
            {short ? <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{children}</span></> : children}
        </button>
    )
}

function ReportsPage() {
    // วันครบกำหนดจากหน้าตั้งค่า ใช้นับ "เกินกำหนดกี่วัน" ของใบที่ไม่ได้บันทึกวันครบกำหนดไว้
    const { dueDay } = useSettings()
    const [month, setMonth] = useState(currentMonth())
    const [data, setData] = useState(emptyData)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    // เวลาที่ใช้คิดค่าปรับของยอดค้าง จำไว้ตอนโหลด (ไม่ให้ตัวเลขเปลี่ยนเองระหว่างดู)
    const [now, setNow] = useState(() => new Date())

    // ดึงข้อมูลที่รายงานใช้ทั้งหมดพร้อมกัน
    const fetchAll = () =>
        Promise.all([
            supabase.from('rooms').select('number, status, rent'),
            selectAll(() => supabase.from('invoices').select('*').order('id')),
            selectAll(() => supabase.from('invoice_payments').select('*').order('id')),
            // ตารางนี้มีเมื่อรัน ส่วน repair-payments ของไฟล์ migration แล้ว ถ้ายังไม่มีให้ถือว่าไม่มีรายรับค่าซ่อม
            selectAll(() => supabase.from('repair_payments').select('*').in('status', ['review', 'paid']).order('id')),
            // ตารางนี้มีเมื่อรัน ส่วน move-out ของไฟล์ migration แล้ว
            selectAll(() => supabase.from('move_outs').select('*').order('move_out_date', { ascending: false }).order('id')),
            // เรื่องแจ้งซ่อม (ใช้ทำสถิติยอดซ่อม)
            selectAll(() => supabase.from('repairs').select('id, room, user_id, problem, category, status, cost, cost_payer, invoice_id, created_at, completed_at').order('id')),
            // ผู้เช่าปัจจุบัน (ใช้ดูสัญญาที่ใกล้หมด)
            supabase.from('tenants').select('room, name, end_date'),
            // ค่าใช้จ่ายของหอพัก (ตารางมีเมื่อรัน migration 20261025000000 แล้ว ยังไม่มี = ไม่มีค่าใช้จ่าย)
            selectAll(() => supabase.from('expenses').select('*').order('id')),
        ])

    const apply = useCallback(([rooms, invoices, payments, repairPayments, moveOuts, repairs, tenants, expenses]) => {
        const err = rooms.error || invoices.error
        if (err) {
            setError(`โหลดข้อมูลไม่สำเร็จ: ${err.message}`)
        } else {
            setData({
                rooms: rooms.data,
                invoices: invoices.data,
                // ตารางรับเงินยังไม่มี (ยังไม่ได้รัน ส่วน payments ของไฟล์ migration) ให้รายงานแสดงเท่าที่มี
                invoicePayments: payments.error ? [] : payments.data,
                repairPayments: repairPayments.error ? [] : repairPayments.data,
                moveOuts: moveOuts.error ? [] : moveOuts.data,
                repairs: repairs.error ? [] : repairs.data,
                tenants: tenants.error ? [] : tenants.data,
                expenses: expenses.error ? [] : expenses.data,
            })
            setNow(new Date())
            setError('')
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        let active = true
        fetchAll().then((results) => active && apply(results))
        return () => {
            active = false
        }
    }, [apply])

    // อัปเดตเองเมื่อมีการเปลี่ยนใบแจ้งหนี้ การรับเงิน ค่าซ่อม เรื่องแจ้งซ่อม การย้ายออก หรือห้อง
    useRealtimeReload(['invoices', 'invoice_payments', 'repair_payments', 'repairs', 'move_outs', 'rooms', 'tenants', 'expenses'], () => fetchAll().then(apply))
    // โหลดใหม่หลังเพิ่ม/ลบค่าใช้จ่าย
    const reload = () => fetchAll().then(apply)

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
                        {/* ห้องพัก (ตอนนี้) */}
                        {/* จอเล็ก: 3 ช่องในแถวเดียว คำอธิบายสั้น */}
                        <section className="grid grid-cols-3 gap-2 sm:gap-3">
                            <Stat label="อัตราเข้าพัก" value={`${occ.rate}%`} hint={`มีผู้เช่า ${occ.occupied} จาก ${occ.total - occ.maintenance} ห้อง (ไม่รวมปิดปรับปรุง)`} mobileHint={`${occ.occupied}/${occ.total - occ.maintenance} ห้อง`} />
                            <Stat label="ห้องว่าง" value={occ.vacant} hint={occ.maintenance > 0 ? `ปิดปรับปรุง ${occ.maintenance} ห้อง` : undefined} mobileHint={occ.maintenance > 0 ? `ปรับปรุง ${occ.maintenance}` : null} />
                            <Stat label="ยอดค้างทั้งหมด" value={baht(outstandingTotal)} hint={`${outstanding.length} ใบ ทุกเดือนที่ยังไม่ชำระ`} mobileHint={`${outstanding.length} ใบ`} tone={outstandingTotal > 0 ? 'text-amber-700' : 'text-primary-dark'} />
                        </section>

                        {/* สรุปเดือนที่เลือก */}
                        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-3 sm:gap-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                                <h2 className="font-medium text-primary-dark">สรุปเดือน {formatMonth(month)}</h2>
                                <MonthPicker value={month} onChange={setMonth} />
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-5">
                                <Stat label="ใบแจ้งหนี้ที่ออกเดือนนี้" value={summary.issuedCount} hint={`บิลเดือน ${formatMonth(summary.billMonth)} · เรียกเก็บ ${baht(summary.billed)}`} mobileHint={`เรียกเก็บ ${baht(summary.billed)}`} />
                                <Stat label="รับเงินจริงในเดือนนี้" value={baht(summary.receivedTotal)} hint="ค่าห้อง ค่าน้ำไฟ และค่าซ่อมที่รวมในใบแจ้งหนี้" mobileHint={null} tone="text-emerald-700" />
                                <Stat label={`ค้างของบิล ${formatMonth(summary.billMonth)}`} value={baht(summary.outstanding)} hint={`${summary.unpaidCount} ใบ ณ วันนี้`} tone={summary.outstanding > 0 ? 'text-amber-700' : 'text-primary-dark'} />
                                <Stat label="รายจ่ายเดือนนี้" value={baht(summary.spent)} hint={<><span className="block">ค่าซ่อมที่หอพักจ่าย {baht(summary.repairCost)}</span><span className="block">ค่าใช้จ่ายของหอ {baht(summary.expenseTotal)}</span></>} mobileHint={`ซ่อม ${baht(summary.repairCost)} · หอ ${baht(summary.expenseTotal)}`} />
                                <Stat className="col-span-2 lg:col-span-1" label="คงเหลือเดือนนี้" value={baht(summary.net)} hint="รับเงินจริง − รายจ่ายเดือนนี้" tone={summary.net < 0 ? 'text-red-700' : 'text-emerald-700'} />
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                                <ExportButton onClick={exportInvoices} short="ใบแจ้งหนี้ CSV">ใบแจ้งหนี้ที่ออกเดือนนี้ (CSV)</ExportButton>
                                <ExportButton onClick={exportPayments} short="การรับเงิน CSV">การรับเงินเดือนนี้ (CSV)</ExportButton>
                            </div>
                        </section>

                        {/* ค่าใช้จ่ายของหอพักของเดือนที่เลือก */}
                        <ExpensesSection month={month} expenses={data.expenses} invoices={data.invoices} onChanged={reload} />

                        {/* แนวโน้มรายรับ-รายจ่าย 12 เดือน */}
                        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-3">
                            <h2 className="font-medium text-primary-dark">แนวโน้ม 12 เดือนล่าสุด (ถึง {formatMonth(month)})</h2>
                            <TrendChart title="รายรับและรายจ่ายรายเดือน" rows={trend} />
                            <p className="text-xs text-muted">รายรับ = เงินที่ได้รับจริงในเดือนนั้น · รายจ่าย = ค่าซ่อมที่หอพักจ่าย + ค่าใช้จ่ายของหอพักที่บันทึกไว้</p>
                        </section>

                        {/* ยอดค้างชำระ */}
                        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <h2 className="font-medium text-primary-dark">ยอดค้างชำระ ({outstanding.length} ใบ)</h2>
                                <ExportButton onClick={exportOutstanding}>ยอดค้างชำระ (CSV)</ExportButton>
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
                        {/* ห้องว่าง และสัญญาที่ใกล้หมด */}
                        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                            <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-3">
                                <h2 className="font-medium text-primary-dark">ห้องว่าง ({vacancies.length} ห้อง)</h2>
                                {vacancies.length === 0 ? (
                                    <p className="text-sm text-muted py-4 text-center">ไม่มีห้องว่าง</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-muted border-b border-line">
                                                    <th className="py-2 pr-3">ห้อง</th>
                                                    <th className="py-2 px-3">ว่างตั้งแต่</th>
                                                    <th className="py-2 pl-3 text-right">ว่างมา</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {vacancies.map((v) => (
                                                    <tr key={v.room} className="border-b border-line/60">
                                                        <td className="py-2 pr-3 font-medium text-ink">{v.room} <span className="text-xs font-normal text-muted">· {baht(v.rent)}/เดือน</span></td>
                                                        <td className="py-2 px-3">{v.since ? formatDate(v.since) : <span className="text-muted">ไม่มีบันทึกย้ายออก</span>}</td>
                                                        <td className="py-2 pl-3 text-right tabular-nums">{v.days === null ? '-' : `${v.days} วัน`}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                <p className="text-xs text-muted">นับจากวันที่ผู้เช่าคนล่าสุดย้ายออก</p>
                            </section>

                            <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-3">
                                <h2 className="font-medium text-primary-dark">สัญญาที่จะหมดใน 90 วัน ({expiring.length} ห้อง)</h2>
                                {expiring.length === 0 ? (
                                    <p className="text-sm text-muted py-4 text-center">ไม่มีสัญญาที่ใกล้หมด</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-muted border-b border-line">
                                                    <th className="py-2 pr-3">ห้อง / ผู้เช่า</th>
                                                    <th className="py-2 px-3">สิ้นสุดสัญญา</th>
                                                    <th className="py-2 pl-3 text-right">เหลือ</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {expiring.map((c) => (
                                                    <tr key={c.room} className="border-b border-line/60">
                                                        <td className="py-2 pr-3 text-ink">{c.room} <span className="text-muted">· {c.name}</span></td>
                                                        <td className="py-2 px-3">{formatDate(c.endDate)}</td>
                                                        <td className={`py-2 pl-3 text-right tabular-nums font-medium ${c.daysLeft < 0 ? 'text-red-700' : c.daysLeft <= 30 ? 'text-amber-700' : 'text-ink'}`}>
                                                            {c.daysLeft < 0 ? `หมดแล้ว ${-c.daysLeft} วัน` : `${c.daysLeft} วัน`}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                <p className="text-xs text-muted">ควรคุยเรื่องต่อสัญญาล่วงหน้า ต่อสัญญาได้ที่หน้าผู้เช่า</p>
                            </section>
                        </div>

                        {/* สถิติแจ้งซ่อม (ทั้งหมดในระบบ ไม่นับเรื่องที่ยกเลิก) */}
                        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-4">
                            <h2 className="font-medium text-primary-dark">สถิติแจ้งซ่อม</h2>
                            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
                                <Stat label="เรื่องแจ้งซ่อมทั้งหมด" value={rstats.total} hint="ไม่นับเรื่องที่ยกเลิก" />
                                <Stat label="ซ่อมเสร็จแล้ว" value={rstats.doneCount} tone="text-emerald-700" />
                                <Stat label="ยังไม่เสร็จ" value={rstats.openCount} hint={rstats.overdue.length > 0 ? `ค้างเกิน 7 วัน ${rstats.overdue.length} เรื่อง` : undefined} tone={rstats.overdue.length > 0 ? 'text-amber-700' : 'text-primary-dark'} />
                                <Stat
                                    label="ผู้เช่าที่ยังไม่ชำระค่าซ่อม"
                                    value={`${unpaidRepair.tenantCount} คน`}
                                    hint={unpaidRepair.repairCount > 0 ? `ค้างรวม ${baht(unpaidRepair.total)} จาก ${unpaidRepair.repairCount} เรื่อง` : 'ไม่มีค่าซ่อมค้างชำระ'}
                                    tone={unpaidRepair.tenantCount > 0 ? 'text-amber-700' : 'text-primary-dark'}
                                />
                                <Stat label="ค่าซ่อมทั้งหมด" value={baht(rstats.costTotal)} hint={`หอพักจ่าย ${baht(rstats.costOwner)} · ผู้เช่าจ่าย ${baht(rstats.costTenant)}`} />
                            </div>
                            {rstats.total > 0 && (
                                <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                                    <div className="flex flex-col gap-2">
                                        <h3 className="text-sm font-medium text-ink">แยกตามประเภท</h3>
                                        <ul className="flex flex-col gap-2">
                                            {rstats.byCategory.map((c) => (
                                                <CountBar key={c.key} label={repairCategories[c.key] ?? c.key} count={c.count} max={rstats.byCategory[0].count} />
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <h3 className="text-sm font-medium text-ink">ห้องที่แจ้งซ่อมบ่อย (5 อันดับ)</h3>
                                        <ul className="flex flex-col gap-2">
                                            {rstats.byRoom.slice(0, 5).map((r) => (
                                                <CountBar key={r.key} label={`ห้อง ${r.key}`} count={r.count} max={rstats.byRoom[0].count} />
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                            {rstats.overdue.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <h3 className="text-sm font-medium text-amber-800">ค้างเกิน 7 วัน</h3>
                                    <ul className="flex flex-col divide-y divide-line/60 text-sm">
                                        {rstats.overdue.map((r) => (
                                            <li key={r.id} className="py-2 flex items-center justify-between gap-3">
                                                <span className="text-ink">{r.room} <span className="text-muted">· {r.problem}</span></span>
                                                <span className="tabular-nums text-amber-700 font-medium whitespace-nowrap">{r.days} วัน</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </section>

                        {/* รายเดือนย้อนหลัง 12 เดือน */}
                        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <h2 className="font-medium text-primary-dark">รายเดือนย้อนหลัง 12 เดือน</h2>
                                <ExportButton onClick={exportMonthly}>สรุปรายเดือน (CSV)</ExportButton>
                            </div>
                            <p className="-mt-1 text-xs text-muted">ใบที่ออก เรียกเก็บ และยังค้าง นับจากบิลที่ออกในเดือนนั้น (บิลของเดือนก่อนหน้า)</p>
                            <ul className="md:hidden flex flex-col gap-2">
                                {rows12.map((r) => (
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
                                        ]}
                                    />
                                ))}
                            </ul>
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-sm min-w-[960px] table-fixed">
                                    {/* ความกว้างคอลัมน์คงที่: เดือนและจำนวนใบแคบ ช่องเงิน 7 ช่องกว้างเท่ากัน */}
                                    <colgroup>
                                        <col className="w-[10%]" />
                                        <col className="w-[7%]" />
                                        {Array.from({ length: 7 }, (_, i) => <col key={i} className="w-[11.86%]" />)}
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
                                            <th className="py-2 px-3 text-right">คงเหลือ</th>
                                            <th className="py-2 pl-3 text-right">ยังค้าง</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows12.map((r) => (
                                            <tr key={r.month} className="border-b border-line/60">
                                                <td className="py-2 pr-3 font-medium text-ink">{formatMonth(r.month)}</td>
                                                <td className="py-2 px-3 text-right tabular-nums">{r.issuedCount}</td>
                                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.billed)}</td>
                                                <td className="py-2 px-3 text-right tabular-nums text-emerald-700">{baht(r.receivedTotal)}</td>
                                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.repairTenantCost)}</td>
                                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.repairCost)}</td>
                                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.expenseTotal)}</td>
                                                <td className={`py-2 px-3 text-right tabular-nums font-medium ${r.net < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{baht(r.net)}</td>
                                                <td className={`py-2 pl-3 text-right tabular-nums ${r.outstanding > 0 ? 'text-amber-700 font-medium' : ''}`}>{baht(r.outstanding)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-muted">รายรับนับตามวันที่ได้รับเงินจริง (วันที่ยืนยันสลิป) ใบเดือนก่อนที่เพิ่งได้รับเงินจะไปอยู่ในเดือนที่รับ ส่วนยอดค้างคือยอดของใบเดือนนั้นที่ยังไม่ชำระ ณ วันนี้</p>
                        </section>

                        {/* สรุปรายปี */}
                        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <h2 className="font-medium text-primary-dark">สรุปรายปี {Number(year) + 543}</h2>
                                <div className="flex items-center gap-2">
                                    <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="เลือกปี" className="border border-line bg-sand/50 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-secondary">
                                        {years.map((y) => <option key={y} value={y}>พ.ศ. {Number(y) + 543}</option>)}
                                    </select>
                                    <ExportButton onClick={exportYearly}>สรุปรายปี (CSV)</ExportButton>
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
                            <p className="text-xs text-muted">นับถึงเดือนปัจจุบัน รายรับนับตามวันที่ได้รับเงินจริง ค่าปรับที่เก็บได้ทั้งปี {baht(yearly.totals.lateFees)}</p>
                        </section>

                        {/* แนวโน้มการใช้น้ำ-ไฟย้อนหลัง (แยกสองกราฟ เพราะคนละหน่วยและคนละสเกล) */}
                        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-4">
                            <h2 className="font-medium text-primary-dark">แนวโน้มการใช้น้ำ-ไฟ 12 เดือนล่าสุด (ถึง {formatMonth(month)})</h2>
                            <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                                <MonthlyColumns title="หน่วยน้ำรวมทุกห้อง" unit="หน่วย" color="#2a78d6" rows={waterRows} />
                                <MonthlyColumns title="หน่วยไฟรวมทุกห้อง" unit="หน่วย" color="#eb6834" rows={electricRows} />
                            </div>
                        </section>

                        {/* การใช้น้ำ-ไฟของเดือนที่เลือก */}
                        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <h2 className="font-medium text-primary-dark">การใช้น้ำ-ไฟ เดือน {formatMonth(month)}</h2>
                                <ExportButton onClick={exportUtility}>การใช้น้ำ-ไฟรายห้อง (CSV)</ExportButton>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <Stat label="น้ำรวม" value={`${utility.waterUnits.toLocaleString()} หน่วย`} hint={utility.waterAvgRate !== null ? `ค่าน้ำ ${baht(utility.waterCost)} · เฉลี่ย ${utility.waterAvgRate} บาท/หน่วย` : 'ยังไม่มีข้อมูล'} />
                                <Stat label="ไฟรวม" value={`${utility.elecUnits.toLocaleString()} หน่วย`} hint={utility.elecAvgRate !== null ? `ค่าไฟ ${baht(utility.elecCost)} · เฉลี่ย ${utility.elecAvgRate} บาท/หน่วย` : 'ยังไม่มีข้อมูล'} />
                                <Stat label="ค่าน้ำ + ค่าไฟรวม" value={baht(utility.totalCost)} hint={`จาก ${monthInvoices.length} ใบแจ้งหนี้`} />
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

                        {/* ย้ายออกและเงินประกัน */}
                        {data.moveOuts.length > 0 && (
                            <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-col gap-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <h2 className="font-medium text-primary-dark">ย้ายออกและเงินประกัน ({data.moveOuts.length} ราย)</h2>
                                    <ExportButton onClick={exportMoveOuts}>ย้ายออก/เงินประกัน (CSV)</ExportButton>
                                </div>
                                {owedAfterMoveOut > 0 && (
                                    <p className="text-sm text-red-800 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-2.5">
                                        ผู้เช่าที่ย้ายออกมียอดต้องจ่ายเพิ่ม (หักเกินเงินประกัน) รวม {baht(owedAfterMoveOut)} ระบบไม่ติดตามยอดนี้ ควรเรียกเก็บนอกระบบ
                                    </p>
                                )}
                                <ul className="md:hidden flex flex-col gap-2">
                                    {data.moveOuts.slice(0, 20).map((m) => (
                                        <MobileCard
                                            key={m.id}
                                            title={<><span className="font-medium">{m.room}</span> <span className="text-muted">· {m.tenant_name}</span><span className="block text-xs text-muted">ย้ายออก {formatDate(m.move_out_date)}</span></>}
                                            aside={m.refund_status === 'pending' ? <span className="text-sky-700 font-medium">รอคืนเงิน</span> : m.refund_status === 'done' ? <span className="text-emerald-700">คืนแล้ว</span> : <span className="text-muted">ไม่มียอดคืน</span>}
                                            rows={[
                                                ['เงินประกัน', baht(m.deposit)],
                                                ['หัก', baht(m.deductions_total)],
                                                ['คืนผู้เช่า', Number(m.refund_amount) > 0 ? baht(m.refund_amount) : '-', Number(m.refund_amount) > 0 ? 'font-medium text-emerald-700' : 'text-muted'],
                                                ['ต้องจ่ายเพิ่ม', Number(m.owed_amount) > 0 ? baht(m.owed_amount) : '-', Number(m.owed_amount) > 0 ? 'font-medium text-red-700' : 'text-muted'],
                                            ]}
                                        />
                                    ))}
                                </ul>
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full text-sm min-w-[760px] table-fixed">
                                        {/* ความกว้างคอลัมน์คงที่: ห้อง/ผู้เช่ากว้างกว่า ช่องเงิน 4 ช่องเท่ากัน */}
                                        <colgroup>
                                            <col className="w-[12%]" />
                                            <col className="w-[22%]" />
                                            <col className="w-[13%]" />
                                            <col className="w-[13%]" />
                                            <col className="w-[13%]" />
                                            <col className="w-[13%]" />
                                            <col className="w-[14%]" />
                                        </colgroup>
                                        <thead>
                                            <tr className="text-left text-muted border-b border-line">
                                                <th className="py-2 pr-3">ย้ายออก</th>
                                                <th className="py-2 px-3">ห้อง / ผู้เช่า</th>
                                                <th className="py-2 px-3 text-right">เงินประกัน</th>
                                                <th className="py-2 px-3 text-right">หัก</th>
                                                <th className="py-2 px-3 text-right">คืนผู้เช่า</th>
                                                <th className="py-2 px-3 text-right">ต้องจ่ายเพิ่ม</th>
                                                <th className="py-2 pl-6">สถานะ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.moveOuts.slice(0, 20).map((m) => (
                                                <tr key={m.id} className="border-b border-line/60">
                                                    <td className="py-2.5 pr-3">{formatDate(m.move_out_date)}</td>
                                                    <td className="py-2.5 px-3 text-ink truncate"><span className="font-medium">{m.room}</span> <span className="text-muted">· {m.tenant_name}</span></td>
                                                    <td className="py-2.5 px-3 text-right tabular-nums">{baht(m.deposit)}</td>
                                                    <td className="py-2.5 px-3 text-right tabular-nums">{baht(m.deductions_total)}</td>
                                                    <td className={`py-2.5 px-3 text-right tabular-nums ${Number(m.refund_amount) > 0 ? 'font-medium text-emerald-700' : 'text-muted'}`}>
                                                        {Number(m.refund_amount) > 0 ? baht(m.refund_amount) : '-'}
                                                    </td>
                                                    <td className={`py-2.5 px-3 text-right tabular-nums ${Number(m.owed_amount) > 0 ? 'font-medium text-red-700' : 'text-muted'}`}>
                                                        {Number(m.owed_amount) > 0 ? baht(m.owed_amount) : '-'}
                                                    </td>
                                                    <td className="py-2.5 pl-6">
                                                        {m.refund_status === 'pending' ? <span className="text-sky-700 font-medium">รอคืนเงิน</span> : m.refund_status === 'done' ? <span className="text-emerald-700">คืนแล้ว</span> : <span className="text-muted">ไม่มียอดคืน</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}

                    </>
                )}
            </div>
        </>
    )
}

export default ReportsPage
