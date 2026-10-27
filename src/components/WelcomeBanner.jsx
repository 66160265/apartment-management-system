// การ์ดต้อนรับของผู้เช่า: ห้อง/ชั้น วันที่วันนี้ คำทักทาย เบอร์โทร และสถานะสัญญาเช่า (หน้าภาพรวมผู้เช่า)
// remainingDays = จำนวนวันที่เหลือของสัญญา (null = ไม่ระบุวันสิ้นสุด)

// วันที่ปัจจุบันในรูปแบบภาษาไทย (เช่น "วันที่ 8 ต.ค. 69")
const formatThaiToday = () => {
    const now = new Date()
    return `วันที่ ${now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}`
}

// สีป้ายจำนวนวันที่เหลือ: เกิน 30 วัน เขียว / ภายใน 30 วัน เหลือง / หมดแล้ว แดง
const remainingTone = (days) =>
    days > 30 ? 'bg-emerald-500/20 text-emerald-200' : days > 0 ? 'bg-amber-500/20 text-amber-200' : 'bg-red-500/20 text-red-200'

const remainingLabel = (days) => (days > 0 ? `เหลือ ${days} วัน` : 'หมดสัญญาแล้ว')

function WelcomeBanner({ tenant, room, remainingDays }) {
    // ข้อความวันสิ้นสุดสัญญา
    const endText = tenant?.end_date
        ? `สัญญาถึง ${new Date(tenant.end_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}`
        : 'ไม่ได้ระบุวันสิ้นสุดสัญญา'

    return (
        <div className="bg-linear-to-r from-primary-dark via-primary to-primary-deep text-white rounded-2xl p-4 md:p-8 shadow-card flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6">
            {/* ห้อง/ชั้น วันที่วันนี้ คำทักทาย และเบอร์โทร */}
            <div className="flex flex-col gap-1.5 md:gap-2">
                <div className="flex items-center gap-2 text-xs md:text-sm text-mist font-medium">
                    <span className="bg-white/15 px-2.5 md:px-3 py-0.5 md:py-1 rounded-full backdrop-blur-xs">
                        ห้อง {tenant?.room || '-'} - ชั้น {room?.floor || '1'}
                    </span>
                    <span>·</span>
                    <span>{formatThaiToday()}</span>
                </div>
                <h2 className="text-xl md:text-3xl font-bold tracking-tight">
                    สวัสดี, คุณ{tenant?.name || 'ผู้เช่า'}
                </h2>
                <p className="hidden md:block text-sm text-white/80">
                    เบอร์โทรติดต่อ: {tenant?.phone || '-'}
                </p>
                {/* จอเล็ก: สัญญาเช่าเป็นบรรทัดเดียวแทนกล่อง (ประหยัดพื้นที่) */}
                <p className="md:hidden flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/85">
                    <span>{endText}</span>
                    {remainingDays !== null && (
                        <span className={`px-2 py-0.5 rounded-full font-bold ${remainingTone(remainingDays)}`}>
                            {remainingLabel(remainingDays)}
                        </span>
                    )}
                </p>
            </div>

            {/* กล่องข้อมูลสัญญาเช่า (จอ md ขึ้นไป) */}
            <div className="hidden md:flex bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 flex-col gap-1.5 md:min-w-56">
                <div className="text-xs text-mist font-medium flex items-center justify-between">
                    <span>สัญญาเช่า</span>
                    {remainingDays !== null && (
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${remainingTone(remainingDays)}`}>
                            {remainingLabel(remainingDays)}
                        </span>
                    )}
                </div>
                <div className="text-base font-semibold">{endText}</div>
            </div>
        </div>
    )
}

export default WelcomeBanner
