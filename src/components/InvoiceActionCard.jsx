import { balanceOf, baht, formatDateTime, isPartiallyPaid, paidOf } from '../lib/billing'
import { formatDueDate } from '../lib/tenantDashboard'
import DownloadInvoiceButton from './DownloadInvoiceButton'
import Icon from './Icon'

// กล่อง "การดำเนินการ" ของใบแจ้งหนี้ที่กำลังดู (หน้าภาพรวมผู้เช่า)
// รอชำระ = ปุ่มไปหน้าชำระเงิน, รอตรวจ = ปุ่มดูรายละเอียด, ชำระแล้ว = ข้อความยืนยัน
// lateNotice = ข้อความเตือนค่าปรับ (ว่างได้) onPay = ไปหน้าชำระเงิน
function InvoiceActionCard({ invoice, dueDay, lateNotice, onPay }) {
    return (
        <div className="lg:col-span-4 flex flex-col gap-5">
            <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-card border border-line flex flex-col gap-3 sm:gap-4">
                <h3 className="hidden sm:block text-base font-bold text-ink">การดำเนินการ</h3>

                {invoice?.status === 'pending' ? (
                    <>
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3.5 rounded-xl leading-relaxed">
                            <span className="font-semibold mb-0.5 flex items-center gap-1.5"><Icon name="alert" className="w-4 h-4" />{isPartiallyPaid(invoice) ? 'ยังมียอดคงเหลือ' : 'มียอดรอชำระเงิน'}</span>
                            {isPartiallyPaid(invoice)
                                ? `ได้รับชำระแล้ว ${baht(paidOf(invoice))} กรุณาโอนส่วนที่เหลือ ${baht(balanceOf(invoice))} และแนบหลักฐานการโอน`
                                : `กรุณาชำระเงินและแนบหลักฐานการโอนภายในวันที่ ${formatDueDate(invoice, dueDay)}`}
                            {lateNotice && <span className="block mt-1 font-semibold">{lateNotice}</span>}
                        </div>

                        {/* ปุ่มชำระเงิน / อัปโหลดสลิป เมื่อกดจะเปิดหน้าชำระเงิน */}
                        <button
                            type="button"
                            onClick={onPay}
                            className="w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3.5 px-4 rounded-xl shadow-card flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                            <Icon name="creditCard" className="w-5 h-5" />
                            <span>ชำระเงิน / อัปโหลดสลิป</span>
                        </button>
                    </>
                ) : invoice?.status === 'review' ? (
                    <>
                        <div className="bg-sky-50 border border-sky-200 text-sky-800 text-xs p-3.5 rounded-xl leading-relaxed">
                            <span className="font-semibold block mb-0.5">⏳ รอตรวจสอบสลิป</span>
                            ท่านได้แนบหลักฐานการโอนเงินแล้วเมื่อ {formatDateTime(invoice.slip_uploaded_at)} ผู้ดูแลระบบกำลังตรวจสอบ
                        </div>

                        <button
                            type="button"
                            onClick={onPay}
                            className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 px-4 rounded-xl shadow-card flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                            <Icon name="review" className="w-4 h-4" />
                            <span>ดูรายละเอียดการชำระเงิน</span>
                        </button>
                    </>
                ) : invoice?.status === 'paid' ? (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-xl leading-relaxed">
                        <span className="font-semibold mb-0.5 flex items-center gap-1.5"><Icon name="checkCircle" className="w-4 h-4" />ชำระเงินเรียบร้อยแล้ว</span>
                        ยอดของเดือนนี้ได้รับการตรวจสอบและยืนยันการชำระเงินแล้ว
                    </div>
                ) : (
                    <p className="text-xs text-muted">ไม่มีรายการที่ต้องดำเนินการ</p>
                )}

                {/* ปุ่มดาวน์โหลดใบแจ้งหนี้ PDF */}
                {invoice && (
                    <DownloadInvoiceButton invoice={invoice} className="w-full border border-line bg-sand/30 hover:bg-mist/40 text-primary-dark font-medium py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition cursor-pointer" />
                )}
            </div>
        </div>
    )
}

export default InvoiceActionCard
