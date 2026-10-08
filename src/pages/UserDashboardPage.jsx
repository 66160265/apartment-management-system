import { useEffect, useMemo, useRef, useState } from 'react'
import AvatarMenu from '../components/AvatarMenu'
import PageHeader from '../components/PageHeader'
import Icon from '../components/Icon'
import InvoicePrintModal from '../components/InvoicePrintModal'
import { BANK, invoiceStatuses } from '../data/billing'
import { baht, formatDateTime, formatMonth } from '../lib/billing'
import { generatePromptPayQR } from '../lib/promptpay'
import { supabase } from '../lib/supabaseClient'
import { useCurrentUser } from '../lib/useCurrentUser'

const MAX_SIZE = 5 * 1024 * 1024
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

const formatSize = (bytes) =>
    bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
        : `${Math.ceil(bytes / 1024)} KB`

// วันที่ปัจจุบันในรูปแบบภาษาไทย (เช่น "วันที่ 8 ต.ค. 69")
const formatThaiToday = () => {
    const now = new Date()
    return `วันที่ ${now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}`
}

// วันที่ครบกำหนดชำระ (วันที่ 5 ของเดือนถัดไป เช่น "5 ต.ค. 69")
const formatDueDate = (monthStr) => {
    if (!monthStr) return '-'
    const [y, m] = monthStr.split('-').map(Number)
    const dueDate = new Date(y, m, 5)
    return dueDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

// ปุ่มคัดลอกข้อความ
function CopyBtn({ text, label = 'คัดลอก' }) {
    const [copied, setCopied] = useState(false)
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            // fallback
        }
    }
    return (
        <button
            type="button"
            onClick={copy}
            className="text-xs px-2.5 py-1 rounded-lg bg-sand/80 hover:bg-mist/60 text-primary-dark font-medium border border-line transition cursor-pointer"
        >
            {copied ? 'คัดลอกแล้ว' : label}
        </button>
    )
}

function UserDashboardPage() {
    const me = useCurrentUser()

    // มุมมอง: 'overview' (หน้าแรกของ Dashboard) หรือ 'payment' (หน้าชำระเงินตามรูปที่สอง)
    const [currentView, setCurrentView] = useState('overview')

    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')

    // ข้อมูลจริงจากฐานข้อมูล
    const [tenantInfo, setTenantInfo] = useState(null)
    const [roomInfo, setRoomInfo] = useState(null)
    const [invoices, setInvoices] = useState([])
    const [selectedInvoiceId, setSelectedInvoiceId] = useState(null)

    // สำหรับหน้าชำระเงิน (View 2)
    const [qrCodeUrl, setQrCodeUrl] = useState(null)
    const [uploadFile, setUploadFile] = useState(null)
    const [uploadPreview, setUploadPreview] = useState(null)
    const [isDragging, setIsDragging] = useState(false)
    const [uploadError, setUploadError] = useState('')
    const [uploading, setUploading] = useState(false)
    const [uploadSuccess, setUploadSuccess] = useState(false)
    const fileInputRef = useRef(null)

    // สำหรับดูตัวอย่าง / ดาวน์โหลด PDF ใบแจ้งหนี้
    const [showPdfModal, setShowPdfModal] = useState(false)

    // สถานะเปิดป็อปอัปดูประวัติใบแจ้งหนี้ทั้งหมด
    const [showHistoryModal, setShowHistoryModal] = useState(false)

    // โหลดข้อมูล Dashboard
    const loadData = async () => {
        if (!me) return
        setLoading(true)
        setLoadError('')

        try {
            const activeTenant = me.tenant

            if (!activeTenant) {
                setTenantInfo(null)
                setRoomInfo(null)
                setInvoices([])
                setLoading(false)
                return
            }

            setTenantInfo(activeTenant)

            // ดึงข้อมูลห้องพัก (ชั้น, ค่าเช่า)
            const { data: rData } = await supabase
                .from('rooms')
                .select('*')
                .eq('number', activeTenant.room)
                .maybeSingle()
            setRoomInfo(rData)

            // ดึงข้อมูลใบแจ้งหนี้ของผู้เช่าห้องนี้
            const { data: invData, error: invErr } = await supabase
                .from('invoices')
                .select('*')
                .eq('room', activeTenant.room)
                .order('month', { ascending: false })
            if (invErr) throw invErr

            const invList = invData || []
            setInvoices(invList)

            // เลือกใบแจ้งหนี้ที่สำคัญที่สุด: ค้างชำระ (pending) ก่อน -> หรือรอตรวจ (review) -> หรือใบล่าสุด
            const pendingInv = invList.find((i) => i.status === 'pending')
            const reviewInv = invList.find((i) => i.status === 'review')
            const targetInv = pendingInv || reviewInv || invList[0]

            if (targetInv) {
                setSelectedInvoiceId(targetInv.id)
            }
        } catch (err) {
            console.error('Error loading tenant dashboard:', err)
            setLoadError(`เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message || 'ไม่สามารถติดต่อฐานข้อมูลได้'}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [me])

    // ใบแจ้งหนี้ที่กำลังแสดงผล
    const activeInvoice = useMemo(() => {
        if (!selectedInvoiceId) return invoices[0] || null
        return invoices.find((i) => i.id === selectedInvoiceId) || invoices[0] || null
    }, [invoices, selectedInvoiceId])

    // สร้าง PromptPay QR เมื่อเลือกใบแจ้งหนี้หรือเข้าสู่หน้าชำระเงิน
    useEffect(() => {
        if (activeInvoice && currentView === 'payment') {
            generatePromptPayQR(BANK.promptpay, activeInvoice.total)
                .then(setQrCodeUrl)
                .catch((e) => console.error('Failed to generate PromptPay QR:', e))
        }
    }, [activeInvoice, currentView])

    // จัดการล้าง URL ตัวอย่างรูปเมื่อเปลี่ยนรูป
    useEffect(() => () => uploadPreview && URL.revokeObjectURL(uploadPreview), [uploadPreview])

    // คำนวณวันหมดสัญญา
    const contractRemainingDays = useMemo(() => {
        if (!tenantInfo?.end_date) return null
        const end = new Date(tenantInfo.end_date)
        const now = new Date()
        end.setHours(0, 0, 0, 0)
        now.setHours(0, 0, 0, 0)
        const diffTime = end - now
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        return days
    }, [tenantInfo])

    // ฟังก์ชันเลือกไฟล์สลิป
    const pickFile = (file) => {
        setUploadError('')
        setUploadSuccess(false)
        if (!file) return
        if (!TYPES[file.type]) {
            setUploadError('รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WEBP เท่านั้น')
            return
        }
        if (file.size > MAX_SIZE) {
            setUploadError('ขนาดไฟล์ต้องไม่เกิน 5 MB')
            return
        }
        setUploadFile(file)
        setUploadPreview(URL.createObjectURL(file))
    }

    const clearFile = () => {
        setUploadFile(null)
        setUploadPreview(null)
        setUploadError('')
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // ฟังก์ชันส่งหลักฐานสลิปการโอน
    const handleSubmitSlip = async () => {
        if (!uploadFile || !activeInvoice) return
        setUploading(true)
        setUploadError('')

        try {
            const ext = TYPES[uploadFile.type] || 'jpg'
            const userId = me?.id || activeInvoice.user_id
            const path = `${userId}/${activeInvoice.id}-${Date.now()}.${ext}`

            // อัปโหลดไปยัง Supabase Storage bucket 'slips'
            const { error: storageError } = await supabase.storage
                .from('slips')
                .upload(path, uploadFile, { contentType: uploadFile.type })

            if (storageError) {
                throw new Error(`อัปโหลดไฟล์ไม่สำเร็จ: ${storageError.message}`)
            }

            // เรียก RPC submit_slip สำหรับผู้เช่า
            const { error: rpcError } = await supabase.rpc('submit_slip', {
                p_invoice: activeInvoice.id,
                p_path: path,
            })

            if (rpcError) {
                await supabase.storage.from('slips').remove([path])
                throw new Error(`ส่งสลิปไม่สำเร็จ: ${rpcError.message}`)
            }

            await loadData()
            clearFile()
            setUploadSuccess(true)
            setCurrentView('overview')
        } catch (err) {
            console.error('Error submitting slip:', err)
            setUploadError(err.message || 'เกิดข้อผิดพลาดในการส่งหลักฐาน')
        } finally {
            setUploading(false)
        }
    }

    // รายการคำนวณค่าน้ำ-ค่าไฟ
    const invoiceBreakdown = useMemo(() => {
        if (!activeInvoice) return null
        const waterUnits = Math.max(0, (activeInvoice.water_curr || 0) - (activeInvoice.water_prev || 0))
        const elecUnits = Math.max(0, (activeInvoice.elec_curr || 0) - (activeInvoice.elec_prev || 0))
        const waterCost = waterUnits * Number(activeInvoice.water_rate || 0)
        const elecCost = elecUnits * Number(activeInvoice.elec_rate || 0)

        return {
            rent: Number(activeInvoice.rent || 0),
            waterUnits,
            waterRate: Number(activeInvoice.water_rate || 0),
            waterCost,
            elecUnits,
            elecRate: Number(activeInvoice.elec_rate || 0),
            elecCost,
            commonFee: Number(activeInvoice.common_fee || 0),
            total: Number(activeInvoice.total || 0),
        }
    }, [activeInvoice])

    if (loading && !tenantInfo) {
        return (
            <div className="p-6 flex flex-col gap-6">
                <div className="flex justify-between items-center animate-pulse">
                    <div className="h-8 bg-gray-200 rounded-lg w-48" />
                    <div className="w-10 h-10 bg-gray-200 rounded-full" />
                </div>
                <div className="h-36 bg-gray-200 rounded-2xl animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" />
                    <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" />
                </div>
            </div>
        )
    }

    if (!tenantInfo) {
        return (
            <div className="p-6 flex flex-col gap-6">
                <PageHeader flush title="ภาพรวม" subtitle="ยินดีต้อนรับเข้าสู่ระบบจัดการห้องพัก" />
                <div className="bg-white rounded-2xl p-12 text-center shadow-card border border-line flex flex-col items-center gap-3">
                    <span className="w-16 h-16 rounded-full bg-sand flex items-center justify-center text-muted">
                        <Icon name="door" className="w-8 h-8" />
                    </span>
                    <h2 className="text-lg font-bold text-gray-800">ไม่พบข้อมูลห้องพักหรือสัญญาเช่า</h2>
                    <p className="text-sm text-muted max-w-md">
                        บัญชีผู้ใช้นี้ยังไม่ได้ผูกกับห้องพักในระบบ หรือยังไม่มีข้อมูลผู้เช่า กรุณาติดต่อผู้ดูแลหอพัก
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 flex flex-col gap-6">
            {/* Error Message ถ้ามี */}
            {loadError && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex justify-between items-center">
                    <span>{loadError}</span>
                    <button
                        type="button"
                        onClick={loadData}
                        className="underline text-red-800 font-medium cursor-pointer"
                    >
                        ลองใหม่
                    </button>
                </div>
            )}

            {/* ---------------- VIEW 1: OVERVIEW SCREEN (หน้าสรุปบิลตามรูปแรก) ---------------- */}
            {currentView === 'overview' && (
                <>
                    {/* Header ประจำหน้า */}
                    <PageHeader flush title="ภาพรวม" subtitle="ภาพรวมข้อมูลห้องพักและค่าใช้จ่ายประจำเดือน" />

                    {/* แจ้งเตือนเมื่อส่งสลิปสำเร็จ */}
                    {uploadSuccess && (
                        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm flex items-center justify-between shadow-xs">
                            <div className="flex items-center gap-2.5">
                                <Icon name="checkCircle" className="w-5 h-5 text-emerald-600 shrink-0" />
                                <span className="font-medium">
                                    ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว! สถานะเปลี่ยนเป็น &quot;รอตรวจสอบ&quot;
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setUploadSuccess(false)}
                                className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold cursor-pointer"
                            >
                                ปิด
                            </button>
                        </div>
                    )}

                    {/* การ์ดต้อนรับและข้อมูลสัญญาเช่า (Desktop Banner ตามข้อมูลในรูปแรก) */}
                    <div className="bg-linear-to-r from-primary-dark via-primary to-primary-deep text-white rounded-2xl p-6 md:p-8 shadow-card flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-xs md:text-sm text-mist font-medium">
                                <span className="bg-white/15 px-3 py-1 rounded-full backdrop-blur-xs">
                                    ห้อง {tenantInfo?.room || '-'} - ชั้น {roomInfo?.floor || '1'}
                                </span>
                                <span>·</span>
                                <span>{formatThaiToday()}</span>
                            </div>
                            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                                สวัสดี, คุณ{tenantInfo?.name || 'ผู้เช่า'}
                            </h2>
                            <p className="text-xs md:text-sm text-white/80">
                                เบอร์โทรติดต่อ: {tenantInfo?.phone || '-'}
                            </p>
                        </div>

                        {/* กล่องข้อมูลสัญญาเช่า */}
                        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 flex flex-col gap-1.5 min-w-56">
                            <div className="text-xs text-mist font-medium flex items-center justify-between">
                                <span>สัญญาเช่า</span>
                                {contractRemainingDays !== null && (
                                    <span
                                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                            contractRemainingDays > 30
                                                ? 'bg-emerald-500/20 text-emerald-200'
                                                : contractRemainingDays > 0
                                                ? 'bg-amber-500/20 text-amber-200'
                                                : 'bg-red-500/20 text-red-200'
                                        }`}
                                    >
                                        {contractRemainingDays > 0
                                            ? `เหลือ ${contractRemainingDays} วัน`
                                            : 'หมดสัญญาแล้ว'}
                                    </span>
                                )}
                            </div>
                            <div className="text-base font-semibold">
                                {tenantInfo?.end_date
                                    ? `สัญญาถึง ${new Date(tenantInfo.end_date).toLocaleDateString('th-TH', {
                                          day: 'numeric',
                                          month: 'short',
                                          year: '2-digit',
                                      })}`
                                    : 'ไม่ได้ระบุวันสิ้นสุดสัญญา'}
                            </div>
                        </div>
                    </div>

                    {/* การ์ดสรุปตัวเลข 2 ใบ ตามรูปแรก (พร้อมการ์ดที่ 3 สำหรับการแสดงผลบน Desktop) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* 1. ยอดเดือนนี้ */}
                        <div className="bg-white rounded-2xl p-6 shadow-card border border-line flex flex-col justify-between">
                            <span className="text-sm font-medium text-gray-600">ยอดเดือนนี้</span>
                            <div className="mt-3">
                                <div className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight tabular-nums">
                                    {activeInvoice ? baht(activeInvoice.total) : '฿0'}
                                </div>
                                <div className="text-xs text-muted mt-1.5 font-medium">
                                    {activeInvoice ? `เดือน ${formatMonth(activeInvoice.month)}` : 'ไม่มีใบแจ้งหนี้'}
                                </div>
                            </div>
                        </div>

                        {/* 2. สถานะ */}
                        <div className="bg-white rounded-2xl p-6 shadow-card border border-line flex flex-col justify-between">
                            <span className="text-sm font-medium text-gray-600">สถานะ</span>
                            <div className="mt-3">
                                <div className="text-2xl sm:text-3xl font-bold tracking-tight">
                                    {activeInvoice ? (
                                        <span
                                            className={
                                                activeInvoice.status === 'paid'
                                                    ? 'text-emerald-600'
                                                    : activeInvoice.status === 'review'
                                                    ? 'text-sky-600'
                                                    : 'text-amber-600'
                                            }
                                        >
                                            {invoiceStatuses[activeInvoice.status]?.label || activeInvoice.status}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400 font-normal">ไม่มีรายการ</span>
                                    )}
                                </div>
                                <div className="text-xs text-muted mt-1.5 font-medium">
                                    {activeInvoice ? (
                                        activeInvoice.status === 'paid' ? (
                                            `ชำระเรียบร้อยเมื่อ ${formatDateTime(activeInvoice.reviewed_at)}`
                                        ) : activeInvoice.status === 'review' ? (
                                            `ส่งสลิปเมื่อ ${formatDateTime(activeInvoice.slip_uploaded_at)} (รอตรวจ)`
                                        ) : (
                                            `ภายในวันที่ ${formatDueDate(activeInvoice.month)}`
                                        )
                                    ) : (
                                        'ทุกรายการชำระครบถ้วนแล้ว'
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 3. สรุปการใช้พลังงาน (Desktop Complement) */}
                        <div className="bg-white rounded-2xl p-6 shadow-card border border-line flex flex-col justify-between">
                            <span className="text-sm font-medium text-gray-600">การใช้น้ำและไฟฟ้าเดือนนี้</span>
                            <div className="mt-3 grid grid-cols-2 divide-x divide-line text-center">
                                <div className="pr-2">
                                    <span className="text-xs text-sky-700 font-semibold block">น้ำประปา</span>
                                    <span className="text-2xl font-bold text-gray-900 tabular-nums">
                                        {invoiceBreakdown?.waterUnits ?? 0}
                                    </span>
                                    <span className="text-[11px] text-gray-400 block">หน่วย</span>
                                </div>
                                <div className="pl-2">
                                    <span className="text-xs text-amber-700 font-semibold block">ไฟฟ้า</span>
                                    <span className="text-2xl font-bold text-gray-900 tabular-nums">
                                        {invoiceBreakdown?.elecUnits ?? 0}
                                    </span>
                                    <span className="text-[11px] text-gray-400 block">หน่วย</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ส่วนเนื้อหาหลัก: รายการค่าใช้จ่าย (Desktop 2 คอลัมน์) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* ฝั่งซ้าย: รายการค่าใช้จ่าย (ตามรูปแรก) */}
                        <div className="lg:col-span-8 bg-white rounded-2xl p-6 md:p-8 shadow-card border border-line flex flex-col gap-5">
                            <div className="flex justify-between items-center border-b border-line pb-4">
                                <h3 className="text-lg font-bold text-primary-dark">รายการค่าใช้จ่าย</h3>
                                {activeInvoice && (
                                    <span className="bg-mist/40 text-primary-dark font-semibold text-xs px-3 py-1 rounded-full">
                                        {formatMonth(activeInvoice.month)}
                                    </span>
                                )}
                            </div>

                            {invoiceBreakdown ? (
                                <div className="flex flex-col divide-y divide-line/70">
                                    {/* ค่าห้อง */}
                                    <div className="py-3.5 flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-3">
                                            <span className="grid place-items-center w-8 h-8 rounded-lg bg-sky-50 text-sky-700">
                                                <Icon name="home" className="w-4 h-4" />
                                            </span>
                                            <span className="text-gray-800 font-medium">ค่าห้อง</span>
                                        </div>
                                        <span className="font-semibold text-gray-900 tabular-nums">
                                            {baht(invoiceBreakdown.rent)}
                                        </span>
                                    </div>

                                    {/* ค่าน้ำ */}
                                    <div className="py-3.5 flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-3">
                                            <span className="grid place-items-center w-8 h-8 rounded-lg bg-cyan-50 text-cyan-700">
                                                <Icon name="droplet" className="w-4 h-4" />
                                            </span>
                                            <div>
                                                <div className="text-gray-800 font-medium">
                                                    ค่าน้ำ {invoiceBreakdown.waterUnits} หน่วย (หน่วยละ {invoiceBreakdown.waterRate} บาท)
                                                </div>
                                                <div className="text-[11px] text-gray-400">
                                                    มิเตอร์: {activeInvoice.water_prev} → {activeInvoice.water_curr}
                                                </div>
                                            </div>
                                        </div>
                                        <span className="font-semibold text-gray-900 tabular-nums">
                                            {baht(invoiceBreakdown.waterCost)}
                                        </span>
                                    </div>

                                    {/* ค่าไฟ */}
                                    <div className="py-3.5 flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-3">
                                            <span className="grid place-items-center w-8 h-8 rounded-lg bg-amber-50 text-amber-700">
                                                <Icon name="bolt" className="w-4 h-4" />
                                            </span>
                                            <div>
                                                <div className="text-gray-800 font-medium">
                                                    ค่าไฟ {invoiceBreakdown.elecUnits} หน่วย (หน่วยละ {invoiceBreakdown.elecRate} บาท)
                                                </div>
                                                <div className="text-[11px] text-gray-400">
                                                    มิเตอร์: {activeInvoice.elec_prev} → {activeInvoice.elec_curr}
                                                </div>
                                            </div>
                                        </div>
                                        <span className="font-semibold text-gray-900 tabular-nums">
                                            {baht(invoiceBreakdown.elecCost)}
                                        </span>
                                    </div>

                                    {/* ค่าส่วนกลาง */}
                                    <div className="py-3.5 flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-3">
                                            <span className="grid place-items-center w-8 h-8 rounded-lg bg-violet-50 text-violet-700">
                                                <Icon name="building" className="w-4 h-4" />
                                            </span>
                                            <span className="text-gray-800 font-medium">ค่าส่วนกลาง</span>
                                        </div>
                                        <span className="font-semibold text-gray-900 tabular-nums">
                                            {baht(invoiceBreakdown.commonFee)}
                                        </span>
                                    </div>

                                    {/* รวมทั้งหมด */}
                                    <div className="pt-5 flex justify-between items-center">
                                        <span className="text-base font-bold text-gray-900">รวมทั้งหมด</span>
                                        <span className="text-2xl font-bold text-primary-dark tabular-nums">
                                            {baht(invoiceBreakdown.total)}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-12 text-center text-gray-400 text-sm">
                                    ยังไม่มีรายการค่าใช้จ่ายในขณะนี้
                                </div>
                            )}
                        </div>

                        {/* ฝั่งขวา: กล่อง Action (ปุ่มชำระเงินตามรูปแรก ที่เมื่อกดแล้วจะเปิดหน้าในรูปที่สอง) */}
                        <div className="lg:col-span-4 flex flex-col gap-5">
                            <div className="bg-white rounded-2xl p-6 shadow-card border border-line flex flex-col gap-4">
                                <h3 className="text-base font-bold text-gray-900">การดำเนินการ</h3>

                                {activeInvoice?.status === 'pending' ? (
                                    <>
                                        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3.5 rounded-xl leading-relaxed">
                                            <span className="font-semibold mb-0.5 flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4" />มียอดรอชำระเงิน</span>
                                            กรุณาชำระเงินและแนบหลักฐานการโอนภายในวันที่ {formatDueDate(activeInvoice.month)}
                                        </div>

                                        {/* ปุ่มชำระเงิน / อัปโหลดสลิป ตามรูปแรก เมื่อกดจะเปิดหน้าในรูปที่สอง */}
                                        <button
                                            type="button"
                                            onClick={() => setCurrentView('payment')}
                                            className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3.5 px-4 rounded-xl shadow-card flex items-center justify-center gap-2 transition cursor-pointer"
                                        >
                                            <Icon name="creditCard" className="w-5 h-5" />
                                            <span>ชำระเงิน / อัปโหลดสลิป</span>
                                        </button>
                                    </>
                                ) : activeInvoice?.status === 'review' ? (
                                    <>
                                        <div className="bg-sky-50 border border-sky-200 text-sky-800 text-xs p-3.5 rounded-xl leading-relaxed">
                                            <span className="font-semibold block mb-0.5">⏳ รอตรวจสอบสลิป</span>
                                            ท่านได้แนบหลักฐานการโอนเงินแล้วเมื่อ {formatDateTime(activeInvoice.slip_uploaded_at)} ผู้ดูแลระบบกำลังตรวจสอบ
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setCurrentView('payment')}
                                            className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 px-4 rounded-xl shadow-card flex items-center justify-center gap-2 transition cursor-pointer"
                                        >
                                            <Icon name="review" className="w-4 h-4" />
                                            <span>ดูรายละเอียดการชำระเงิน</span>
                                        </button>
                                    </>
                                ) : activeInvoice?.status === 'paid' ? (
                                    <>
                                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-xl leading-relaxed">
                                            <span className="font-semibold mb-0.5 flex items-center gap-1.5"><Icon name="checkCircle" className="w-4 h-4" />ชำระเงินเรียบร้อยแล้ว</span>
                                            ยอดของเดือนนี้ได้รับการตรวจสอบและยืนยันการชำระเงินแล้ว
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-xs text-gray-500">ไม่มีรายการที่ต้องดำเนินการ</p>
                                )}

                                {activeInvoice && (
                                    <button
                                        type="button"
                                        onClick={() => setShowPdfModal(true)}
                                        className="w-full border border-line bg-sand/30 hover:bg-mist/40 text-primary-dark font-medium py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                                    >
                                        <Icon name="fileText" className="w-4 h-4" />
                                        <span>ดาวน์โหลดใบแจ้งหนี้ PDF</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ---------------- VIEW 2: PAYMENT SCREEN (หน้าชำระเงินตามรูปที่สอง) ---------------- */}
            {currentView === 'payment' && (
                <>
                    {/* Header พร้อมปุ่มกลับ */}
                    <div className="flex flex-wrap justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setCurrentView('overview')}
                                className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-line hover:bg-mist/30 text-primary-dark font-medium rounded-xl text-sm transition cursor-pointer shadow-xs"
                            >
                                <Icon name="arrowLeft" className="w-4 h-4" />
                                <span>กลับ</span>
                            </button>
                            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                                ชำระเงิน
                            </h1>
                        </div>
                        <div className="flex items-center gap-3">
                            <AvatarMenu />
                        </div>
                    </div>

                    {/* การ์ดสรุปยอดที่ต้องชำระ (ตามส่วนบนของรูปที่สอง) */}
                    <div className="bg-white rounded-2xl p-6 md:p-8 shadow-card border border-line text-center flex flex-col items-center justify-center">
                        <span className="text-xs md:text-sm text-gray-500 font-medium">
                            ยอดที่ต้องชำระ · ประจำเดือน {activeInvoice ? formatMonth(activeInvoice.month) : '-'} (ห้อง {tenantInfo?.room})
                        </span>
                        <div className="text-3xl sm:text-5xl font-extrabold text-gray-900 mt-2 tracking-tight tabular-nums">
                            {activeInvoice ? baht(activeInvoice.total) : '฿0'}
                        </div>
                        <span className="text-xs md:text-sm text-red-600 font-semibold mt-2">
                            ภายในวันที่ {activeInvoice ? formatDueDate(activeInvoice.month) : '-'}
                        </span>
                    </div>

                    {/* กล่องการชำระเงินและแนบสลิป (Desktop 2 คอลัมน์) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* ฝั่งซ้าย: สแกน QR PromptPay และข้อมูลบัญชีธนาคาร (ตามรูปที่สอง) */}
                        <div className="lg:col-span-6 bg-white rounded-2xl p-6 md:p-8 shadow-card border border-line flex flex-col items-center text-center gap-5">
                            <h3 className="text-lg font-bold text-gray-900">
                                สแกน QR PromptPay
                            </h3>

                            {/* กรอบแสดง QR PromptPay */}
                            <div className="p-4 bg-white rounded-2xl border-2 border-dashed border-primary/30 shadow-xs flex flex-col items-center">
                                {qrCodeUrl ? (
                                    <img
                                        src={qrCodeUrl}
                                        alt="PromptPay QR Code"
                                        className="w-56 h-56 sm:w-64 sm:h-64 object-contain rounded-xl"
                                    />
                                ) : (
                                    <div className="w-56 h-56 flex items-center justify-center text-muted text-xs">
                                        กำลังสร้าง QR Code...
                                    </div>
                                )}
                            </div>

                            {/* เลขพร้อมเพย์ */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-gray-800">
                                    พร้อมเพย์ {BANK.promptpay}
                                </span>
                                <CopyBtn text={BANK.promptpay.replace(/-/g, '')} label="คัดลอก" />
                            </div>

                            {/* บัญชีธนาคารเพิ่มเติม */}
                            <div className="w-full pt-4 border-t border-line text-xs text-gray-600 flex flex-col gap-1.5 text-left bg-sand/30 p-3.5 rounded-xl">
                                <span className="font-bold text-primary-dark">หรือโอนเข้าบัญชีธนาคาร:</span>
                                <div className="flex justify-between items-center">
                                    <span>ธนาคาร: <strong className="text-gray-900">{BANK.name}</strong></span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>เลขที่บัญชี: <strong className="font-mono text-gray-900">{BANK.account}</strong></span>
                                    <CopyBtn text={BANK.account.replace(/-/g, '')} label="คัดลอก" />
                                </div>
                                <div>
                                    <span>ชื่อบัญชี: <strong className="text-gray-900">{BANK.holder}</strong></span>
                                </div>
                            </div>
                        </div>

                        {/* ฝั่งขวา: แนบสลิปโอนเงิน + ปุ่มส่งหลักฐาน + ปุ่มดาวน์โหลด PDF (ตามรูปที่สอง) */}
                        <div className="lg:col-span-6 bg-white rounded-2xl p-6 md:p-8 shadow-card border border-line flex flex-col gap-5">
                            <div className="text-center">
                                <span className="text-xs font-semibold text-gray-400 tracking-wider">
                                    — หรือแนบสลิปโอนเงิน —
                                </span>
                            </div>

                            {/* กรณีสลิปก่อนหน้าถูกปฏิเสธ */}
                            {activeInvoice?.reject_reason && (
                                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                                    <strong>สลิปก่อนหน้าถูกปฏิเสธ:</strong> {activeInvoice.reject_reason} — กรุณาแนบรูปสลิปใหม่
                                </div>
                            )}

                            {/* แจ้งเตือนเมื่อส่งสลิปสำเร็จ */}
                            {uploadSuccess && (
                                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                                    <Icon name="checkCircle" className="w-5 h-5 text-emerald-600 shrink-0" />
                                    <span>ส่งสลิปเรียบร้อยแล้ว! สถานะเปลี่ยนเป็น &quot;รอตรวจสอบ&quot;</span>
                                </div>
                            )}

                            {/* Input ซ่อนสำหรับ File Upload */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={(e) => pickFile(e.target.files?.[0])}
                                className="hidden"
                            />

                            {/* กล่อง Dropzone / Preview */}
                            {uploadFile ? (
                                <div className="flex flex-col items-center gap-3 rounded-2xl bg-sand/60 border border-line p-5">
                                    <img
                                        src={uploadPreview}
                                        alt="ตัวอย่างรูปสลิป"
                                        className="max-h-72 max-w-full object-contain rounded-xl shadow-card"
                                    />
                                    <div className="flex items-center gap-3 text-xs text-muted">
                                        <span className="truncate max-w-48 font-medium text-gray-700">
                                            {uploadFile.name} · {formatSize(uploadFile.size)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={clearFile}
                                            disabled={uploading}
                                            className="text-red-600 hover:underline font-semibold cursor-pointer"
                                        >
                                            เปลี่ยนรูป
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={(e) => {
                                        e.preventDefault()
                                        setIsDragging(true)
                                    }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={(e) => {
                                        e.preventDefault()
                                        setIsDragging(false)
                                        pickFile(e.dataTransfer.files?.[0])
                                    }}
                                    className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-12 px-6 text-center transition cursor-pointer ${
                                        isDragging
                                            ? 'border-primary bg-mist/40'
                                            : 'border-line bg-sand/40 hover:border-primary/50 hover:bg-mist/20'
                                    }`}
                                >
                                    <span className="grid place-items-center w-14 h-14 rounded-2xl bg-white shadow-card text-primary">
                                        <Icon name="upload" className="w-7 h-7" />
                                    </span>
                                    <div>
                                        <div className="font-semibold text-gray-800 text-sm sm:text-base">
                                            แตะเพื่อแนบรูปสลิป
                                        </div>
                                        <div className="text-xs text-muted mt-1">
                                            คลิกเพื่อเลือกไฟล์ หรือลากรูปมาวางที่นี่
                                        </div>
                                    </div>
                                    <span className="text-[11px] text-gray-400">
                                        JPG / PNG ไม่เกิน 5MB
                                    </span>
                                </div>
                            )}

                            {uploadError && (
                                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                                    {uploadError}
                                </p>
                            )}

                            {/* ปุ่มที่ 1: ส่งหลักฐานการชำระ (ตามรูปที่สอง) */}
                            <button
                                type="button"
                                onClick={handleSubmitSlip}
                                disabled={!uploadFile || uploading}
                                className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-semibold shadow-card flex items-center justify-center gap-2 transition cursor-pointer text-sm sm:text-base"
                            >
                                <Icon name="send" className="w-4 h-4" />
                                <span>
                                    {uploading ? 'กำลังส่งหลักฐาน...' : 'ส่งหลักฐานการชำระ'}
                                </span>
                            </button>

                            {/* ปุ่มที่ 2: ดาวน์โหลดใบแจ้งหนี้ PDF (ตามรูปที่สอง) */}
                            <button
                                type="button"
                                onClick={() => setShowPdfModal(true)}
                                className="w-full border border-line bg-white hover:bg-sand/60 text-primary-dark py-3 rounded-xl font-medium shadow-2xs flex items-center justify-center gap-2 transition cursor-pointer text-sm"
                            >
                                <Icon name="fileText" className="w-4 h-4 text-primary" />
                                <span>ดาวน์โหลดใบแจ้งหนี้ PDF</span>
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Modal สำหรับดูตัวอย่างและพิมพ์/บันทึก PDF ใบแจ้งหนี้ */}
            {showPdfModal && activeInvoice && (
                <InvoicePrintModal
                    invoice={activeInvoice}
                    tenant={tenantInfo}
                    roomFloor={roomInfo?.floor}
                    onClose={() => setShowPdfModal(false)}
                />
            )}

            {/* Modal ป็อปอัปแสดงประวัติใบแจ้งหนี้ทั้งหมด */}
            {showHistoryModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-line my-auto animate-in fade-in zoom-in-95">
                        {/* Header ของป็อปอัป */}
                        <div className="px-6 py-4 bg-sand/40 border-b border-line flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <span className="grid place-items-center w-9 h-9 rounded-xl bg-white shadow-xs text-primary">
                                    <Icon name="receipt" className="w-5 h-5" />
                                </span>
                                <div>
                                    <h3 className="text-base font-bold text-gray-900">
                                        ประวัติใบแจ้งหนี้ทั้งหมด
                                    </h3>
                                    <p className="text-xs text-muted">
                                        ห้อง {tenantInfo?.room} · ทั้งหมด {invoices.length} รอบบิล
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowHistoryModal(false)}
                                className="w-8 h-8 rounded-full bg-white hover:bg-line/60 text-gray-500 hover:text-gray-800 transition flex items-center justify-center cursor-pointer border border-line text-sm"
                            >
                                <Icon name="close" className="w-4 h-4" />
                            </button>
                        </div>

                        {/* รายการใบแจ้งหนี้ทั้งหมด */}
                        <div className="p-6 max-h-[60vh] overflow-y-auto flex flex-col gap-2.5">
                            {invoices.map((inv, idx) => {
                                const isSelected = inv.id === activeInvoice?.id
                                const isCurrent = idx === 0
                                return (
                                    <div
                                        key={inv.id}
                                        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                                            isSelected
                                                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                                                : 'border-line hover:bg-sand/30 bg-white'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="grid place-items-center w-10 h-10 rounded-xl bg-sand text-primary-dark font-semibold text-xs tabular-nums shrink-0">
                                                {idx + 1}
                                            </span>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-gray-900 text-sm">
                                                        เดือน {formatMonth(inv.month)}
                                                    </span>
                                                    {isCurrent && (
                                                        <span className="text-[10px] bg-primary text-white px-2 py-0.5 rounded-full font-medium">
                                                            เดือนปัจจุบัน
                                                        </span>
                                                    )}
                                                    {isSelected && (
                                                        <span className="text-[10px] bg-sand border border-primary/30 text-primary-dark px-2 py-0.5 rounded-full font-medium">
                                                            กำลังแสดงผล
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted mt-0.5">
                                                    ออกใบแจ้งหนี้: {inv.created_at ? new Date(inv.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : inv.month}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-line/60">
                                            <div className="text-right">
                                                <div className="text-base font-bold text-gray-900 tabular-nums">
                                                    {baht(inv.total)}
                                                </div>
                                                <span
                                                    className={`inline-block text-[11px] px-2.5 py-0.5 rounded-full font-medium mt-0.5 ${
                                                        inv.status === 'paid'
                                                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                                            : inv.status === 'review'
                                                            ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                                                            : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                                                    }`}
                                                >
                                                    {invoiceStatuses[inv.status]?.label || inv.status}
                                                </span>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedInvoiceId(inv.id)
                                                    setShowHistoryModal(false)
                                                }}
                                                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${
                                                    isSelected
                                                        ? 'bg-primary text-white shadow-xs'
                                                        : 'border border-line bg-white hover:bg-mist/40 text-primary-dark'
                                                }`}
                                            >
                                                {isSelected ? 'กำลังดูหน้านี้' : 'เลือกดูหน้านี้'}
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Footer ของป็อปอัป */}
                        <div className="px-6 py-3.5 bg-sand/30 border-t border-line flex justify-between items-center text-xs text-muted">
                            <span>คลิก &quot;เลือกดูหน้านี้&quot; เพื่อเปลี่ยนรายละเอียดค่าใช้จ่ายใน Dashboard</span>
                            <button
                                type="button"
                                onClick={() => setShowHistoryModal(false)}
                                className="px-4 py-1.5 bg-white border border-line rounded-xl text-gray-700 hover:bg-sand/60 font-medium transition cursor-pointer"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default UserDashboardPage