import { formatSize } from '../lib/useSlipUpload'
import DownloadInvoiceButton from './DownloadInvoiceButton'
import Icon from './Icon'

// แนบสลิปโอนเงิน + ปุ่มส่งหลักฐาน + ปุ่มดาวน์โหลด PDF ฝั่งขวาของหน้าชำระเงินของผู้เช่า
// upload = ผลของ useSlipUpload() (ไฟล์ที่เลือก สถานะส่ง และฟังก์ชันจัดการ)
function SlipUploadCard({ invoice, upload }) {
    const { file, preview, isDragging, setIsDragging, error, uploading, success, fileInputRef, pickFile, clearFile, submit } = upload

    return (
        <div className="lg:col-span-6 bg-white rounded-2xl p-4 sm:p-6 md:p-8 shadow-card border border-line flex flex-col gap-5">
            <div className="text-center">
                <span className="text-xs font-semibold text-muted/70 tracking-wider">
                    — หรือแนบสลิปโอนเงิน —
                </span>
            </div>

            {/* กรณีสลิปก่อนหน้าถูกปฏิเสธ */}
            {invoice?.reject_reason && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                    <strong>สลิปก่อนหน้าถูกปฏิเสธ:</strong> {invoice.reject_reason} — กรุณาแนบรูปสลิปใหม่
                </div>
            )}

            {/* แจ้งเตือนเมื่อส่งสลิปสำเร็จ */}
            {success && (
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
            {file ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl bg-sand/60 border border-line p-4 sm:p-5">
                    <img
                        src={preview}
                        alt="ตัวอย่างรูปสลิป"
                        className="max-h-72 max-w-full object-contain rounded-xl shadow-card"
                    />
                    <div className="flex items-center gap-3 text-xs text-muted">
                        <span className="truncate max-w-48 font-medium text-ink">
                            {file.name} · {formatSize(file.size)}
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
            {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                    {error}
                </p>
            )}

            {/* ปุ่มที่ 1: ส่งหลักฐานการชำระ */}
            <button
                type="button"
                onClick={submit}
                disabled={!file || uploading}
                className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-semibold shadow-card flex items-center justify-center gap-2 transition cursor-pointer text-sm sm:text-base"
            >
                <Icon name="send" className="w-4 h-4" />
                <span>
                    {uploading ? 'กำลังส่งหลักฐาน...' : 'ส่งหลักฐานการชำระ'}
                </span>
            </button>

            {/* ปุ่มที่ 2: ดาวน์โหลดใบแจ้งหนี้ PDF */}
            <DownloadInvoiceButton invoice={invoice} className="w-full border border-line bg-white hover:bg-sand/60 text-primary-dark py-3 rounded-xl font-medium shadow-2xs flex items-center justify-center gap-2 transition cursor-pointer text-sm" />
        </div>
    )
}

export default SlipUploadCard
