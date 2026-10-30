import { baht, formatMonth } from '../lib/billing'
import { invoiceBreakdownOf } from '../lib/tenantDashboard'
import Icon from './Icon'

// แถวหนึ่งรายการค่าใช้จ่าย: ไอคอนสี ชื่อรายการ (และบรรทัดรองถ้ามี) และยอดทางขวา
function CostRow({ icon, tone, label, sub, amount }) {
    return (
        <div className="py-2.5 sm:py-3.5 flex justify-between items-center gap-3 text-sm">
            <div className="flex items-center gap-3">
                <span className={`grid place-items-center w-8 h-8 rounded-lg ${tone}`}>
                    <Icon name={icon} className="w-4 h-4" />
                </span>
                {sub ? (
                    <div>
                        <div className="text-ink font-medium">{label}</div>
                        <div className="text-[11px] text-muted/70">{sub}</div>
                    </div>
                ) : (
                    <span className="text-ink font-medium">{label}</span>
                )}
            </div>
            <span className="font-semibold text-ink tabular-nums">{baht(amount)}</span>
        </div>
    )
}

// การ์ดรายการค่าใช้จ่ายของใบแจ้งหนี้ที่กำลังดู: ค่าห้อง ค่าน้ำ ค่าไฟ ค่าส่วนกลาง และรวมทั้งหมด (หน้าภาพรวมผู้เช่า)
function InvoiceBreakdown({ invoice }) {
    const b = invoiceBreakdownOf(invoice)

    return (
        <div className="lg:col-span-8 bg-white rounded-2xl p-4 sm:p-6 md:p-8 shadow-card border border-line flex flex-col gap-3 sm:gap-5">
            <div className="flex justify-between items-center border-b border-line pb-3 sm:pb-4">
                <h3 className="text-lg font-bold text-primary-dark">รายการค่าใช้จ่าย</h3>
                {invoice && (
                    <span className="bg-mist/40 text-primary-dark font-semibold text-xs px-3 py-1 rounded-full">
                        {formatMonth(invoice.month)}
                    </span>
                )}
            </div>

            {/* มีใบแจ้งหนี้: แสดงรายการทีละแถว / ไม่มี: ข้อความว่าง */}
            {b ? (
                <div className="flex flex-col divide-y divide-line/70">
                    <CostRow icon="home" tone="bg-sky-50 text-sky-700" label="ค่าห้อง" amount={b.rent} />
                    <CostRow
                        icon="droplet"
                        tone="bg-cyan-50 text-cyan-700"
                        label={`ค่าน้ำ ${b.waterUnits} หน่วย (หน่วยละ ${b.waterRate} บาท)`}
                        sub={`มิเตอร์: ${invoice.water_prev} → ${invoice.water_curr}`}
                        amount={b.waterCost}
                    />
                    <CostRow
                        icon="bolt"
                        tone="bg-amber-50 text-amber-700"
                        label={`ค่าไฟ ${b.elecUnits} หน่วย (หน่วยละ ${b.elecRate} บาท)`}
                        sub={`มิเตอร์: ${invoice.elec_prev} → ${invoice.elec_curr}`}
                        amount={b.elecCost}
                    />
                    <CostRow icon="building" tone="bg-violet-50 text-violet-700" label="ค่าส่วนกลาง" amount={b.commonFee} />

                    {/* รวมทั้งหมด */}
                    <div className="pt-3 sm:pt-5 flex justify-between items-center">
                        <span className="text-base font-bold text-ink">รวมทั้งหมด</span>
                        <span className="text-xl sm:text-2xl font-bold text-primary-dark tabular-nums">{baht(b.total)}</span>
                    </div>
                </div>
            ) : (
                <div className="py-12 text-center text-muted/70 text-sm">
                    ยังไม่มีรายการค่าใช้จ่ายในขณะนี้
                </div>
            )}
        </div>
    )
}

export default InvoiceBreakdown
