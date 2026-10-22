import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon'
import MonthPicker from '../components/MonthPicker'
import PageHeader from '../components/PageHeader'
import { baht, currentMonth, formatMonth } from '../lib/billing'
import { formatDate } from '../lib/tenants'
import { downloadCsv } from '../lib/downloadCsv'
import {
    csvFileName, invoiceColumns, monthlyColumns, monthlyRows, monthlySummary, monthOf, moveOutColumns, occupancy, outstandingColumns, outstandingRows,
    owedFromMoveOuts, paymentColumns, pendingDepositRefund, recentMonths, roomUsage, toCsv, utilityColumns, utilityHistory, utilityStats,
} from '../lib/reports'
import { useRealtimeReload } from '../lib/realtime'
import { supabase } from '../lib/supabaseClient'
import MonthlyColumns from '../components/MonthlyColumns'
import { useSettings } from '../lib/useSettings'

// รายงานสำหรับแอดมิน: อัตราเข้าพัก รายรับ-ยอดค้างรายเดือน และส่งออก CSV (เปิดใน Excel/ส่งให้นักบัญชีได้)
// รายรับนับตามวันที่ได้รับเงินจริง (วันที่ยืนยันสลิป) ไม่ใช่เดือนของใบแจ้งหนี้

const emptyData = { rooms: [], invoices: [], invoicePayments: [], repairPayments: [], moveOuts: [] }

function Stat({ label, value, hint, tone = 'text-primary-dark' }) {
    return (
        <div className="bg-white rounded-2xl shadow-card p-4">
            <div className="text-sm text-muted">{label}</div>
            <div className={`text-2xl font-semibold mt-1 tabular-nums ${tone}`}>{value}</div>
            {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
        </div>
    )
}

function ExportButton({ onClick, children }) {
    return (
        <button type="button" onClick={onClick} className="flex items-center gap-1.5 border border-line bg-white text-primary-dark hover:bg-mist/40 px-3.5 py-1.5 rounded-xl text-sm">
            <Icon name="download" className="w-4 h-4" />
            {children}
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
            supabase.from('rooms').select('number, status'),
            supabase.from('invoices').select('*'),
            supabase.from('invoice_payments').select('*'),
            // ตารางนี้มีเมื่อรัน ส่วน repair-payments ของไฟล์ migration แล้ว ถ้ายังไม่มีให้ถือว่าไม่มีรายรับค่าซ่อม
            supabase.from('repair_payments').select('*').eq('status', 'paid'),
            // ตารางนี้มีเมื่อรัน ส่วน move-out ของไฟล์ migration แล้ว
            supabase.from('move_outs').select('*').order('move_out_date', { ascending: false }),
        ])

    const apply = useCallback(([rooms, invoices, payments, repairPayments, moveOuts]) => {
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

    // อัปเดตเองเมื่อมีการเปลี่ยนใบแจ้งหนี้ การรับเงิน ค่าซ่อม การย้ายออก หรือห้อง
    useRealtimeReload(['invoices', 'invoice_payments', 'repair_payments', 'move_outs', 'rooms'], () => fetchAll().then(apply))

    const months = useMemo(() => recentMonths(currentMonth(), 12), [])
    const summary = useMemo(() => monthlySummary(data, month, now), [data, month, now])
    const rows12 = useMemo(() => monthlyRows(data, months, now), [data, months, now])
    const occ = useMemo(() => occupancy(data.rooms), [data.rooms])
    const outstanding = useMemo(() => outstandingRows(data.invoices, now, dueDay), [data.invoices, now, dueDay])
    const outstandingTotal = outstanding.reduce((acc, r) => acc + r.balance, 0)
    const pendingRefund = data.invoices.filter((i) => i.refund_status === 'pending').reduce((acc, i) => acc + Number(i.refund_amount), 0)
    const depositToRefund = pendingDepositRefund(data.moveOuts)
    const owedAfterMoveOut = owedFromMoveOuts(data.moveOuts)
    const invoiceById = useMemo(() => Object.fromEntries(data.invoices.map((i) => [i.id, i])), [data.invoices])

    const exportInvoices = () =>
        downloadCsv(csvFileName('ใบแจ้งหนี้', month), toCsv(data.invoices.filter((i) => i.month === month).sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true })), invoiceColumns))
    const exportPayments = () =>
        downloadCsv(
            csvFileName('การรับเงิน', month),
            toCsv(data.invoicePayments.filter((p) => monthOf(p.confirmed_at) === month).sort((a, b) => a.confirmed_at.localeCompare(b.confirmed_at)), paymentColumns(invoiceById)),
        )
    const exportOutstanding = () => downloadCsv(csvFileName('ยอดค้างชำระ', now.toISOString().slice(0, 10)), toCsv(outstanding, outstandingColumns))
    // การใช้น้ำ-ไฟของเดือนที่เลือก (เดิมอยู่ในหน้าภาพรวม ย้ายมาไว้ที่นี่)
    const monthInvoices = useMemo(() => data.invoices.filter((i) => i.month === month), [data.invoices, month])
    const utility = useMemo(() => utilityStats(monthInvoices), [monthInvoices])
    const usageRows = useMemo(() => roomUsage(monthInvoices), [monthInvoices])
    // แนวโน้มหน่วยน้ำ-ไฟ 12 เดือนล่าสุด (นับถึงเดือนที่เลือก) ใช้ใบแจ้งหนี้ทั้งหมดที่โหลดมา
    const history = useMemo(() => utilityHistory(data.invoices, month, 12), [data.invoices, month])
    const waterRows = useMemo(() => history.map((h) => ({ key: h.month, label: formatMonth(h.month), value: h.water })), [history])
    const electricRows = useMemo(() => history.map((h) => ({ key: h.month, label: formatMonth(h.month), value: h.electric })), [history])
    const exportUtility = () => downloadCsv(csvFileName('การใช้น้ำไฟ', month), toCsv(usageRows, utilityColumns))
    const exportMoveOuts = () => downloadCsv(csvFileName('ย้ายออกและเงินประกัน', now.toISOString().slice(0, 10)), toCsv(data.moveOuts, moveOutColumns))
    const exportMonthly = () => downloadCsv(csvFileName('สรุปรายเดือน', `${months.at(-1)}_${months[0]}`), toCsv([...rows12].reverse(), monthlyColumns))

    return (
        <>
            <PageHeader title="รายงาน" subtitle="อัตราเข้าพัก รายรับ ยอดค้างชำระ และส่งออก CSV สำหรับทำบัญชี" />

            <div className="px-4 sm:px-6 pb-8 flex flex-col gap-6">
                {error ? (
                    <p className="text-center py-10 text-red-600">{error}</p>
                ) : loading ? (
                    <p className="text-center py-10 text-muted">กำลังโหลด...</p>
                ) : (
                    <>
                        {/* ห้องพัก (ตอนนี้) */}
                        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Stat label="อัตราเข้าพัก" value={`${occ.rate}%`} hint={`มีผู้เช่า ${occ.occupied} จาก ${occ.total - occ.maintenance} ห้อง (ไม่รวมปิดปรับปรุง)`} />
                            <Stat label="ห้องว่าง" value={occ.vacant} hint={occ.maintenance > 0 ? `ปิดปรับปรุง ${occ.maintenance} ห้อง` : undefined} />
                            <Stat label="ยอดค้างชำระทั้งหมด (วันนี้)" value={baht(outstandingTotal)} hint={`${outstanding.length} ใบ รวมค่าปรับของวันนี้`} tone={outstandingTotal > 0 ? 'text-amber-700' : 'text-primary-dark'} />
                            <Stat label="รอโอนคืนผู้เช่า" value={baht(pendingRefund + depositToRefund)} hint={`ยอดที่ผู้เช่าโอนเกิน ${baht(pendingRefund)} · เงินประกัน ${baht(depositToRefund)}`} tone={pendingRefund + depositToRefund > 0 ? 'text-sky-700' : 'text-primary-dark'} />
                        </section>

                        {/* สรุปเดือนที่เลือก */}
                        <section className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <h2 className="font-medium text-primary-dark">สรุปเดือน {formatMonth(month)}</h2>
                                <MonthPicker value={month} onChange={setMonth} />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Stat label="ใบแจ้งหนี้ที่ออก" value={summary.issuedCount} hint={`เรียกเก็บ ${baht(summary.billed)}`} />
                                <Stat label="รับเงินจริงในเดือนนี้" value={baht(summary.received + summary.repairReceived)} hint={`ค่าห้อง ${baht(summary.received)} · ค่าซ่อม ${baht(summary.repairReceived)}`} tone="text-emerald-700" />
                                <Stat label="ค้างชำระของใบเดือนนี้" value={baht(summary.outstanding)} hint={`${summary.unpaidCount} ใบ ณ วันนี้`} tone={summary.outstanding > 0 ? 'text-amber-700' : 'text-primary-dark'} />
                                <Stat label="โอนคืนยอดเกินในเดือนนี้" value={baht(summary.refunded)} hint={`ค่าปรับของใบเดือนนี้ที่ชำระแล้ว ${baht(summary.lateFees)}`} />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <ExportButton onClick={exportInvoices}>ใบแจ้งหนี้เดือนนี้ (CSV)</ExportButton>
                                <ExportButton onClick={exportPayments}>การรับเงินเดือนนี้ (CSV)</ExportButton>
                            </div>
                        </section>

                        {/* รายเดือนย้อนหลัง 12 เดือน */}
                        <section className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <h2 className="font-medium text-primary-dark">รายเดือนย้อนหลัง 12 เดือน</h2>
                                <ExportButton onClick={exportMonthly}>สรุปรายเดือน (CSV)</ExportButton>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[720px]">
                                    <thead>
                                        <tr className="text-left text-muted border-b border-line">
                                            <th className="py-2 pr-3">เดือน</th>
                                            <th className="py-2 px-3 text-right">ใบที่ออก</th>
                                            <th className="py-2 px-3 text-right">เรียกเก็บ</th>
                                            <th className="py-2 px-3 text-right">รับเงินค่าห้อง</th>
                                            <th className="py-2 px-3 text-right">รับเงินค่าซ่อม</th>
                                            <th className="py-2 px-3 text-right">โอนคืน</th>
                                            <th className="py-2 pl-3 text-right">ยังค้าง</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows12.map((r) => (
                                            <tr key={r.month} className="border-b border-line/60">
                                                <td className="py-2 pr-3 font-medium text-ink">{formatMonth(r.month)}</td>
                                                <td className="py-2 px-3 text-right tabular-nums">{r.issuedCount}</td>
                                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.billed)}</td>
                                                <td className="py-2 px-3 text-right tabular-nums text-emerald-700">{baht(r.received)}</td>
                                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.repairReceived)}</td>
                                                <td className="py-2 px-3 text-right tabular-nums">{baht(r.refunded)}</td>
                                                <td className={`py-2 pl-3 text-right tabular-nums ${r.outstanding > 0 ? 'text-amber-700 font-medium' : ''}`}>{baht(r.outstanding)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-muted">รายรับนับตามวันที่ได้รับเงินจริง (วันที่ยืนยันสลิป) ใบเดือนก่อนที่เพิ่งได้รับเงินจะไปอยู่ในเดือนที่รับ ส่วนยอดค้างคือยอดของใบเดือนนั้นที่ยังไม่ชำระ ณ วันนี้</p>
                        </section>

                        {/* แนวโน้มการใช้น้ำ-ไฟย้อนหลัง (แยกสองกราฟ เพราะคนละหน่วยและคนละสเกล) */}
                        <section className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
                            <h2 className="font-medium text-primary-dark">แนวโน้มการใช้น้ำ-ไฟ 12 เดือนล่าสุด (ถึง {formatMonth(month)})</h2>
                            <div className="grid gap-6 lg:grid-cols-2">
                                <MonthlyColumns title="หน่วยน้ำรวมทุกห้อง" unit="หน่วย" color="#2a78d6" rows={waterRows} />
                                <MonthlyColumns title="หน่วยไฟรวมทุกห้อง" unit="หน่วย" color="#eb6834" rows={electricRows} />
                            </div>
                        </section>

                        {/* การใช้น้ำ-ไฟของเดือนที่เลือก */}
                        <section className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <h2 className="font-medium text-primary-dark">การใช้น้ำ-ไฟ เดือน {formatMonth(month)}</h2>
                                <ExportButton onClick={exportUtility}>การใช้น้ำ-ไฟรายห้อง (CSV)</ExportButton>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <Stat label="น้ำรวม" value={`${utility.waterUnits.toLocaleString()} หน่วย`} hint={utility.waterAvgRate !== null ? `ค่าน้ำ ${baht(utility.waterCost)} · เฉลี่ย ${utility.waterAvgRate} บาท/หน่วย` : 'ยังไม่มีข้อมูล'} />
                                <Stat label="ไฟรวม" value={`${utility.elecUnits.toLocaleString()} หน่วย`} hint={utility.elecAvgRate !== null ? `ค่าไฟ ${baht(utility.elecCost)} · เฉลี่ย ${utility.elecAvgRate} บาท/หน่วย` : 'ยังไม่มีข้อมูล'} />
                                <Stat label="ค่าน้ำ + ค่าไฟรวม" value={baht(utility.totalCost)} hint={`จาก ${monthInvoices.length} ใบแจ้งหนี้`} />
                            </div>
                            {usageRows.length === 0 ? (
                                <p className="text-sm text-muted text-center py-4">ยังไม่มีใบแจ้งหนี้ของเดือนนี้</p>
                            ) : (
                                <div className="border border-line rounded-xl overflow-hidden">
                                    <div className="max-h-72 overflow-y-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-sand/40 sticky top-0 border-b border-line text-xs text-muted">
                                                <tr>
                                                    <th className="py-2.5 px-4 text-left font-normal">ห้อง / ผู้เช่า</th>
                                                    <th className="py-2.5 px-4 text-right font-normal">น้ำ (หน่วย)</th>
                                                    <th className="py-2.5 px-4 text-right font-normal">ไฟ (หน่วย)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-line/60">
                                                {usageRows.map((r) => (
                                                    <tr key={r.room}>
                                                        <td className="py-2 px-4 text-ink">{r.room} <span className="text-muted">· {r.tenant}</span></td>
                                                        <td className="py-2 px-4 text-right tabular-nums">{r.water}</td>
                                                        <td className="py-2 px-4 text-right tabular-nums">{r.electric}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* ย้ายออกและเงินประกัน */}
                        {data.moveOuts.length > 0 && (
                            <section className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <h2 className="font-medium text-primary-dark">ย้ายออกและเงินประกัน ({data.moveOuts.length} ราย)</h2>
                                    <ExportButton onClick={exportMoveOuts}>ย้ายออก/เงินประกัน (CSV)</ExportButton>
                                </div>
                                {owedAfterMoveOut > 0 && (
                                    <p className="text-sm text-red-800 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-2.5">
                                        ผู้เช่าที่ย้ายออกมียอดต้องจ่ายเพิ่ม (หักเกินเงินประกัน) รวม {baht(owedAfterMoveOut)} ระบบไม่ติดตามยอดนี้ ควรเรียกเก็บนอกระบบ
                                    </p>
                                )}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm min-w-[640px]">
                                        <thead>
                                            <tr className="text-left text-muted border-b border-line">
                                                <th className="py-2 pr-3">ย้ายออก</th>
                                                <th className="py-2 px-3">ห้อง / ผู้เช่า</th>
                                                <th className="py-2 px-3 text-right">เงินประกัน</th>
                                                <th className="py-2 px-3 text-right">หัก</th>
                                                <th className="py-2 px-3 text-right">คืน / ต้องจ่ายเพิ่ม</th>
                                                <th className="py-2 pl-3">สถานะ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.moveOuts.slice(0, 20).map((m) => (
                                                <tr key={m.id} className="border-b border-line/60">
                                                    <td className="py-2 pr-3">{formatDate(m.move_out_date)}</td>
                                                    <td className="py-2 px-3 text-ink">{m.room} <span className="text-muted">· {m.tenant_name}</span></td>
                                                    <td className="py-2 px-3 text-right tabular-nums">{baht(m.deposit)}</td>
                                                    <td className="py-2 px-3 text-right tabular-nums">{baht(m.deductions_total)}</td>
                                                    <td className={`py-2 px-3 text-right tabular-nums font-medium ${Number(m.owed_amount) > 0 ? 'text-red-700' : ''}`}>
                                                        {Number(m.owed_amount) > 0 ? `เพิ่ม ${baht(m.owed_amount)}` : baht(m.refund_amount)}
                                                    </td>
                                                    <td className="py-2 pl-3">
                                                        {m.refund_status === 'pending' ? <span className="text-sky-700 font-medium">รอคืนเงิน</span> : m.refund_status === 'done' ? <span className="text-emerald-700">คืนแล้ว</span> : <span className="text-muted">ไม่มียอดคืน</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}

                        {/* ยอดค้างชำระ */}
                        <section className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <h2 className="font-medium text-primary-dark">ยอดค้างชำระ ({outstanding.length} ใบ)</h2>
                                <ExportButton onClick={exportOutstanding}>ยอดค้างชำระ (CSV)</ExportButton>
                            </div>
                            {outstanding.length === 0 ? (
                                <p className="text-sm text-muted py-4 text-center">ไม่มียอดค้างชำระ</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm min-w-[600px]">
                                        <thead>
                                            <tr className="text-left text-muted border-b border-line">
                                                <th className="py-2 pr-3">ห้อง / ผู้เช่า</th>
                                                <th className="py-2 px-3">เดือน</th>
                                                <th className="py-2 px-3 text-right">ยอดบิล</th>
                                                <th className="py-2 px-3 text-right">รับแล้ว</th>
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
                                                    <td className="py-2 px-3 text-right tabular-nums">{baht(r.paid)}</td>
                                                    <td className="py-2 px-3 text-right tabular-nums font-medium text-amber-700">{baht(r.balance)}</td>
                                                    <td className={`py-2 pl-3 text-right tabular-nums ${r.daysLate > 0 ? 'text-red-600 font-medium' : 'text-muted'}`}>{r.daysLate > 0 ? `${r.daysLate} วัน` : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {outstanding.length > 50 && <p className="text-xs text-muted pt-2">แสดง 50 รายการแรก ดูทั้งหมดในไฟล์ CSV</p>}
                                </div>
                            )}
                        </section>
                    </>
                )}
            </div>
        </>
    )
}

export default ReportsPage
