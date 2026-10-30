import { useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Icon from '../components/Icon'
import InvoiceActionCard from '../components/InvoiceActionCard'
import InvoiceBreakdown from '../components/InvoiceBreakdown'
import InvoiceSummaryCards from '../components/InvoiceSummaryCards'
import PaymentAmountCard from '../components/PaymentAmountCard'
import PaymentQrCard from '../components/PaymentQrCard'
import { RepairCostBanner } from '../components/RepairPayment'
import SlipUploadCard from '../components/SlipUploadCard'
import UnpaidInvoicesAlert from '../components/UnpaidInvoicesAlert'
import WelcomeBanner from '../components/WelcomeBanner'
import { formatShortDate } from '../lib/billing'
import { tenantUnpaid } from '../lib/dashboard'
import { useRealtimeReload } from '../lib/realtime'
import { supabase } from '../lib/supabaseClient'
import { lateFeeNotice } from '../lib/tenantDashboard'
import { contractStatus } from '../lib/tenants'
import { useCurrentUser } from '../lib/useCurrentUser'
import { usePromptPayQr } from '../lib/usePromptPayQr'
import { useSettings } from '../lib/useSettings'
import { useSlipUpload } from '../lib/useSlipUpload'

// หน้าแรกของผู้เช่า: ภาพรวมห้องและค่าใช้จ่ายเดือนนี้ และหน้าชำระเงินด้วย QR พร้อมเพย์/แนบสลิป
// หน้านี้ถือข้อมูลและสลับมุมมอง ส่วนที่แสดงผลแยกอยู่ใน components (WelcomeBanner, InvoiceBreakdown, PaymentQrCard, SlipUploadCard ฯลฯ)
function UserDashboardPage() {
    const me = useCurrentUser()

    // มุมมอง: 'overview' (หน้าแรกของ Dashboard) หรือ 'payment' (หน้าชำระเงิน)
    const [currentView, setCurrentView] = useState('overview')

    // สถานะโหลดและ error
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')

    // ข้อมูลจริงจากฐานข้อมูล
    const [tenantInfo, setTenantInfo] = useState(null)
    const [roomInfo, setRoomInfo] = useState(null)
    const [invoices, setInvoices] = useState([])
    const [selectedInvoiceId, setSelectedInvoiceId] = useState(null)

    // บัญชีรับชำระ/พร้อมเพย์ มาจากหน้า "ตั้งค่า" ของผู้ดูแล
    const settings = useSettings()
    const BANK = { name: settings.bankName, account: settings.bankAccount, holder: settings.bankHolder, promptpay: settings.promptpayId }

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

    // ใบแจ้งหนี้ที่กำลังแสดงผล
    const activeInvoice = useMemo(() => {
        if (!selectedInvoiceId) return invoices[0] || null
        return invoices.find((i) => i.id === selectedInvoiceId) || invoices[0] || null
    }, [invoices, selectedInvoiceId])
    const lateNotice = lateFeeNotice(activeInvoice, settings)

    // QR พร้อมเพย์ตามยอดค้าง (สร้างเมื่ออยู่หน้าชำระเงิน)
    const { qrCodeUrl, qrError } = usePromptPayQr(BANK.promptpay, activeInvoice, currentView === 'payment')

    // แนบและส่งสลิป: ส่งสำเร็จแล้วโหลดข้อมูลใหม่และกลับหน้าภาพรวม
    const upload = useSlipUpload({
        userId: me?.id,
        invoice: activeInvoice,
        reload: loadData,
        onDone: () => setCurrentView('overview'),
    })

    // คำนวณวันหมดสัญญา
    // ใช้ฟังก์ชันเดียวกับหน้าอื่น (อ่านวันที่เป็นเวลาท้องถิ่นทั้งสองฝั่ง ไม่เลื่อนวันตามเขตเวลา)
    const contractRemainingDays = useMemo(() => (tenantInfo?.end_date ? contractStatus(tenantInfo.end_date).days : null), [tenantInfo])

    // กด "ชำระ" ของใบที่เลือก: ไปหน้าชำระเงิน
    const payInvoice = (id) => {
        setSelectedInvoiceId(id)
        setCurrentView('payment')
    }

    // โหลดครั้งแรก: แสดงโครงหน้าแบบกล่องเทากระพริบ
    if (loading && !tenantInfo) {
        return (
            <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
                <div className="flex justify-between items-center animate-pulse">
                    <div className="h-8 bg-line rounded-lg w-48" />
                    <div className="w-10 h-10 bg-line rounded-full" />
                </div>
                <div className="h-36 bg-line rounded-2xl animate-pulse" />
                <div className="grid grid-cols-2 gap-3 sm:gap-5">
                    <div className="h-32 bg-line rounded-2xl animate-pulse" />
                    <div className="h-32 bg-line rounded-2xl animate-pulse" />
                </div>
            </div>
        )
    }

    // บัญชียังไม่ผูกกับห้อง: แสดงข้อความให้ติดต่อผู้ดูแล
    if (!tenantInfo) {
        return (
            <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
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
        <div className="p-4 sm:p-6 flex flex-col gap-4 sm:gap-6">
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

            {/* ---------------- มุมมองภาพรวม: สรุปบิล ---------------- */}
            {currentView === 'overview' && (
                <>
                    <PageHeader flush title="ภาพรวม" subtitle="ภาพรวมข้อมูลห้องพักและค่าใช้จ่ายประจำเดือน" />

                    {/* แจ้งเตือนเมื่อส่งสลิปสำเร็จ */}
                    {upload.success && (
                        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm flex items-center justify-between shadow-xs">
                            <div className="flex items-center gap-2.5">
                                <Icon name="checkCircle" className="w-5 h-5 text-emerald-600 shrink-0" />
                                <span className="font-medium">
                                    ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว! สถานะเปลี่ยนเป็น &quot;รอตรวจสอบ&quot;
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => upload.setSuccess(false)}
                                className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold cursor-pointer"
                            >
                                ปิด
                            </button>
                        </div>
                    )}

                    <WelcomeBanner tenant={tenantInfo} room={roomInfo} remainingDays={contractRemainingDays} />

                    <UnpaidInvoicesAlert unpaid={unpaid} onPay={payInvoice} />

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

                    <InvoiceSummaryCards invoice={activeInvoice} dueDay={settings.dueDay} />

                    {/* ส่วนเนื้อหาหลัก: รายการค่าใช้จ่าย + กล่องการดำเนินการ (Desktop 2 คอลัมน์) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
                        <InvoiceBreakdown invoice={activeInvoice} />
                        <InvoiceActionCard invoice={activeInvoice} dueDay={settings.dueDay} lateNotice={lateNotice} onPay={() => setCurrentView('payment')} />
                    </div>
                </>
            )}

            {/* ---------------- มุมมองชำระเงิน: QR พร้อมเพย์และแนบสลิป ---------------- */}
            {currentView === 'payment' && (
                <>
                    {/* หัวหน้าเดียวกับหน้าอื่น พร้อมปุ่มกลับภาพรวม */}
                    <PageHeader flush title="ชำระเงิน" subtitle="สแกน QR หรือโอนตามยอด แล้วแนบสลิปเพื่อให้ผู้ดูแลตรวจสอบ" onBack={() => setCurrentView('overview')} backLabel="กลับไปภาพรวม" />

                    <PaymentAmountCard invoice={activeInvoice} room={tenantInfo?.room} dueDay={settings.dueDay} lateNotice={lateNotice} />

                    {/* กล่องการชำระเงินและแนบสลิป (Desktop 2 คอลัมน์) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
                        <PaymentQrCard qrCodeUrl={qrCodeUrl} qrError={qrError} bank={BANK} />
                        <SlipUploadCard invoice={activeInvoice} upload={upload} />
                    </div>
                </>
            )}
        </div>
    )
}

export default UserDashboardPage
