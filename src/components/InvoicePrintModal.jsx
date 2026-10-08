import Icon from './Icon'
import { BANK } from '../data/billing'
import { baht, formatDateTime, formatMonth } from '../lib/billing'

// แปลงตัวเลขเป็นข้อความบาทภาษาไทย
function thaiBahtText(num) {
    if (!num || isNaN(num)) return 'ศูนย์บาทถ้วน'
    const numbers = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
    const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']
    const [intPart, decPart = ''] = Number(num).toFixed(2).split('.')

    function readSection(str) {
        let result = ''
        const len = str.length
        for (let i = 0; i < len; i++) {
            const digit = Number(str[i])
            const pos = len - i - 1
            if (digit === 0) continue
            if (pos === 0 && digit === 1 && len > 1) {
                result += 'เอ็ด'
            } else if (pos === 1 && digit === 2) {
                result += 'ยี่สิบ'
            } else if (pos === 1 && digit === 1) {
                result += 'สิบ'
            } else {
                result += numbers[digit] + positions[pos]
            }
        }
        return result
    }

    let result = readSection(intPart) + 'บาท'
    if (!decPart || decPart === '00') {
        result += 'ถ้วน'
    } else {
        result += readSection(decPart) + 'สตางค์'
    }
    return result
}

function InvoicePrintModal({ invoice, tenant, roomFloor, onClose }) {
    if (!invoice) return null

    const waterUnits = Math.max(0, (invoice.water_curr || 0) - (invoice.water_prev || 0))
    const elecUnits = Math.max(0, (invoice.elec_curr || 0) - (invoice.elec_prev || 0))
    const waterCost = waterUnits * Number(invoice.water_rate || 0)
    const elecCost = elecUnits * Number(invoice.elec_rate || 0)

    // วันครบกำหนดชำระ (วันที่ 5 ของเดือนถัดไป)
    const [y, m] = invoice.month.split('-').map(Number)
    const dueDate = new Date(y, m, 5).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
    const issueDate = invoice.created_at
        ? new Date(invoice.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
        : new Date(`${invoice.month}-01`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

    const invCode = `INV-${invoice.room}-${invoice.month.replace('-', '')}`

    const handlePrint = () => {
        window.print()
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            {/* Modal Container */}
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto border border-line">
                {/* Modal Toolbar (ซ่อนตอน Print) */}
                <div className="p-4 bg-sand/40 border-b border-line flex items-center justify-between print:hidden">
                    <div className="flex items-center gap-2 text-primary-dark font-medium">
                        <Icon name="fileText" className="w-5 h-5 text-primary" />
                        <span>ตัวอย่างใบแจ้งหนี้ PDF ({invCode})</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-xl shadow-card transition"
                        >
                            <Icon name="printer" className="w-4 h-4" />
                            พิมพ์ / บันทึก PDF
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-2 text-sm text-gray-600 hover:bg-line/50 rounded-xl transition"
                        >
                            ปิด
                        </button>
                    </div>
                </div>

                {/* Printable Invoice Area */}
                <div id="printable-invoice" className="p-8 sm:p-12 text-ink bg-white flex flex-col gap-6">
                    {/* Header */}
                    <div className="flex justify-between items-start border-b-2 border-primary pb-6 gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="grid place-items-center w-10 h-10 rounded-xl bg-primary text-white text-xl font-bold">
                                    🏢
                                </span>
                                <div>
                                    <h1 className="text-xl sm:text-2xl font-bold text-primary-dark tracking-tight">
                                        หอพักสุขสันต์
                                    </h1>
                                    <p className="text-xs text-muted">Suksan Apartment</p>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                                99/1 ซอยรื่นรมย์ ถ.ประชาอุทิศ แขวงบางมด เขตทุ่งครุ กรุงเทพฯ 10140<br />
                                โทรศัพท์: {BANK.promptpay} · อีเมล: contact@suksan-apartment.com
                            </p>
                        </div>

                        <div className="text-right">
                            <span className="inline-block px-3 py-1 bg-primary/10 text-primary-dark rounded-lg text-xs font-bold uppercase tracking-wider">
                                ใบแจ้งหนี้ / Invoice
                            </span>
                            <div className="text-sm font-bold text-gray-900 mt-2">
                                เลขที่: <span className="font-mono text-primary">{invCode}</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                                วันที่ออก: {issueDate}
                            </div>
                            <div className="text-xs font-semibold text-red-600 mt-0.5">
                                ครบกำหนดชำระ: {dueDate}
                            </div>
                        </div>
                    </div>

                    {/* Tenant & Room Details */}
                    <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-sand/30 border border-line text-sm">
                        <div>
                            <span className="text-xs text-muted block mb-1">ข้อมูลผู้เช่า</span>
                            <div className="font-bold text-gray-900">{invoice.tenant_name || tenant?.name || '-'}</div>
                            <div className="text-xs text-gray-600 mt-0.5">เบอร์โทรศัพท์: {tenant?.phone || '-'}</div>
                        </div>
                        <div className="text-right">
                            <span className="text-xs text-muted block mb-1">รายละเอียดห้องพัก</span>
                            <div className="font-bold text-primary-dark">
                                ห้อง {invoice.room} {roomFloor ? `(ชั้น ${roomFloor})` : ''}
                            </div>
                            <div className="text-xs text-gray-600 mt-0.5">
                                ประจำงวดเดือน: <span className="font-medium text-gray-900">{formatMonth(invoice.month)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Breakdown Table */}
                    <div className="border border-line rounded-xl overflow-hidden">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="bg-sand/60 border-b border-line text-xs text-gray-600">
                                    <th className="py-3 px-4 font-semibold text-center w-12">ลำดับ</th>
                                    <th className="py-3 px-4 font-semibold">รายการค่าใช้จ่าย</th>
                                    <th className="py-3 px-4 font-semibold text-center">มิเตอร์เดิม</th>
                                    <th className="py-3 px-4 font-semibold text-center">มิเตอร์ใหม่</th>
                                    <th className="py-3 px-4 font-semibold text-center">หน่วยที่ใช้</th>
                                    <th className="py-3 px-4 font-semibold text-right">ราคา/หน่วย</th>
                                    <th className="py-3 px-4 font-semibold text-right w-28">จำนวนเงิน</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-xs sm:text-sm">
                                <tr>
                                    <td className="py-3 px-4 text-center text-gray-400">1</td>
                                    <td className="py-3 px-4 font-medium text-gray-800">ค่าเช่าห้องพักประจำเดือน</td>
                                    <td className="py-3 px-4 text-center text-gray-400">-</td>
                                    <td className="py-3 px-4 text-center text-gray-400">-</td>
                                    <td className="py-3 px-4 text-center text-gray-400">1 งวด</td>
                                    <td className="py-3 px-4 text-right tabular-nums">{baht(invoice.rent)}</td>
                                    <td className="py-3 px-4 text-right font-medium tabular-nums">{baht(invoice.rent)}</td>
                                </tr>
                                <tr>
                                    <td className="py-3 px-4 text-center text-gray-400">2</td>
                                    <td className="py-3 px-4 font-medium text-gray-800">ค่าน้ำประปา</td>
                                    <td className="py-3 px-4 text-center text-gray-600 tabular-nums">{invoice.water_prev}</td>
                                    <td className="py-3 px-4 text-center text-gray-600 tabular-nums">{invoice.water_curr}</td>
                                    <td className="py-3 px-4 text-center font-medium text-gray-800 tabular-nums">{waterUnits}</td>
                                    <td className="py-3 px-4 text-right tabular-nums">{baht(invoice.water_rate)}</td>
                                    <td className="py-3 px-4 text-right font-medium tabular-nums">{baht(waterCost)}</td>
                                </tr>
                                <tr>
                                    <td className="py-3 px-4 text-center text-gray-400">3</td>
                                    <td className="py-3 px-4 font-medium text-gray-800">ค่าไฟฟ้า</td>
                                    <td className="py-3 px-4 text-center text-gray-600 tabular-nums">{invoice.elec_prev}</td>
                                    <td className="py-3 px-4 text-center text-gray-600 tabular-nums">{invoice.elec_curr}</td>
                                    <td className="py-3 px-4 text-center font-medium text-gray-800 tabular-nums">{elecUnits}</td>
                                    <td className="py-3 px-4 text-right tabular-nums">{baht(invoice.elec_rate)}</td>
                                    <td className="py-3 px-4 text-right font-medium tabular-nums">{baht(elecCost)}</td>
                                </tr>
                                {Number(invoice.common_fee || 0) > 0 && (
                                    <tr>
                                        <td className="py-3 px-4 text-center text-gray-400">4</td>
                                        <td className="py-3 px-4 font-medium text-gray-800">ค่าบริการส่วนกลาง</td>
                                        <td className="py-3 px-4 text-center text-gray-400">-</td>
                                        <td className="py-3 px-4 text-center text-gray-400">-</td>
                                        <td className="py-3 px-4 text-center text-gray-400">1 งวด</td>
                                        <td className="py-3 px-4 text-right tabular-nums">{baht(invoice.common_fee)}</td>
                                        <td className="py-3 px-4 text-right font-medium tabular-nums">{baht(invoice.common_fee)}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Total Summary */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-sand/40 border border-line p-4 rounded-xl">
                        <div className="text-xs text-gray-600">
                            จำนวนเงินตัวอักษร: <span className="font-bold text-gray-900">({thaiBahtText(invoice.total)})</span>
                        </div>
                        <div className="flex items-baseline gap-3 self-end sm:self-auto">
                            <span className="text-sm font-semibold text-gray-600">ยอดรวมสุทธิ:</span>
                            <span className="text-2xl font-bold text-primary-dark tabular-nums">{baht(invoice.total)}</span>
                        </div>
                    </div>

                    {/* Payment Info & Signature Footer */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-line text-xs">
                        <div className="flex flex-col gap-1.5 p-3.5 rounded-xl border border-line bg-white">
                            <span className="font-bold text-primary-dark">ช่องทางการชำระเงิน</span>
                            <p className="text-gray-600">
                                ธนาคาร: <span className="font-medium text-gray-900">{BANK.name}</span><br />
                                เลขที่บัญชี: <span className="font-mono font-medium text-gray-900">{BANK.account}</span><br />
                                ชื่อบัญชี: <span className="font-medium text-gray-900">{BANK.holder}</span><br />
                                พร้อมเพย์: <span className="font-mono font-medium text-gray-900">{BANK.promptpay}</span>
                            </p>
                            <span className="text-[11px] text-muted mt-1">
                                * หลังโอนเงิน กรุณาแนบสลิปผ่านระบบผู้เช่าเพื่อยืนยันยอด
                            </span>
                        </div>

                        <div className="flex flex-col justify-end items-center sm:items-end text-center pt-4">
                            <div className="w-48 border-b border-gray-400 pb-1 text-center">
                                <span className="text-gray-400 text-[11px]">( ลงชื่อผู้ดูแล / ผู้จัดการ )</span>
                            </div>
                            <span className="text-[11px] text-gray-500 mt-1">
                                หอพักสุขสันต์
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default InvoicePrintModal
