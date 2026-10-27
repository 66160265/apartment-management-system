import CopyButton from './CopyButton'

// สแกน QR PromptPay และข้อมูลบัญชีธนาคาร ฝั่งซ้ายของหน้าชำระเงินของผู้เช่า
// bank = { name, account, holder, promptpay } จากหน้าตั้งค่า
function PaymentQrCard({ qrCodeUrl, qrError, bank }) {
    return (
        <div className="lg:col-span-6 bg-white rounded-2xl p-4 sm:p-6 md:p-8 shadow-card border border-line flex flex-col items-center text-center gap-5">
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
                        {bank.promptpay
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
            {bank.promptpay && (
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">
                        พร้อมเพย์ {bank.promptpay}
                    </span>
                    <CopyButton text={bank.promptpay.replace(/-/g, '')} label="คัดลอก" />
                </div>
            )}

            {/* บัญชีธนาคารเพิ่มเติม */}
            {bank.account && (
                <div className="w-full pt-4 border-t border-line text-xs text-muted flex flex-col gap-1.5 text-left bg-sand/30 p-3.5 rounded-xl">
                    <span className="font-bold text-primary-dark">หรือโอนเข้าบัญชีธนาคาร:</span>
                    <div className="flex justify-between items-center">
                        <span>ธนาคาร: <strong className="text-ink">{bank.name}</strong></span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span>เลขที่บัญชี: <strong className="font-mono text-ink">{bank.account}</strong></span>
                        <CopyButton text={bank.account.replace(/-/g, '')} label="คัดลอก" />
                    </div>
                    <div>
                        <span>ชื่อบัญชี: <strong className="text-ink">{bank.holder}</strong></span>
                    </div>
                </div>
            )}
        </div>
    )
}

export default PaymentQrCard
