import { useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Icon from '../components/Icon'
import DownloadInvoiceButton from '../components/DownloadInvoiceButton'
import { invoiceStatuses } from '../data/billing'
import { balanceOf, baht, daysLate, formatDateTime, formatMonth, formatShortDate, isPartiallyPaid, lateFeeOf, paidOf } from '../lib/billing'
import { invoiceDueDate, tenantUnpaid } from '../lib/dashboard'
import { generatePromptPayQR } from '../lib/promptpay'
import AnnouncementBanner from '../components/AnnouncementBanner'
import { RepairCostBanner } from '../components/RepairPayment'
import { useRealtimeReload } from '../lib/realtime'
import { requestSlipVerify } from '../lib/slipVerify'
import { supabase } from '../lib/supabaseClient'
import { useCurrentUser } from '../lib/useCurrentUser'
import { useSettings } from '../lib/useSettings'

// ข้อจำกัดรูปสลิป: ไม่เกิน 5 MB และชนิดไฟล์ที่รับ (MIME -> นามสกุล)
const MAX_SIZE = 5 * 1024 * 1024
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// แสดงขนาดไฟล์เป็น KB หรือ MB
const formatSize = (bytes) =>
    bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
        : `${Math.ceil(bytes / 1024)} KB`

// วันที่ปัจจุบันในรูปแบบภาษาไทย (เช่น "วันที่ 8 ต.ค. 69")
const formatThaiToday = () => {
    const now = new Date()
    return `วันที่ ${now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}`
}

// วันที่ครบกำหนดชำระของใบ เช่น "5 ต.ค. 69" (ตาม due_date ของใบ หรือวันครบกำหนดในหน้าตั้งค่า)
const formatDueDate = (invoice, dueDay) => (invoice ? formatShortDate(invoiceDueDate(invoice, dueDay)) : '-')

// ปุ่มคัดลอกข้อความ
function CopyBtn({ text, label = 'คัดลอก' }) {
    const [copied, setCopied] = useState(false)
    // คัดลอกข้อความลงคลิปบอร์ด แล้วแสดง "คัดลอกแล้ว" ชั่วคราว
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

// หน้าแรกของผู้เช่า: ภาพรวมห้องและค่าใช้จ่ายเดือนนี้ และหน้าชำระเงินด้วย QR พร้อมเพย์/แนบสลิป
function UserDashboardPage() {
    const me = useCurrentUser()

    // มุมมอง: 'overview' (หน้าแรกของ Dashboard) หรือ 'payment' (หน้าชำระเงินตามรูปที่สอง)
    const [currentView, setCurrentView] = useState('overview')

    // สถานะโหลดและ error
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')

    // ข้อมูลจริงจากฐานข้อมูล
    const [tenantInfo, setTenantInfo] = useState(null)
    const [roomInfo, setRoomInfo] = useState(null)
    const [invoices, setInvoices] = useState([])
    const [selectedInvoiceId, setSelectedInvoiceId] = useState(null)

    // สำหรับหน้าชำระเงิน (View 2)
    const [qrCodeUrl, setQrCodeUrl] = useState(null)
    const [qrError, setQrError] = useState('')
    // บัญชีรับชำระ/พร้อมเพย์ มาจากหน้า "ตั้งค่า" ของผู้ดูแล
    const settings = useSettings()
    const BANK = { name: settings.bankName, account: settings.bankAccount, holder: settings.bankHolder, promptpay: settings.promptpayId }
    // ไฟล์สลิปที่เลือก, รูปตัวอย่าง, กำลังลากไฟล์, error, กำลังส่ง, ส่งสำเร็จ และ ref ของช่องเลือกไฟล์
    const [uploadFile, setUploadFile] = useState(null)
    const [uploadPreview, setUploadPreview] = useState(null)
    const [isDragging, setIsDragging] = useState(false)
    const [uploadError, setUploadError] = useState('')
    const [uploading, setUploading] = useState(false)
    const [uploadSuccess, setUploadSuccess] = useState(false)
    const fileInputRef = useRef(null)

    // โหลดข้อมูล Dashboard
    // quiet = โหลดเงียบตามเหตุการณ์ real-time: ไม่ขึ้นหน้าจอกำลังโหลด ไม่แสดง error ถ้าพลาด (ใช้ข้อมูลเดิมต่อ) และคงใบแจ้งหนี้ที่ผู้ใช้เลือกดูอยู่
    const loadData = async ({ quiet = false } = {}) => {
        if (!me) return
        if (!quiet) setLoading(true)
        if (!quiet) setLoadError('')

        try {
            // บัญชีที่ยังไม่ผูกกับห้อง: ล้างข้อมูลแล้วจบ (หน้าจะแสดงข้อความให้ติดต่อผู้ดูแล)
            const activeTenant = me.tenant

            if (!activeTenant) {
                setTenantInfo(null)
                setRoomInfo(null)
                setInvoices([])
                setLoading(false)
                return
            }

            setTenantInfo(activeTenant)

            // ดึงข้อมูลห้องพัก (ชั้น, ค่าเช่า) และใบแจ้งหนี้ของผู้เช่าห้องนี้พร้อมกัน (เดิมรอทีละอย่าง)
            const [{ data: rData }, { data: invData, error: invErr }] = await Promise.all([
                supabase.from('rooms').select('*').eq('number', activeTenant.room).maybeSingle(),
                supabase.from('invoices').select('*').eq('room', activeTenant.room).order('month', { ascending: false }),
            ])
            if (invErr) throw invErr
            setRoomInfo(rData)

            const invList = invData || []
            setInvoices(invList)

            // เลือกใบแจ้งหนี้ที่สำคัญที่สุด: ใบรอชำระที่เก่าสุดก่อน (ค้างนานสุดเร่งด่วนสุด) -> หรือรอตรวจ (review) -> หรือใบล่าสุด
            const pendingInv = [...invList].reverse().find((i) => i.status === 'pending')
            const reviewInv = invList.find((i) => i.status === 'review')
            const targetInv = pendingInv || reviewInv || invList[0]

            if (targetInv) {
                // โหลดเงียบ: ถ้าใบที่ผู้ใช้เลือกดูอยู่ยังอยู่ ไม่เปลี่ยนไปใบอื่น
                setSelectedInvoiceId((current) => (quiet && invList.some((i) => i.id === current) ? current : targetInv.id))
            }
        } catch (err) {
            console.error('Error loading tenant dashboard:', err)
            if (quiet) return
            setLoadError(`เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message || 'ไม่สามารถติดต่อฐานข้อมูลได้'}`)
        } finally {
            setLoading(false)
        }
    }

    // โหลดข้อมูลเมื่อได้ข้อมูลผู้ใช้ที่ login แล้ว ครั้งแรกขึ้นหน้าจอกำลังโหลด หลังจากนั้น (เช่น แอดมินต่อสัญญาให้ ข้อมูลผู้เช่าเปลี่ยน) โหลดเงียบ
    const loadedFor = useRef(null)
    useEffect(() => {
        if (!me) return
        const quiet = loadedFor.current === me.id
        loadedFor.current = me.id
        loadData({ quiet })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [me])

    // อัปเดตเองเมื่อผู้ดูแลยืนยันสลิป ออกใบใหม่ หรือแก้ข้อมูลห้อง (ไม่ต้องกดรีเฟรช)
    useRealtimeReload(['invoices', 'invoice_payments', 'rooms'], () => loadData({ quiet: true }), { enabled: Boolean(me?.tenant) })

    // ใบที่ต้องจ่ายอยู่ทั้งหมด (เก่าสุดก่อน) ใช้แถบ "ต้องชำระ" เมื่อค้างหลายเดือน
    const unpaid = useMemo(() => tenantUnpaid(invoices, new Date(), settings.dueDay), [invoices, settings.dueDay])
    // ข้อความเตือนค่าปรับชำระล่าช้า (ใช้อัตราที่จำไว้ในใบ ถ้าใบไม่มีใช้ค่าจากหน้าตั้งค่า) อัตรา 0 = ไม่คิดค่าปรับ ไม่แสดง
    const lateFeeNotice = (invoice) => {
        const rate = Number(invoice?.late_fee_rate ?? settings.lateFeePerDay ?? 0)
        if (!(rate > 0)) return ''
        const grace = Number(invoice?.late_fee_grace ?? settings.lateFeeGraceDays ?? 0)
        return `หากเกินกำหนด${grace > 0 ? ` ${grace} วัน` : ''} คิดค่าปรับเพิ่มวันละ ${baht(rate)}`
    }

    // ใบแจ้งหนี้ที่กำลังแสดงผล
    const activeInvoice = useMemo(() => {
        if (!selectedInvoiceId) return invoices[0] || null
        return invoices.find((i) => i.id === selectedInvoiceId) || invoices[0] || null
    }, [invoices, selectedInvoiceId])

    // สร้าง PromptPay QR เมื่อเลือกใบแจ้งหนี้หรือเข้าสู่หน้าชำระเงิน
    useEffect(() => {
        if (activeInvoice && currentView === 'payment') {
            generatePromptPayQR(BANK.promptpay, balanceOf(activeInvoice), { width: 480 })
                .then((url) => {
                    setQrCodeUrl(url)
                    setQrError('')
                })
                .catch((e) => {
                    setQrCodeUrl(null)
                    setQrError(e.message)
                })
        }
    }, [activeInvoice, currentView, BANK.promptpay])

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

    // ล้างไฟล์สลิปที่เลือก รูปตัวอย่าง และข้อความ error
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
            // ตั้งชื่อไฟล์ในโฟลเดอร์ของผู้ใช้: {userId}/{invoiceId}-{เวลา}.{นามสกุล}
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

            // ส่งสำเร็จ: โหลดข้อมูลใหม่ ล้างไฟล์ แสดงข้อความสำเร็จ และกลับหน้าภาพรวม
            // สั่งตรวจสลิปด้วยระบบ ไม่รอผล (โหมดปิดหรือตรวจไม่ได้ แอดมินยังตรวจด้วยตาได้)
            requestSlipVerify(activeInvoice.id)
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
            repairFee: Number(activeInvoice.repair_fee || 0),
            total: Number(activeInvoice.total || 0),
        }
    }, [activeInvoice])

    // โหลดครั้งแรก: แสดงโครงหน้าแบบกล่องเทากระพริบ
    if (loading && !tenantInfo) {
        return (
            <div className="p-4 sm:p-6 flex flex-col gap-6">
                <div className="flex justify-between items-center animate-pulse">
                    <div className="h-8 bg-line rounded-lg w-48" />
                    <div className="w-10 h-10 bg-line rounded-full" />
                </div>
                <div className="h-36 bg-line rounded-2xl animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="h-32 bg-line rounded-2xl animate-pulse" />
                    <div className="h-32 bg-line rounded-2xl animate-pulse" />
                </div>
            </div>
        )
    }

    // บัญชียังไม่ผูกกับห้อง: แสดงข้อความให้ติดต่อผู้ดูแล
    if (!tenantInfo) {
        return (
            <div className="p-4 sm:p-6 flex flex-col gap-6">
                <PageHeader flush title="ภาพรวม" subtitle="ยินดีต้อนรับเข้าสู่ระบบจัดการห้องพัก" />
                <div className="bg-white rounded-2xl p-12 text-center shadow-card border border-line flex flex-col items-center gap-3">
                    <span className="w-16 h-16 rounded-full bg-sand flex items-center justify-center text-muted">
                        <Icon name="door" className="w-8 h-8" />
                    </span>
                    <h2 className="text-lg font-bold text-ink">ไม่พบข้อมูลห้องพักหรือสัญญาเช่า</h2>
                    <p className="text-sm text-muted max-w-md">
                        บัญชีผู้ใช้นี้ยังไม่ได้ผูกกับห้องพักในระบบ หรือยังไม่มีข้อมูลผู้เช่า กรุณาติดต่อผู้ดูแลหอพัก
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-4 sm:p-6 flex flex-col gap-6">
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
                        {/* ห้อง/ชั้น วันที่วันนี้ คำทักทาย และเบอร์โทร */}
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

                    {/* ค้างชำระหลายใบ: แสดงรายการทั้งหมด เลือกใบที่จะดู/จ่ายได้ (ถ้ามีใบเดียว การ์ดการดำเนินการด้านล่างครอบคลุมแล้ว) */}
                    {unpaid.length > 1 && (
                        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col gap-3">
                            <h3 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                                <Icon name="alert" className="w-4 h-4" />
                                มี {unpaid.length} ใบที่ยังต้องชำระ · รวม {baht(unpaid.reduce((sum, u) => sum + u.balance, 0))}
                            </h3>
                            <div className="flex flex-col divide-y divide-amber-200/70">
                                {unpaid.map((u) => (
                                    <div key={u.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                                        <div>
                                            <span className="font-semibold text-ink">{formatMonth(u.month)}</span>
                                            <span className={`ml-2 text-xs font-medium ${u.daysLate > 0 ? 'text-red-600' : 'text-muted'}`}>
                                                {u.daysLate > 0 ? `เกินกำหนด ${u.daysLate} วัน` : `ครบกำหนด ${formatShortDate(u.dueDate)}`}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold tabular-nums text-ink">{baht(u.balance)}</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedInvoiceId(u.id)
                                                    setCurrentView('payment')
                                                }}
                                                className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-dark text-white text-xs font-semibold transition cursor-pointer"
                                            >
                                                ชำระ
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* ค่าซ่อมที่ยังไม่ได้ชำระ (ไม่แสดงถ้าไม่มี) */}
                    <RepairCostBanner />

                    {/* สัญญาใกล้หมดหรือหมดแล้ว: บอกผู้เช่าให้ติดต่อผู้ดูแล (ต่อสัญญาทำโดยผู้ดูแล) */}
                    {contractRemainingDays !== null && contractRemainingDays <= 30 && (
                        <div role="status" className={`rounded-2xl ring-1 p-4 flex items-start gap-3 text-sm ${contractRemainingDays > 0 ? 'bg-amber-50 ring-amber-200 text-amber-950' : 'bg-red-50 ring-red-200 text-red-950'}`}>
                            <Icon name="calendar" className="w-5 h-5 shrink-0 mt-0.5" />
                            <p>
                                <strong>{contractRemainingDays > 0 ? `สัญญาเช่าของคุณจะสิ้นสุดในอีก ${contractRemainingDays} วัน` : 'สัญญาเช่าของคุณสิ้นสุดแล้ว'}</strong>
                                {' '}({formatShortDate(tenantInfo.end_date)}) หากต้องการต่อสัญญา กรุณาติดต่อผู้ดูแลหอพัก
                            </p>
                        </div>
                    )}

                    {/* ประกาศล่าสุดจากหอพัก (ภายใน 14 วัน) */}
                    <AnnouncementBanner />

                    {/* การ์ดสรุปตัวเลข */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* 1. ยอดเดือนนี้ */}
                        <div className="bg-white rounded-2xl p-6 shadow-card border border-line flex flex-col justify-between">
                            <span className="text-sm font-medium text-muted">ยอดใบแจ้งหนี้</span>
                            <div className="mt-3">
                                <div className="text-3xl sm:text-4xl font-bold text-ink tracking-tight tabular-nums">
                                    {activeInvoice ? baht(activeInvoice.total) : '฿0'}
                                </div>
                                <div className="text-xs text-muted mt-1.5 font-medium">
                                    {activeInvoice ? `เดือน ${formatMonth(activeInvoice.month)}` : 'ไม่มีใบแจ้งหนี้'}
                                </div>
                                {activeInvoice && lateFeeOf(activeInvoice) > 0 && activeInvoice.status !== 'paid' && (
                                    <div className="text-xs text-red-600 mt-1 font-medium">
                                        เกินกำหนด {daysLate(activeInvoice)} วัน · ค่าปรับ {baht(lateFeeOf(activeInvoice))}
                                    </div>
                                )}
                                {activeInvoice && isPartiallyPaid(activeInvoice) && (
                                    <div className="text-xs text-amber-700 mt-1 font-medium">
                                        ชำระแล้ว {baht(paidOf(activeInvoice))} · เหลือ {baht(balanceOf(activeInvoice))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 2. สถานะ */}
                        <div className="bg-white rounded-2xl p-6 shadow-card border border-line flex flex-col justify-between">
                            <span className="text-sm font-medium text-muted">สถานะ</span>
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
                                        <span className="text-muted/70 font-normal">ไม่มีรายการ</span>
                                    )}
                                </div>
                                <div className="text-xs text-muted mt-1.5 font-medium">
                                    {activeInvoice ? (
                                        activeInvoice.status === 'paid' ? (
                                            `ชำระเรียบร้อยเมื่อ ${formatDateTime(activeInvoice.reviewed_at)}`
                                        ) : activeInvoice.status === 'review' ? (
                                            `ส่งสลิปเมื่อ ${formatDateTime(activeInvoice.slip_uploaded_at)} (รอตรวจ)`
                                        ) : (
                                            `ภายในวันที่ ${formatDueDate(activeInvoice, settings.dueDay)}`
                                        )
                                    ) : (
                                        'ทุกรายการชำระครบถ้วนแล้ว'
                                    )}
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

                            {/* มีใบแจ้งหนี้: แสดงรายการทีละแถว / ไม่มี: ข้อความว่าง */}
                            {invoiceBreakdown ? (
                                <div className="flex flex-col divide-y divide-line/70">
                                    {/* ค่าห้อง */}
                                    <div className="py-3.5 flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-3">
                                            <span className="grid place-items-center w-8 h-8 rounded-lg bg-sky-50 text-sky-700">
                                                <Icon name="home" className="w-4 h-4" />
                                            </span>
                                            <span className="text-ink font-medium">ค่าห้อง</span>
                                        </div>
                                        <span className="font-semibold text-ink tabular-nums">
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
                                                <div className="text-ink font-medium">
                                                    ค่าน้ำ {invoiceBreakdown.waterUnits} หน่วย (หน่วยละ {invoiceBreakdown.waterRate} บาท)
                                                </div>
                                                <div className="text-[11px] text-muted/70">
                                                    มิเตอร์: {activeInvoice.water_prev} → {activeInvoice.water_curr}
                                                </div>
                                            </div>
                                        </div>
                                        <span className="font-semibold text-ink tabular-nums">
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
                                                <div className="text-ink font-medium">
                                                    ค่าไฟ {invoiceBreakdown.elecUnits} หน่วย (หน่วยละ {invoiceBreakdown.elecRate} บาท)
                                                </div>
                                                <div className="text-[11px] text-muted/70">
                                                    มิเตอร์: {activeInvoice.elec_prev} → {activeInvoice.elec_curr}
                                                </div>
                                            </div>
                                        </div>
                                        <span className="font-semibold text-ink tabular-nums">
                                            {baht(invoiceBreakdown.elecCost)}
                                        </span>
                                    </div>

                                    {/* ค่าส่วนกลาง */}
                                    <div className="py-3.5 flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-3">
                                            <span className="grid place-items-center w-8 h-8 rounded-lg bg-violet-50 text-violet-700">
                                                <Icon name="building" className="w-4 h-4" />
                                            </span>
                                            <span className="text-ink font-medium">ค่าส่วนกลาง</span>
                                        </div>
                                        <span className="font-semibold text-ink tabular-nums">
                                            {baht(invoiceBreakdown.commonFee)}
                                        </span>
                                    </div>

                                    {/* ค่าซ่อมที่รวมมาในใบนี้ (เฉพาะใบเก่าช่วงที่ค่าซ่อมรวมในใบแจ้งหนี้ ตอนนี้จ่ายแยกแล้ว) */}
                                    {invoiceBreakdown.repairFee > 0 && (
                                        <div className="py-3.5 flex justify-between items-center text-sm">
                                            <div className="flex items-center gap-3">
                                                <span className="grid place-items-center w-8 h-8 rounded-lg bg-rose-50 text-rose-700">
                                                    <Icon name="wrench" className="w-4 h-4" />
                                                </span>
                                                <span className="text-gray-800 font-medium">ค่าซ่อม</span>
                                            </div>
                                            <span className="font-semibold text-gray-900 tabular-nums">
                                                {baht(invoiceBreakdown.repairFee)}
                                            </span>
                                        </div>
                                    )}

                                    {/* รวมทั้งหมด */}
                                    <div className="pt-5 flex justify-between items-center">
                                        <span className="text-base font-bold text-ink">รวมทั้งหมด</span>
                                        <span className="text-2xl font-bold text-primary-dark tabular-nums">
                                            {baht(invoiceBreakdown.total)}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-12 text-center text-muted/70 text-sm">
                                    ยังไม่มีรายการค่าใช้จ่ายในขณะนี้
                                </div>
                            )}
                        </div>

                        {/* ฝั่งขวา: กล่อง Action (ปุ่มชำระเงินตามรูปแรก ที่เมื่อกดแล้วจะเปิดหน้าในรูปที่สอง) */}
                        <div className="lg:col-span-4 flex flex-col gap-5">
                            <div className="bg-white rounded-2xl p-6 shadow-card border border-line flex flex-col gap-4">
                                <h3 className="text-base font-bold text-ink">การดำเนินการ</h3>

                                {/* เนื้อหาตามสถานะ: รอชำระ = ปุ่มไปหน้าชำระเงิน, รอตรวจ = ปุ่มดูรายละเอียด, ชำระแล้ว = ข้อความยืนยัน */}
                                {activeInvoice?.status === 'pending' ? (
                                    <>
                                        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3.5 rounded-xl leading-relaxed">
                                            <span className="font-semibold mb-0.5 flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4" />{isPartiallyPaid(activeInvoice) ? 'ยังมียอดคงเหลือ' : 'มียอดรอชำระเงิน'}</span>
                                            {isPartiallyPaid(activeInvoice)
                                                ? `ได้รับชำระแล้ว ${baht(paidOf(activeInvoice))} กรุณาโอนส่วนที่เหลือ ${baht(balanceOf(activeInvoice))} และแนบหลักฐานการโอน`
                                                : `กรุณาชำระเงินและแนบหลักฐานการโอนภายในวันที่ ${formatDueDate(activeInvoice, settings.dueDay)}`}
                                            {lateFeeNotice(activeInvoice) && <span className="block mt-1 font-semibold">{lateFeeNotice(activeInvoice)}</span>}
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
                                    <p className="text-xs text-muted">ไม่มีรายการที่ต้องดำเนินการ</p>
                                )}

                                {/* ปุ่มดาวน์โหลดใบแจ้งหนี้ PDF */}
                                {activeInvoice && (
                                    <DownloadInvoiceButton invoice={activeInvoice} className="w-full border border-line bg-sand/30 hover:bg-mist/40 text-primary-dark font-medium py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition cursor-pointer" />
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ---------------- VIEW 2: PAYMENT SCREEN (หน้าชำระเงินตามรูปที่สอง) ---------------- */}
            {currentView === 'payment' && (
                <>
                    {/* หัวหน้าเดียวกับหน้าอื่น พร้อมปุ่มกลับภาพรวม */}
                    <PageHeader flush title="ชำระเงิน" subtitle="สแกน QR หรือโอนตามยอด แล้วแนบสลิปเพื่อให้ผู้ดูแลตรวจสอบ" onBack={() => setCurrentView('overview')} backLabel="กลับไปภาพรวม" />

                    {/* การ์ดสรุปยอดที่ต้องชำระ (ตามส่วนบนของรูปที่สอง) */}
                    <div className="bg-white rounded-2xl p-6 md:p-8 shadow-card border border-line text-center flex flex-col items-center justify-center">
                        <span className="text-xs md:text-sm text-muted font-medium">
                            ยอดที่ต้องชำระ · ประจำเดือน {activeInvoice ? formatMonth(activeInvoice.month) : '-'} (ห้อง {tenantInfo?.room})
                        </span>
                        <div className="text-3xl sm:text-5xl font-extrabold text-ink mt-2 tracking-tight tabular-nums">
                            {activeInvoice ? baht(balanceOf(activeInvoice)) : '฿0'}
                        </div>
                        {activeInvoice && lateFeeOf(activeInvoice) > 0 && activeInvoice.status !== 'paid' && (
                            <span className="text-xs md:text-sm text-red-600 font-medium mt-1">
                                รวมค่าปรับล่าช้า {baht(lateFeeOf(activeInvoice))} (เกินกำหนด {daysLate(activeInvoice)} วัน)
                            </span>
                        )}
                        {activeInvoice && isPartiallyPaid(activeInvoice) && (
                            <span className="text-xs md:text-sm text-amber-700 font-medium mt-1">
                                ยอดบิล {baht(activeInvoice.total)} · ชำระแล้ว {baht(paidOf(activeInvoice))}
                            </span>
                        )}
                        <span className="text-xs md:text-sm text-red-600 font-semibold mt-2">
                            ภายในวันที่ {activeInvoice ? formatDueDate(activeInvoice, settings.dueDay) : '-'}
                        </span>
                        {lateFeeNotice(activeInvoice) && <span className="text-xs text-red-600 mt-1">{lateFeeNotice(activeInvoice)}</span>}
                    </div>

                    {/* กล่องการชำระเงินและแนบสลิป (Desktop 2 คอลัมน์) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* ฝั่งซ้าย: สแกน QR PromptPay และข้อมูลบัญชีธนาคาร (ตามรูปที่สอง) */}
                        <div className="lg:col-span-6 bg-white rounded-2xl p-6 md:p-8 shadow-card border border-line flex flex-col items-center text-center gap-5">
                            <h3 className="text-lg font-bold text-ink">
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
                                ) : qrError ? (
                                    <div className="w-56 h-56 flex items-center justify-center text-center text-red-600 text-xs px-4">
                                        {BANK.promptpay
                                            ? 'ยังสร้าง QR ไม่ได้ เพราะรหัสพร้อมเพย์ของหอพักไม่ถูกต้อง กรุณาติดต่อผู้ดูแลหอพัก หรือโอนเข้าบัญชีธนาคารแทน'
                                            : 'ผู้ดูแลหอพักยังไม่ได้ตั้งค่าช่องทางรับชำระเงิน กรุณาติดต่อผู้ดูแลหอพักก่อนโอนเงิน'}
                                    </div>
                                ) : (
                                    <div className="w-56 h-56 flex items-center justify-center text-muted text-xs">
                                        กำลังสร้าง QR Code...
                                    </div>
                                )}
                            </div>

                            {/* เลขพร้อมเพย์ */}
                            {BANK.promptpay && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-ink">
                                        พร้อมเพย์ {BANK.promptpay}
                                    </span>
                                    <CopyBtn text={BANK.promptpay.replace(/-/g, '')} label="คัดลอก" />
                                </div>
                            )}

                            {/* บัญชีธนาคารเพิ่มเติม */}
                            {BANK.account && (
                                <div className="w-full pt-4 border-t border-line text-xs text-muted flex flex-col gap-1.5 text-left bg-sand/30 p-3.5 rounded-xl">
                                    <span className="font-bold text-primary-dark">หรือโอนเข้าบัญชีธนาคาร:</span>
                                    <div className="flex justify-between items-center">
                                        <span>ธนาคาร: <strong className="text-ink">{BANK.name}</strong></span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span>เลขที่บัญชี: <strong className="font-mono text-ink">{BANK.account}</strong></span>
                                        <CopyBtn text={BANK.account.replace(/-/g, '')} label="คัดลอก" />
                                    </div>
                                    <div>
                                        <span>ชื่อบัญชี: <strong className="text-ink">{BANK.holder}</strong></span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ฝั่งขวา: แนบสลิปโอนเงิน + ปุ่มส่งหลักฐาน + ปุ่มดาวน์โหลด PDF (ตามรูปที่สอง) */}
                        <div className="lg:col-span-6 bg-white rounded-2xl p-6 md:p-8 shadow-card border border-line flex flex-col gap-5">
                            <div className="text-center">
                                <span className="text-xs font-semibold text-muted/70 tracking-wider">
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
                                        <span className="truncate max-w-48 font-medium text-ink">
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
                                        <div className="font-semibold text-ink text-sm sm:text-base">
                                            แตะเพื่อแนบรูปสลิป
                                        </div>
                                        <div className="text-xs text-muted mt-1">
                                            คลิกเพื่อเลือกไฟล์ หรือลากรูปมาวางที่นี่
                                        </div>
                                    </div>
                                    <span className="text-[11px] text-muted/70">
                                        JPG / PNG ไม่เกิน 5MB
                                    </span>
                                </div>
                            )}

                            {/* ข้อความ error ของการแนบ/ส่งสลิป */}
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
                            <DownloadInvoiceButton invoice={activeInvoice} className="w-full border border-line bg-white hover:bg-sand/60 text-primary-dark py-3 rounded-xl font-medium shadow-2xs flex items-center justify-center gap-2 transition cursor-pointer text-sm" />
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default UserDashboardPage