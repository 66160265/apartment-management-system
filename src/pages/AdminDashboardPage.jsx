import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Icon from '../components/Icon'
import MonthPicker from '../components/MonthPicker'
import { baht, currentMonth, formatMonth } from '../lib/billing'
import { fetchSlipUsage, quotaStatus } from '../lib/slipUsage'
import { attentionItems, expiringContracts, notYetDueCount, overdueInvoices, uniqueRooms, uninvoicedRooms } from '../lib/dashboard'
import { useRealtimeReload } from '../lib/realtime'
import { issueMonthOf, monthlySummary, occupancy } from '../lib/reports'
import { formatPeriod, normalizePeriod, todayIso } from '../lib/repairs'
import { supabase } from '../lib/supabaseClient'
import { useSettings } from '../lib/useSettings'
import { SkeletonList } from '../components/Skeleton.jsx'
import { selectAll } from '../lib/selectAll'

// หน้าภาพรวมของแอดมิน: ตอบ 3 คำถามให้จบในหน้าเดียว
//   1) มีอะไรต้องจัดการตอนนี้ไหม (สลิปรอตรวจ เรื่องซ่อมรอดำเนินการ)  2) เดือนนี้การเงินเป็นอย่างไร (เรียกเก็บ/ได้รับ/ค้าง)  3) ห้องเต็มไหม
// รายละเอียดอื่น (ย้อนหลังหลายเดือน การใช้น้ำ-ไฟ ส่งออก CSV) อยู่ที่หน้ารายงาน ไม่ซ้ำกันที่นี่

// ดึงข้อมูลจากฐานข้อมูล (ไม่มีการ setState เพื่อให้เรียกซ้ำได้อย่างปลอดภัย)
// ใบแจ้งหนี้และห้องจำเป็น พลาดแล้วโยน error ส่วนที่เหลือมาจาก SQL รุ่นหลัง ถ้ายังไม่มีตารางให้ถือว่าไม่มีข้อมูล หน้ายังใช้ได้
async function fetchDashboardData() {
    const [invoicesRes, roomsRes, paymentsRes, repairPaymentsRes, pendingRepairsRes, tenantsRes, slipUsage, todayRepairsRes] = await Promise.all([
        selectAll(() => supabase.from('invoices').select('*').order('created_at', { ascending: false }).order('id')),
        supabase.from('rooms').select('number, status'),
        selectAll(() => supabase.from('invoice_payments').select('amount, confirmed_at').order('id')),
        selectAll(() => supabase.from('repair_payments').select('amount, status, reviewed_at').order('id')),
        supabase.from('repairs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('tenants').select('room, end_date'),
        fetchSlipUsage(),
        // นัดซ่อมของวันนี้ (เวลาไทย)
        supabase.from('repairs').select('*').eq('status', 'in_progress').eq('appointment_date', todayIso()),
    ])

    if (invoicesRes.error) throw invoicesRes.error
    if (roomsRes.error) throw roomsRes.error

    return {
        invoices: invoicesRes.data || [],
        rooms: roomsRes.data || [],
        invoicePayments: paymentsRes.error ? [] : paymentsRes.data || [],
        repairPayments: repairPaymentsRes.error ? [] : repairPaymentsRes.data || [],
        pendingRepairs: pendingRepairsRes.error ? 0 : pendingRepairsRes.count || 0,
        tenants: tenantsRes.error ? [] : tenantsRes.data || [],
        slipUsage,
        // เรียงตามเวลานัด
        todayRepairs: (todayRepairsRes.error ? [] : todayRepairsRes.data || []).sort((a, b) => normalizePeriod(a.appointment_period).localeCompare(normalizePeriod(b.appointment_period))),
    }
}

const emptyData = { invoices: [], rooms: [], invoicePayments: [], repairPayments: [], pendingRepairs: 0, tenants: [], slipUsage: null, todayRepairs: [] }

// สีของการ์ด "ต้องจัดการ" ตามประเภท
const attentionTone = {
    sky: 'bg-sky-50 ring-sky-200 text-sky-900',
    amber: 'bg-amber-50 ring-amber-200 text-amber-900',
}

function Card({ title, children, hint, action, className = '', hintClassName = '' }) {
    return (
        <div className={`bg-white rounded-2xl p-4 sm:p-5 shadow-card border border-line flex flex-col gap-2 sm:gap-3 ${className}`}>
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-muted">{title}</span>
                {action}
            </div>
            {children}
            {hint && <div className={`text-xs text-muted ${hintClassName}`}>{hint}</div>}
        </div>
    )
}

// สถานะโควตาตรวจสลิปของเดือนนี้ในรูปที่ attentionItems ใช้ (ไม่รู้จำนวนที่ใช้หรือไม่ได้ตั้งโควตา = ไม่แสดง)
function slipQuota(used, quota) {
    const { level, remaining } = quotaStatus(used, quota)
    return { level, used, quota: Number(quota), remaining }
}

function AdminDashboardPage() {
    const settings = useSettings()
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [selectedMonth, setSelectedMonth] = useState(currentMonth())
    const [data, setData] = useState(emptyData)
    // เวลาที่ใช้คิดยอดค้าง/เกินกำหนด จำไว้ตอนโหลด (ตัวเลขไม่เปลี่ยนเองระหว่างดู)
    const [now, setNow] = useState(() => new Date())

    // เลือกเดือนอัตโนมัติเพียงครั้งแรกที่โหลดสำเร็จ ไม่ให้ทับเดือนที่ผู้ใช้เลือกเอง
    const hasAutoSelectedMonth = useRef(false)

    const applyData = useCallback((next) => {
        setData(next)
        setNow(new Date())
        setLoadError('')

        // หากเดือนปัจจุบันยังไม่มีใบแจ้งหนี้ แต่มีในเดือนอื่น ให้เลือกเดือนล่าสุดที่มีข้อมูล
        if (!hasAutoSelectedMonth.current) {
            hasAutoSelectedMonth.current = true
            const months = [...new Set(next.invoices.map((i) => i.month))].sort()
            if (!next.invoices.some((i) => i.month === currentMonth()) && months.length > 0) {
                setSelectedMonth(months[months.length - 1])
            }
        }
    }, [])

    const applyError = useCallback((err) => {
        console.error('Error loading dashboard data:', err)
        setLoadError(`เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message || 'ไม่สามารถติดต่อฐานข้อมูลได้'}`)
    }, [])

    // โหลดครั้งแรก (ยกเลิกผลลัพธ์ถ้าคอมโพเนนต์ถูกถอดออกก่อนโหลดเสร็จ)
    useEffect(() => {
        let cancelled = false
        fetchDashboardData()
            .then((next) => !cancelled && applyData(next))
            .catch((err) => !cancelled && applyError(err))
            .finally(() => !cancelled && setLoading(false))
        return () => {
            cancelled = true
        }
    }, [applyData, applyError])

    const retryLoad = () => {
        setLoading(true)
        setLoadError('')
        fetchDashboardData()
            .then(applyData)
            .catch(applyError)
            .finally(() => setLoading(false))
    }

    // อัปเดตเองเมื่อมีการเปลี่ยนข้อมูลที่หน้านี้ใช้ (โหลดเงียบ ไม่ขึ้นหน้าจอกำลังโหลด และไม่ทับเดือนที่เลือกไว้)
    const reloadQuiet = useCallback(() => fetchDashboardData().then(applyData).catch(() => {}), [applyData])
    useRealtimeReload(['invoices', 'invoice_payments', 'rooms', 'repairs', 'repair_payments', 'move_outs', 'tenants'], reloadQuiet)

    // เดือนที่มีการออกบิล (บิลของเดือนไหนออกในเดือนถัดไป)
    const monthsWithInvoices = useMemo(() => [...new Set(data.invoices.map((i) => issueMonthOf(i.month)))].sort(), [data.invoices])

    // การเงินของเดือนที่เลือก: เรียกเก็บ / ได้รับจริง / ยังค้าง (นิยามเดียวกับหน้ารายงาน)
    const summary = useMemo(
        () => monthlySummary({ invoices: data.invoices, invoicePayments: data.invoicePayments, repairPayments: data.repairPayments }, selectedMonth, now),
        [data, selectedMonth, now],
    )

    // เกินกำหนดชำระ (ผู้เช่ายังต้องจ่ายและเลยวันครบกำหนดแล้ว) กับที่ยังไม่ถึงกำหนด
    const overdue = useMemo(() => overdueInvoices(data.invoices, now, settings.dueDay), [data.invoices, now, settings.dueDay])
    const overdueTotal = overdue.reduce((sum, r) => sum + r.balance, 0)
    const notYetDue = useMemo(() => notYetDueCount(data.invoices, now, settings.dueDay), [data.invoices, now, settings.dueDay])

    const occ = useMemo(() => occupancy(data.rooms), [data.rooms])

    // สิ่งที่ต้องจัดการตอนนี้
    const attention = useMemo(() => {
        return attentionItems({
            reviewInvoices: data.invoices.filter((i) => i.status === 'review').length,
            repairReviews: data.repairPayments.filter((p) => p.status === 'review').length,
            pendingRepairs: data.pendingRepairs,
            uninvoicedRooms: uninvoicedRooms(data.rooms, data.invoices, currentMonth()).length,
            expiringContracts: expiringContracts(data.tenants, now).length,
            slipQuota: slipQuota(data.slipUsage, settings.slipQuota),
        })
    }, [data, now, settings.slipQuota])

    const received = summary.received + summary.repairReceived
    const loadingText = <span className="inline-block h-6 w-24 align-middle rounded-lg bg-line/70 motion-safe:animate-pulse"><span className="sr-only">กำลังโหลด...</span></span>

    return (
        <div className="p-4 sm:p-6 flex flex-col gap-3 sm:gap-6">
            <PageHeader flush title="ภาพรวมระบบ" subtitle="สิ่งที่ต้องจัดการ การเงินของเดือน และอัตราเข้าพัก" />

            {loadError && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex justify-between items-center">
                    <span>{loadError}</span>
                    <button type="button" onClick={retryLoad} className="underline text-red-800 font-medium cursor-pointer">ลองใหม่</button>
                </div>
            )}

            {/* 1) ต้องจัดการตอนนี้ */}
            <section aria-label="ต้องจัดการตอนนี้" className="bg-white rounded-2xl shadow-card border border-line p-4 sm:p-5 flex flex-col gap-3 sm:gap-4">
                <h2 className="text-base sm:text-lg font-bold text-primary-dark">ต้องจัดการตอนนี้</h2>
                {loading ? (
                    <SkeletonList rows={3} avatar={false} />
                ) : attention.length === 0 ? (
                    <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 text-emerald-900 p-3 sm:p-4 flex items-center gap-2 sm:gap-3 text-sm">
                        <Icon name="checkCircle" className="w-5 h-5 text-emerald-600 shrink-0" />
                        ไม่มีงานค้าง ไม่มีสลิปรอตรวจ และไม่มีเรื่องซ่อมรอดำเนินการ
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-5">
                        {attention.map((item) => (
                            <Link key={item.key} to={item.to} className={`rounded-xl ring-1 p-3 sm:p-4 flex flex-col gap-0.5 sm:gap-1 hover:shadow-md transition ${attentionTone[item.tone]}`}>
                                <span className="text-2xl sm:text-3xl font-bold tabular-nums">{item.count}</span>
                                <span className="text-sm font-medium">{item.label}</span>
                                {item.amount > 0 && <span className="text-xs opacity-80 tabular-nums">รวม {baht(item.amount)}</span>}
                                <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold">
                                    จัดการ <Icon name="arrowRight" className="w-3.5 h-3.5" />
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            {/* นัดซ่อมวันนี้ เรียงตามเวลา (ใช้ตอนเช้าก่อนเริ่มงาน) */}
            <section aria-label="นัดซ่อมวันนี้" className="bg-white rounded-2xl shadow-card border border-line p-4 sm:p-5 flex flex-col gap-2 sm:gap-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h2 className="text-base sm:text-lg font-bold text-primary-dark flex items-center gap-2">
                        <Icon name="calendar" className="w-5 h-5" />
                        นัดซ่อมวันนี้
                        {!loading && data.todayRepairs.length > 0 && <span className="text-sm font-normal text-muted">({data.todayRepairs.length} นัด)</span>}
                    </h2>
                    <Link to="/repairs" className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-dark font-semibold">
                        ไปที่ระบบแจ้งซ่อม
                        <Icon name="arrowRight" className="w-3.5 h-3.5" />
                    </Link>
                </div>
                {loading ? (
                    <SkeletonList rows={2} avatar={false} />
                ) : data.todayRepairs.length === 0 ? (
                    <p className="text-sm text-muted sm:py-2">วันนี้ไม่มีนัดซ่อม</p>
                ) : (
                    <ol className="flex flex-col divide-y divide-line/60">
                        {data.todayRepairs.map((r) => (
                            <li key={r.id}>
                                <Link to="/repairs" className={`flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 py-2.5 sm:py-3 px-2 rounded-lg hover:bg-sand/50 ${r.pinned ? 'bg-red-50' : ''}`}>
                                    <span className="w-32 shrink-0 whitespace-nowrap text-base font-bold tabular-nums text-primary-dark">{formatPeriod(r.appointment_period) || '-'}</span>
                                    <span className="inline-block px-2.5 py-0.5 rounded-lg bg-mist/60 text-primary-dark text-sm font-semibold">{r.room}</span>
                                    <span className="flex-1 min-w-40 text-sm text-ink">
                                        {r.problem}
                                        <span className="block text-xs text-muted">
                                            {r.technician ? `ช่าง${r.technician}${r.technician_phone ? ` · ${r.technician_phone}` : ''}` : 'ยังไม่ระบุช่าง'}
                                            {r.contact_phone && ` · ผู้เช่า ${r.contact_phone}`}
                                        </span>
                                    </span>
                                    {r.allow_entry && <span className="text-xs text-emerald-700">เข้าห้องได้แม้ไม่อยู่</span>}
                                    {r.appointment_state === 'proposed' && <span className="text-xs font-semibold text-amber-700">รอผู้เช่ายืนยัน</span>}
                                </Link>
                            </li>
                        ))}
                    </ol>
                )}
            </section>

            {/* 2) การเงินของเดือน / เกินกำหนด / อัตราเข้าพัก */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
                <Card
                    className="col-span-2 lg:col-span-1"
                    hintClassName="hidden sm:block"
                    title={`การเงินเดือน ${formatMonth(selectedMonth)}`}
                    action={<MonthPicker value={selectedMonth} onChange={setSelectedMonth} marked={monthsWithInvoices} />}
                    hint={`เรียกเก็บและยังค้าง = บิลเดือน ${formatMonth(summary.billMonth)} ที่ออกในเดือนนี้ · ได้รับ = เงินที่รับจริงในเดือนนี้ (ค่าห้อง+ค่าซ่อม รวมค่าปรับ)`}
                >
                    <dl className="flex flex-col gap-1.5 sm:gap-2">
                        <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-sm text-muted">เรียกเก็บ บิลเดือน {formatMonth(summary.billMonth)} ({summary.issuedCount} ใบ)</dt>
                            <dd className="text-lg sm:text-xl font-semibold text-ink tabular-nums">{loading ? loadingText : baht(summary.billed)}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-sm text-muted">ได้รับแล้ว</dt>
                            <dd className="text-lg sm:text-xl font-semibold text-emerald-700 tabular-nums">{loading ? loadingText : baht(received)}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
                            <dt className="text-sm text-muted">ยังค้างของบิลเดือน {formatMonth(summary.billMonth)} ({summary.unpaidCount} ใบ)</dt>
                            <dd className={`text-lg sm:text-xl font-semibold tabular-nums ${summary.outstanding > 0 ? 'text-amber-700' : 'text-ink'}`}>{loading ? loadingText : baht(summary.outstanding)}</dd>
                        </div>
                    </dl>
                </Card>

                <Card title="เกินกำหนดชำระ" hint={loading ? undefined : `ยังไม่ถึงกำหนดอีก ${notYetDue} ใบ`}>
                    {loading ? (
                        loadingText
                    ) : (
                        <>
                            <div className="flex items-baseline gap-2">
                                <span className={`text-3xl sm:text-4xl font-bold tabular-nums ${overdue.length > 0 ? 'text-red-600' : 'text-ink'}`}>{uniqueRooms(overdue)}</span>
                                <span className="text-base sm:text-xl text-muted/70">ห้อง</span>
                            </div>
                            <div className="text-sm text-muted tabular-nums">รวมยอดค้าง {baht(overdueTotal)}<span className="hidden sm:inline"> (รวมค่าปรับของวันนี้)</span></div>
                        </>
                    )}
                </Card>

                <Card title="อัตราเข้าพัก" hint={loading ? undefined : `มีผู้เช่า ${occ.occupied} จาก ${occ.total - occ.maintenance} ห้อง${occ.maintenance > 0 ? ` · ปิดปรับปรุง ${occ.maintenance}` : ''}`}>
                    {loading ? (
                        loadingText
                    ) : (
                        <>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl sm:text-4xl font-bold text-ink tabular-nums">{occ.rate}%</span>
                                <span className="text-base sm:text-xl text-muted/70">ว่าง {occ.vacant} ห้อง</span>
                            </div>
                            <div className="h-2 rounded-full bg-sand overflow-hidden" role="presentation">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, occ.rate)}%` }} />
                            </div>
                        </>
                    )}
                </Card>
            </div>

            {/* 3) ตารางเกินกำหนดชำระ (เฉพาะรายการเร่งด่วนสุด ที่เหลืออยู่หน้ารายงาน) */}
            <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-card border border-line">
                <div className="flex justify-between items-center mb-2 sm:mb-4 gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                        <h2 className="text-base sm:text-lg font-bold text-ink">เกินกำหนดชำระ</h2>
                        {!loading && overdue.length > 0 && (
                            <span className="text-xs bg-red-100 text-red-800 font-semibold px-2.5 py-0.5 rounded-full">{overdue.length} ใบ</span>
                        )}
                    </div>
                    <Link to="/invoices" className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-dark font-semibold transition">
                        จัดการใบแจ้งหนี้ทั้งหมด
                        <Icon name="arrowRight" className="w-3.5 h-3.5" />
                    </Link>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-line text-xs text-muted/70 font-normal">
                                <th className="py-3 px-2 font-normal">ห้อง / ผู้เช่า</th>
                                <th className="hidden sm:table-cell py-3 px-2 font-normal">เดือน</th>
                                <th className="py-3 px-2 font-normal text-right">ค้างชำระ<span className="hidden sm:inline"> (บาท)</span></th>
                                <th className="py-3 px-2 font-normal text-right">เกินกำหนด</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line/60">
                            {loading ? (
                                <tr><td colSpan={4} className="p-0"><SkeletonList rows={3} avatar={false} /></td></tr>
                            ) : overdue.length === 0 ? (
                                <tr><td colSpan={4} className="py-8 text-center text-emerald-600 text-sm font-medium">ไม่มีใบแจ้งหนี้ที่เกินกำหนดชำระ</td></tr>
                            ) : (
                                overdue.slice(0, 8).map((r) => (
                                    <tr key={r.id} onClick={() => navigate('/invoices')} className="hover:bg-sand/30 transition-colors cursor-pointer" title="คลิกเพื่อไปที่หน้าใบแจ้งหนี้">
                                        <td className="py-2.5 sm:py-3.5 px-2 font-medium text-ink">
                                            {r.room} <span className="font-normal text-muted">· {r.tenant}</span>
                                            <span className="block sm:hidden text-xs font-normal text-muted">{formatMonth(r.month)}</span>
                                        </td>
                                        <td className="hidden sm:table-cell py-3.5 px-2 text-muted">{formatMonth(r.month)}</td>
                                        <td className="py-2.5 sm:py-3.5 px-2 text-right text-ink font-semibold tabular-nums">{baht(r.balance)}</td>
                                        <td className="py-2.5 sm:py-3.5 px-2 text-right whitespace-nowrap"><span className="inline-block px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 ring-1 ring-red-200">{r.daysLate} วัน</span></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {!loading && overdue.length > 8 && (
                    <p className="text-xs text-muted pt-3">
                        แสดง 8 รายการที่เกินกำหนดนานที่สุด จากทั้งหมด {overdue.length} ใบ{' '}
                        <Link to="/admin/reports" className="text-primary font-medium hover:underline">ดูทั้งหมดและส่งออกในหน้ารายงาน</Link>
                    </p>
                )}
            </div>

            <p className="text-xs text-muted">
                รายงานย้อนหลัง 12 เดือน สถิติการใช้น้ำ-ไฟรายห้อง และการส่งออก CSV อยู่ที่{' '}
                <Link to="/admin/reports" className="text-primary font-medium hover:underline">หน้ารายงาน</Link>
            </p>
        </div>
    )
}

export default AdminDashboardPage
