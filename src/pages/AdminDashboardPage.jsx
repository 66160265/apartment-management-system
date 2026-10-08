import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AvatarMenu from '../components/AvatarMenu'
import MonthPicker from '../components/MonthPicker'
import NotificationBell from '../components/NotificationBell'
import { RATES, invoiceStatuses } from '../data/billing'
import { currentMonth, formatMonth } from '../lib/billing'
import { supabase } from '../lib/supabaseClient'

// อัตราที่เป็น 0 ถือเป็นค่าที่ถูกต้อง จึงใช้ค่าสำรองเฉพาะกรณีไม่มีข้อมูลเท่านั้น
const toRate = (value, fallback) =>
    value === null || value === undefined || value === '' ? fallback : Number(value)

// ดึงข้อมูลจากฐานข้อมูล (ไม่มีการ setState เพื่อให้เรียกซ้ำได้อย่างปลอดภัย)
async function fetchDashboardData() {
    const [invoicesRes, roomsRes, tenantsRes] = await Promise.all([
        supabase.from('invoices').select('*').order('created_at', { ascending: false }),
        supabase.from('rooms').select('*').order('number', { ascending: true }),
        supabase.from('tenants').select('*'),
    ])

    if (invoicesRes.error) throw invoicesRes.error
    if (roomsRes.error) throw roomsRes.error
    if (tenantsRes.error) throw tenantsRes.error

    return {
        invList: invoicesRes.data || [],
        roomList: [...(roomsRes.data || [])].sort((a, b) =>
            String(a.number).localeCompare(String(b.number), undefined, { numeric: true })
        ),
        tenantList: tenantsRes.data || [],
    }
}

function AdminDashboardPage() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [selectedMonth, setSelectedMonth] = useState(currentMonth())

    // ข้อมูลจริงจาก Supabase
    const [rooms, setRooms] = useState([])
    const [tenants, setTenants] = useState([])
    const [invoices, setInvoices] = useState([])

    // เลือกเดือนอัตโนมัติเพียงครั้งแรกที่โหลดสำเร็จ ไม่ให้ทับเดือนที่ผู้ใช้เลือกเอง
    const hasAutoSelectedMonth = useRef(false)

    const applyData = useCallback(({ invList, roomList, tenantList }) => {
        setInvoices(invList)
        setRooms(roomList)
        setTenants(tenantList)
        setLoadError('')

        // หากเดือนปัจจุบันยังไม่มีใบแจ้งหนี้ แต่มีในเดือนอื่น ให้เลือกเดือนล่าสุดที่มีข้อมูล
        if (!hasAutoSelectedMonth.current) {
            hasAutoSelectedMonth.current = true
            const months = [...new Set(invList.map((i) => i.month))].sort()
            if (!invList.some((i) => i.month === currentMonth()) && months.length > 0) {
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
            .then((data) => !cancelled && applyData(data))
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

    // รายชื่อเดือนทั้งหมดที่มีใบแจ้งหนี้
    const monthsWithInvoices = useMemo(() => {
        return [...new Set(invoices.map((i) => i.month))].sort()
    }, [invoices])

    // ใบแจ้งหนี้ของเดือนที่เลือก
    const invoicesForMonth = useMemo(() => {
        return invoices.filter((i) => i.month === selectedMonth)
    }, [invoices, selectedMonth])

    // รายได้เดือนนี้ (เฉพาะใบแจ้งหนี้ที่ชำระแล้ว)
    const monthlyIncome = useMemo(() => {
        return invoicesForMonth
            .filter((i) => i.status === 'paid')
            .reduce((sum, i) => sum + Number(i.total || 0), 0)
    }, [invoicesForMonth])

    // ใบแจ้งหนี้ที่ค้างชำระจริง (pending หรือ review)
    const overdueInvoices = useMemo(() => {
        return invoices
            .filter((i) => i.status === 'pending' || i.status === 'review')
            .map((inv) => {
                const tenant = tenants.find((t) => t.room === inv.room)
                return {
                    id: inv.id,
                    room: inv.room,
                    tenant: inv.tenant_name || tenant?.name || '-',
                    amount: Number(inv.total || 0),
                    month: formatMonth(inv.month),
                    status: inv.status,
                    statusLabel: invoiceStatuses[inv.status]?.label || inv.status,
                    statusStyle:
                        invoiceStatuses[inv.status]?.color ||
                        (inv.status === 'review'
                            ? 'bg-sky-50 text-sky-800 ring-1 ring-sky-200'
                            : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'),
                }
            })
            .sort((a, b) => String(a.room).localeCompare(String(b.room), undefined, { numeric: true }))
    }, [invoices, tenants])

    // จำนวนห้องที่ค้างชำระจริง
    const unpaidRoomsCount = useMemo(() => {
        return new Set(overdueInvoices.map((i) => i.room)).size
    }, [overdueInvoices])

    // สถิติการใช้น้ำและไฟประจำเดือนที่เลือก
    const utilityStats = useMemo(() => {
        let waterUnits = 0
        let elecUnits = 0
        let waterCost = 0
        let elecCost = 0

        const waterRate = toRate(invoicesForMonth[0]?.water_rate, RATES.water)
        const elecRate = toRate(invoicesForMonth[0]?.elec_rate, RATES.electric)

        invoicesForMonth.forEach((inv) => {
            const w = Math.max(0, (inv.water_curr || 0) - (inv.water_prev || 0))
            const e = Math.max(0, (inv.elec_curr || 0) - (inv.elec_prev || 0))
            const wRate = toRate(inv.water_rate, waterRate)
            const eRate = toRate(inv.elec_rate, elecRate)

            waterUnits += w
            elecUnits += e
            waterCost += w * wRate
            elecCost += e * eRate
        })

        return {
            waterUnits,
            elecUnits,
            waterRate,
            elecRate,
            waterCost,
            elecCost,
            totalCost: waterCost + elecCost,
        }
    }, [invoicesForMonth])

    // สถิติแยกตามห้องประจำเดือนที่เลือก
    const roomUsage = useMemo(() => {
        return invoicesForMonth
            .map((inv) => ({
                room: inv.room,
                water: Math.max(0, (inv.water_curr || 0) - (inv.water_prev || 0)),
                electric: Math.max(0, (inv.elec_curr || 0) - (inv.elec_prev || 0)),
            }))
            .sort((a, b) => String(a.room).localeCompare(String(b.room), undefined, { numeric: true }))
    }, [invoicesForMonth])

    return (
        <div className="p-6 md:p-8 flex flex-col gap-6 max-w-7xl mx-auto">
            {/* Header: ชื่อหน้า Dashboard + ตัวเลือกเดือน + ปุ่มกระดิ่งแจ้งเตือน + Avatar */}
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                        Dashboard
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">
                        ภาพรวมระบบประจำเดือน {formatMonth(selectedMonth)}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <MonthPicker
                        value={selectedMonth}
                        onChange={setSelectedMonth}
                        marked={monthsWithInvoices}
                    />
                    <NotificationBell />
                    <AvatarMenu />
                </div>
            </div>

            {/* แจ้งเตือนข้อผิดพลาด (ถ้ามี) */}
            {loadError && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex justify-between items-center">
                    <span>{loadError}</span>
                    <button
                        type="button"
                        onClick={retryLoad}
                        className="underline text-red-800 font-medium cursor-pointer"
                    >
                        ลองใหม่
                    </button>
                </div>
            )}

            {/* แถวที่ 1: การ์ดสรุป 3 ใบ ตามรูปภาพต้นแบบ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* 1. รายได้เดือนนี้ */}
                <div className="bg-white rounded-2xl p-6 shadow-card border border-line flex flex-col justify-between">
                    <span className="text-sm font-medium text-gray-600">
                        รายได้เดือนนี้ ({formatMonth(selectedMonth)})
                    </span>
                    <div className="mt-3 text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
                        {loading ? (
                            <span className="text-gray-300 text-2xl font-normal">กำลังโหลด...</span>
                        ) : (
                            `฿${monthlyIncome.toLocaleString()}`
                        )}
                    </div>
                </div>

                {/* 2. ห้องที่ค้างชำระทั้งหมด */}
                <div className="bg-white rounded-2xl p-6 shadow-card border border-line flex flex-col justify-between">
                    <span className="text-sm font-medium text-gray-600">
                        ห้องที่ค้างชำระทั้งหมด
                    </span>
                    <div className="mt-3 flex items-baseline">
                        {loading ? (
                            <span className="text-gray-300 text-2xl font-normal">กำลังโหลด...</span>
                        ) : (
                            <>
                                <span className="text-3xl sm:text-4xl font-bold text-gray-900">
                                    {unpaidRoomsCount}
                                </span>
                                <span className="text-xl sm:text-2xl font-normal text-gray-400">
                                    /{rooms.length}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* 3. ค่าน้ำ/ค่าไฟรวม */}
                <div className="bg-white rounded-2xl p-6 shadow-card border border-line flex flex-col justify-between">
                    <span className="text-sm font-medium text-gray-600 mb-2">
                        ค่าน้ำ/ค่าไฟรวม ({formatMonth(selectedMonth)})
                    </span>
                    <div className="grid grid-cols-2 divide-x divide-gray-200">
                        {/* ค่าน้ำรวม */}
                        <div className="text-center pr-3">
                            <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                                {loading ? '...' : utilityStats.waterCost.toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                                หน่วยละ {utilityStats.waterRate} บาท
                            </div>
                        </div>

                        {/* ค่าไฟรวม */}
                        <div className="text-center pl-3">
                            <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                                {loading ? '...' : utilityStats.elecCost.toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                                หน่วยละ {utilityStats.elecRate} บาท
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* แถวที่ 2: สถิติการใช้น้ำ/ไฟ จากข้อมูลจริงประจำเดือน */}
            <div className="bg-white rounded-2xl p-6 md:p-8 shadow-card border border-line">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-900">สถิติการใช้น้ำ/ไฟ</h2>
                        <span className="text-xs text-gray-400 font-normal">
                            (ประจำเดือน {formatMonth(selectedMonth)})
                        </span>
                    </div>
                    <span className="bg-[#fef9c3] text-[#854d0e] border border-[#fef08a] px-3 py-1 rounded-md text-xs font-semibold">
                        {formatMonth(selectedMonth)}
                    </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* ฝั่งซ้าย: กล่องไฮไลต์ตัวเลขน้ำรวม & ไฟรวม + รายละเอียดสรุป */}
                    <div className="lg:col-span-5 flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            {/* กล่องน้ำรวม */}
                            <div className="bg-[#cffafe] border border-[#a5f3fc] rounded-2xl p-5 text-center flex flex-col justify-center shadow-2xs">
                                <span className="text-xs font-semibold text-[#0e7490]">
                                    น้ำรวม
                                </span>
                                <span className="text-3xl sm:text-4xl font-bold text-gray-900 my-1">
                                    {loading ? '...' : utilityStats.waterUnits.toLocaleString()}
                                </span>
                                <span className="text-xs font-medium text-[#0e7490]">หน่วย</span>
                            </div>

                            {/* กล่องไฟรวม */}
                            <div className="bg-[#ffedd5] border border-[#fed7aa] rounded-2xl p-5 text-center flex flex-col justify-center shadow-2xs">
                                <span className="text-xs font-semibold text-[#c2410c]">
                                    ไฟรวม
                                </span>
                                <span className="text-3xl sm:text-4xl font-bold text-gray-900 my-1">
                                    {loading ? '...' : utilityStats.elecUnits.toLocaleString()}
                                </span>
                                <span className="text-xs font-medium text-[#c2410c]">หน่วย</span>
                            </div>
                        </div>

                        {/* กล่องสรุปค่าใช้จ่ายภาพรวม */}
                        <div className="bg-sand/30 rounded-2xl p-4 border border-line flex flex-col gap-2.5 text-xs text-gray-600">
                            <div className="flex justify-between items-center">
                                <span>ค่าน้ำทั้งหมด ({utilityStats.waterUnits} หน่วย × {utilityStats.waterRate}฿)</span>
                                <span className="font-semibold text-gray-900">
                                    ฿{utilityStats.waterCost.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span>ค่าไฟทั้งหมด ({utilityStats.elecUnits} หน่วย × {utilityStats.elecRate}฿)</span>
                                <span className="font-semibold text-gray-900">
                                    ฿{utilityStats.elecCost.toLocaleString()}
                                </span>
                            </div>
                            <div className="pt-2 border-t border-line flex justify-between items-center text-sm font-bold text-primary-dark">
                                <span>ยอดรวมค่าน้ำและไฟฟ้า</span>
                                <span>
                                    ฿{utilityStats.totalCost.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ฝั่งขวา: ตารางสถิติแยกตามห้อง */}
                    <div className="lg:col-span-7 flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-semibold text-gray-500">
                                สถิติการใช้จริงแยกแต่ละห้อง
                            </span>
                            <span className="text-[11px] text-gray-400">
                                {roomUsage.length} ห้องที่มีใบแจ้งหนี้
                            </span>
                        </div>

                        <div className="border border-line rounded-xl overflow-hidden">
                            <div className="max-h-68 overflow-y-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-sand/40 sticky top-0 z-10 border-b border-line text-xs text-gray-500 font-semibold">
                                        <tr>
                                            <th className="py-2.5 px-4 font-normal text-gray-400">ห้อง</th>
                                            <th className="py-2.5 px-4 font-normal text-gray-400 text-center">
                                                น้ำ (หน่วย)
                                            </th>
                                            <th className="py-2.5 px-4 font-normal text-gray-400 text-right">
                                                ไฟ (หน่วย)
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {roomUsage.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={3}
                                                    className="py-8 text-center text-gray-400 text-xs sm:text-sm"
                                                >
                                                    {loading ? (
                                                        'กำลังโหลดข้อมูล...'
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-2">
                                                            <span>ยังไม่มีข้อมูลการใช้น้ำ/ไฟในเดือน {formatMonth(selectedMonth)}</span>
                                                            <Link
                                                                to="/invoices"
                                                                className="text-xs text-primary hover:underline font-medium"
                                                            >
                                                                + ออกใบแจ้งหนี้เดือนนี้
                                                            </Link>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ) : (
                                            roomUsage.map((item) => (
                                                <tr
                                                    key={item.room}
                                                    className="hover:bg-sand/30 transition-colors"
                                                >
                                                    <td className="py-2.5 px-4 font-medium text-gray-800">
                                                        {item.room}
                                                    </td>
                                                    <td className="py-2.5 px-4 text-center text-gray-700 font-medium">
                                                        {item.water}
                                                    </td>
                                                    <td className="py-2.5 px-4 text-right text-gray-700 font-medium">
                                                        {item.electric}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* แถวที่ 3: ห้องที่ค้างชำระทั้งหมด จากข้อมูลจริง */}
            <div className="bg-white rounded-2xl p-6 md:p-8 shadow-card border border-line">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-900">
                            ห้องที่ค้างชำระทั้งหมด
                        </h2>
                        {!loading && overdueInvoices.length > 0 && (
                            <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2.5 py-0.5 rounded-full">
                                {overdueInvoices.length} รายการ
                            </span>
                        )}
                    </div>
                    <Link
                        to="/invoices"
                        className="text-xs text-primary hover:text-primary-dark font-semibold transition"
                    >
                        จัดการใบแจ้งหนี้ทั้งหมด →
                    </Link>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 text-xs text-gray-400 font-normal">
                                <th className="py-3 px-2 font-normal">ห้อง</th>
                                <th className="py-3 px-2 font-normal">ผู้เช่า</th>
                                <th className="py-3 px-2 font-normal">ยอด (บาท)</th>
                                <th className="py-3 px-2 font-normal">เดือน</th>
                                <th className="py-3 px-2 font-normal text-right">สถานะ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-gray-400 text-sm">
                                        กำลังโหลดข้อมูล...
                                    </td>
                                </tr>
                            ) : overdueInvoices.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-emerald-600 text-sm font-medium">
                                        ไม่มีห้องที่ค้างชำระ (ชำระเงินเรียบร้อยทุกห้อง 🎉)
                                    </td>
                                </tr>
                            ) : (
                                overdueInvoices.map((inv) => (
                                    <tr
                                        key={inv.id || inv.room}
                                        onClick={() => navigate('/invoices')}
                                        className="hover:bg-sand/30 transition-colors cursor-pointer group"
                                        title="คลิกเพื่อไปที่หน้าใบแจ้งหนี้"
                                    >
                                        <td className="py-3.5 px-2 font-medium text-gray-900">
                                            {inv.room}
                                        </td>
                                        <td className="py-3.5 px-2 text-gray-800 font-medium">
                                            {inv.tenant}
                                        </td>
                                        <td className="py-3.5 px-2 text-gray-900 font-semibold">
                                            ฿{inv.amount.toLocaleString()}
                                        </td>
                                        <td className="py-3.5 px-2 text-gray-600">
                                            {inv.month}
                                        </td>
                                        <td className="py-3.5 px-2 text-right">
                                            <span
                                                className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${inv.statusStyle}`}
                                            >
                                                {inv.statusLabel}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

export default AdminDashboardPage
