import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from './PageHeader'
import Icon from './Icon'
import DownloadInvoiceButton from './DownloadInvoiceButton'
import { CopyButton, InvoiceBreakdown, InvoiceStepper, PaymentHistory, PromptPayCard, SlipImage, StatusBadge } from './InvoiceParts'
import { balanceOf, baht, daysLate, formatDateTime, formatMonth, isPartiallyPaid, lateFeeOf, paidOf } from '../lib/billing'
import { useRealtimeReload } from '../lib/realtime'
import { requestSlipVerify } from '../lib/slipVerify'
import { supabase } from '../lib/supabaseClient'
import { useSettings } from '../lib/useSettings'
import { SkeletonCards } from './Skeleton.jsx'

// ข้อจำกัดรูปสลิป: ไม่เกิน 5 MB และชนิดไฟล์ที่รับ (MIME -> นามสกุล)
const MAX_SIZE = 5 * 1024 * 1024
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// แสดงขนาดไฟล์เป็น KB หรือ MB
const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`)

// กล่องแนบสลิปของผู้เช่า: เลือก/ลากรูป ดูตัวอย่าง แล้วอัปโหลดเพื่อส่งตรวจ
function SlipUpload({ invoice, userId, onUploaded }) {
    // ไฟล์ที่เลือก รูปตัวอย่าง สถานะกำลังลากไฟล์มาวาง error และกำลังอัปโหลด
    const inputRef = useRef(null)
    const [file, setFile] = useState(null)
    const [preview, setPreview] = useState(null)
    const [dragging, setDragging] = useState(false)
    const [error, setError] = useState('')
    const [uploading, setUploading] = useState(false)

    // คืนหน่วยความจำของรูปตัวอย่างเมื่อเปลี่ยนรูปหรือปิดหน้า
    useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

    // ตรวจไฟล์ที่เลือก (ต้องเป็นรูปและขนาดไม่เกินกำหนด) แล้วสร้างรูปตัวอย่าง
    const pick = (f) => {
        setError('')
        if (!f) return
        if (!TYPES[f.type]) {
            setError('รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WEBP')
        } else if (f.size > MAX_SIZE) {
            setError('ไฟล์ต้องมีขนาดไม่เกิน 5 MB')
        } else {
            setFile(f)
            setPreview(URL.createObjectURL(f))
        }
    }

    // ล้างไฟล์ที่เลือก รูปตัวอย่าง และข้อความ error
    const clear = () => {
        setFile(null)
        setPreview(null)
        setError('')
        if (inputRef.current) inputRef.current.value = ''
    }

    // อัปโหลดสลิปไป storage แล้วเรียก submit_slip ให้สถานะเป็น "รอตรวจสอบ" ถ้าส่งไม่สำเร็จลบไฟล์ที่อัปโหลดทิ้ง
    const handleUpload = async () => {
        setUploading(true)
        const path = `${userId}/${invoice.id}-${Date.now()}.${TYPES[file.type]}`
        const { error: uploadError } = await supabase.storage.from('slips').upload(path, file, { contentType: file.type })
        if (uploadError) {
            setUploading(false)
            setError(`อัปโหลดไม่สำเร็จ: ${uploadError.message}`)
            return
        }
        const { error: submitError } = await supabase.rpc('submit_slip', { p_invoice: invoice.id, p_path: path })
        if (submitError) {
            setUploading(false)
            await supabase.storage.from('slips').remove([path])
            setError(`ส่งสลิปไม่สำเร็จ: ${submitError.message}`)
            return
        }
        // สั่งตรวจสลิปด้วยระบบ ไม่รอผล (โหมดปิดหรือตรวจไม่ได้ แอดมินยังตรวจด้วยตาได้)
        requestSlipVerify(invoice.id)
        await onUploaded()
    }

    return (
        <div className="flex flex-col gap-4">
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => pick(e.target.files[0])}
                className="hidden"
            />

            {/* เลือกไฟล์แล้ว: แสดงรูปตัวอย่าง + ปุ่มเปลี่ยนรูป / ยังไม่เลือก: กล่องคลิกหรือลากรูปมาวาง (เปลี่ยนสีตอนลากผ่าน) */}
            {file ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl bg-sand/70 border border-line p-4">
                    <img src={preview} alt="ตัวอย่างสลิป" className="max-h-80 max-w-full object-contain rounded-xl shadow-card" />
                    <div className="flex items-center gap-3 text-sm text-muted">
                        <span className="truncate max-w-48">{file.name} · {formatSize(file.size)}</span>
                        <button type="button" onClick={clear} disabled={uploading} className="text-red-600 hover:underline">เปลี่ยนรูป</button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]) }}
                    className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                        dragging ? 'border-primary bg-mist/50' : 'border-line bg-sand/50 hover:border-secondary hover:bg-mist/30'
                    }`}
                >
                    <span className="grid place-items-center w-14 h-14 rounded-2xl bg-white shadow-card text-primary"><Icon name="upload" className="w-7 h-7" /></span>
                    <span className="font-medium text-primary-dark">แนบสลิปการโอนเงิน</span>
                    <span className="text-sm text-muted">คลิกเพื่อเลือกรูป หรือลากรูปมาวางที่นี่</span>
                    <span className="text-xs text-muted">JPG, PNG, WEBP · ไม่เกิน 5 MB</span>
                </button>
            )}

            {/* ข้อความ error และปุ่มส่งสลิป (กดได้เมื่อเลือกไฟล์แล้ว) */}
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-medium shadow-card"
            >
                {uploading ? 'กำลังส่งสลิป...' : `ส่งสลิปให้ตรวจสอบ · ${baht(balanceOf(invoice))}`}
            </button>
        </div>
    )
}

// การ์ดบัญชีธนาคารสำหรับโอนเงิน (อ่านจากหน้าตั้งค่า) พร้อมปุ่มคัดลอกเลขบัญชี
function BankCard() {
    const settings = useSettings()
    return (
        <div className="bg-white rounded-2xl shadow-card p-4 flex items-center gap-4">
            <span className="grid place-items-center w-11 h-11 rounded-xl bg-mist/60 text-primary-dark"><Icon name="bank" className="w-6 h-6" /></span>
            <div className="flex-1 min-w-0">
                <div className="text-xs text-muted">โอนเข้าบัญชี</div>
                <div className="font-medium text-ink">{settings.bankName}</div>
                <div className="text-sm text-muted tabular-nums">{settings.bankAccount} · {settings.bankHolder}</div>
            </div>
            <CopyButton text={settings.bankAccount} label="คัดลอกเลขบัญชี" />
        </div>
    )
}

// หน้ารายละเอียดใบแจ้งหนี้ฝั่งผู้เช่า: รายการค่าใช้จ่าย ช่องทางชำระ และแนบ/ดูสลิป
function InvoiceDetail({ invoice, userId, onBack, onChanged }) {
    return (
        <div className="px-4 sm:px-6 pb-8 flex flex-col gap-4">
            <button onClick={onBack} className="self-start flex items-center gap-1.5 border border-line bg-white text-primary-dark hover:bg-mist/40 px-3.5 py-1.5 rounded-xl text-sm"><Icon name="arrowLeft" className="w-4 h-4" />กลับไปรายการใบแจ้งหนี้</button>

            {/* หัว: เดือน ห้อง ปุ่มดาวน์โหลด PDF ป้ายสถานะ และไทม์ไลน์ขั้นตอน */}
            <div className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-primary-dark">ใบแจ้งหนี้เดือน {formatMonth(invoice.month)}</h2>
                        <p className="text-sm text-muted mt-0.5">ห้อง {invoice.room}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <DownloadInvoiceButton invoice={invoice} label="ดาวน์โหลด PDF" className="border border-line bg-white text-primary-dark hover:bg-mist/50 px-4 py-1.5 rounded-xl text-sm" />
                        <StatusBadge status={invoice.status} />
                    </div>
                </div>
                <InvoiceStepper status={invoice.status} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2 items-start">
                {/* ซ้าย: รายการค่าใช้จ่าย + QR พร้อมเพย์ (เฉพาะรอชำระ) + บัญชีธนาคาร (ยังไม่จ่าย) */}
                <div className="flex flex-col gap-4">
                    <InvoiceBreakdown invoice={invoice} />
                    {invoice.status === 'pending' && <PromptPayCard invoice={invoice} />}
                    {invoice.status !== 'paid' && <BankCard />}
                </div>

                {/* ขวา: เนื้อหาตามสถานะ */}
                <div className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
                    {/* รอชำระ: แสดงเหตุผลถ้าสลิปก่อนหน้าถูกปฏิเสธ + กล่องแนบสลิป */}
                    {invoice.status === 'pending' && (
                        <>
                            <h3 className="font-medium text-primary-dark">{isPartiallyPaid(invoice) ? 'ชำระส่วนที่เหลือและแนบสลิป' : 'ชำระเงินและแนบสลิป'}</h3>
                            {isPartiallyPaid(invoice) && (
                                <p className="text-sm text-amber-900 bg-amber-50 ring-1 ring-amber-200 rounded-xl px-4 py-2.5">
                                    ได้รับชำระแล้ว {baht(paidOf(invoice))} ยังเหลืออีก <strong>{baht(balanceOf(invoice))}</strong> กรุณาโอนส่วนที่เหลือและแนบสลิปเพิ่ม
                                </p>
                            )}
                            {invoice.reject_reason && (
                                <p className="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-2.5">
                                    สลิปก่อนหน้าถูกปฏิเสธ: {invoice.reject_reason} — กรุณาแนบสลิปใหม่
                                </p>
                            )}
                            <SlipUpload invoice={invoice} userId={userId} onUploaded={async () => { await onChanged(); onBack() }} />
                        </>
                    )}

                    {/* รอตรวจสอบ: แสดงเวลาที่ส่งสลิป */}
                    {invoice.status === 'review' && (
                        <>
                            <h3 className="font-medium text-primary-dark">กำลังตรวจสอบสลิป</h3>
                            <p className="text-sm text-sky-800 bg-sky-50 ring-1 ring-sky-200 rounded-xl px-4 py-2.5">
                                ส่งสลิปเมื่อ {formatDateTime(invoice.slip_uploaded_at)} — รอผู้ดูแลระบบตรวจสอบ
                            </p>
                        </>
                    )}

                    {/* ชำระแล้ว: แสดงยอดและเวลาที่ยืนยัน */}
                    {invoice.status === 'paid' && (
                        <>
                            <h3 className="font-medium text-primary-dark">ชำระเงินเรียบร้อย</h3>
                            <p className="text-sm text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200 rounded-xl px-4 py-2.5">
                                ได้รับชำระ {baht(invoice.total)} เมื่อ {formatDateTime(invoice.reviewed_at)}
                            </p>
                            {Number(invoice.refund_amount) > 0 && (
                                <p className="text-sm text-sky-900 bg-sky-50 ring-1 ring-sky-200 rounded-xl px-4 py-2.5">
                                    {invoice.refund_status === 'done'
                                        ? `ยอดที่โอนเกิน ${baht(invoice.refund_amount)} หอพักโอนคืนแล้วเมื่อ ${formatDateTime(invoice.refunded_at)}`
                                        : `คุณโอนเกินมา ${baht(invoice.refund_amount)} หอพักจะโอนคืนให้`}
                                </p>
                            )}
                        </>
                    )}

                    {/* รูปสลิปที่ส่งไปแล้ว */}
                    {invoice.status === 'review' && invoice.slip_path && (
                        <div className="flex justify-center rounded-xl bg-sand/70 border border-dashed border-line p-4">
                            <SlipImage path={invoice.slip_path} />
                        </div>
                    )}

                    <PaymentHistory invoiceId={invoice.id} refreshKey={invoice.paid_amount} invoice={invoice} />
                </div>
            </div>
        </div>
    )
}

// RLS ให้อ่านได้เฉพาะใบแจ้งหนี้ของตัวเอง (ไม่แตะ state เพื่อเรียกใช้ได้ทั้งใน effect และหลังส่งสลิป)
const fetchInvoices = () => supabase.from('invoices').select('*').order('month', { ascending: false })

// หน้ารายการใบแจ้งหนี้ของผู้เช่า: โหลดใบแจ้งหนี้ของตัวเอง และกดเข้าไปดูรายละเอียด
function TenantInvoices({ userId }) {
    // รายการใบแจ้งหนี้, สถานะโหลด, error และใบที่เปิดดูอยู่
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [selectedId, setSelectedId] = useState(null)

    // นำผลการโหลดไปตั้งค่า state (แสดง error ถ้าโหลดไม่สำเร็จ)
    const applyResult = useCallback(({ data, error }) => {
        if (error) setLoadError(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`)
        else {
            setInvoices(data)
            setLoadError('')
        }
        setLoading(false)
    }, [])

    // โหลดซ้ำหลังส่งสลิป
    const load = useCallback(async () => applyResult(await fetchInvoices()), [applyResult])

    // อัปเดตเองเมื่อมีใบใหม่ ผู้ดูแลยืนยัน/ปฏิเสธสลิป หรือมีการรับเงิน
    useRealtimeReload(['invoices', 'invoice_payments'], load)

    // โหลดครั้งแรก: setState เกิดใน callback หลังได้ข้อมูล ไม่ได้เรียกตรง ๆ ใน effect
    useEffect(() => {
        let active = true
        fetchInvoices().then((result) => {
            if (active) applyResult(result)
        })
        return () => {
            active = false
        }
    }, [applyResult])

    const selected = invoices.find((i) => i.id === selectedId)
    // ใบที่ต้องทำต่อ: ค้างชำระเดือนเก่าสุดก่อน แล้วค่อยเป็นใบที่รอตรวจสอบ
    const unpaid = invoices.filter((i) => i.status === 'pending').sort((a, b) => a.month.localeCompare(b.month))
    const waiting = invoices.filter((i) => i.status === 'review')
    const focus = unpaid[0] ?? waiting[0]

    return (
        <>
            <PageHeader title="ใบแจ้งหนี้ของฉัน" subtitle="ดูยอดที่ต้องชำระและแนบสลิปการโอนเงิน" />

            {/* เลือกใบแล้วแสดงรายละเอียด ไม่งั้นแสดงหน้ารายการ */}
            {selected ? (
                <InvoiceDetail key={selected.id} invoice={selected} userId={userId} onBack={() => setSelectedId(null)} onChanged={load} />
            ) : (
                <div className="px-4 sm:px-6 pb-8 flex flex-col gap-6">
                    {loading || loadError ? (
                        loading ? <SkeletonCards count={2} lines={4} /> : <p className="text-center py-10 text-red-600">{loadError}</p>
                    ) : (
                        <>
                            {/* การ์ดเด่นด้านบน: ยอดที่ต้องจ่าย/รอตรวจ หรือข้อความ "ไม่มียอดค้างชำระ" */}
                            {focus ? (
                                <div className="rounded-2xl bg-linear-to-br from-primary-dark to-primary text-white p-6 shadow-card flex flex-wrap items-center justify-between gap-5">
                                    <div>
                                        <div className="text-sm text-white/75">
                                            {focus.status === 'pending' ? `ยอดที่ต้องชำระ${isPartiallyPaid(focus) ? 'คงเหลือ' : ''} · เดือน ${formatMonth(focus.month)}` : `รอตรวจสอบสลิป · เดือน ${formatMonth(focus.month)}`}
                                        </div>
                                        <div className="text-4xl font-semibold mt-1 tabular-nums">{baht(balanceOf(focus))}</div>
                                        {lateFeeOf(focus) > 0 && focus.status === 'pending' && (
                                            <div className="text-sm text-amber-200 mt-1">รวมค่าปรับล่าช้า {baht(lateFeeOf(focus))} (เกินกำหนด {daysLate(focus)} วัน) ค่าปรับเพิ่มขึ้นทุกวันจนกว่าจะชำระ</div>
                                        )}
                                        {unpaid.length > 1 && <div className="text-sm text-white/75 mt-1">มีใบแจ้งหนี้ค้างชำระ {unpaid.length} เดือน</div>}
                                    </div>
                                    <button
                                        onClick={() => setSelectedId(focus.id)}
                                        className="bg-white text-primary-dark hover:bg-mist px-6 py-3 rounded-xl font-medium shadow-card"
                                    >
                                        {focus.status === 'pending' ? 'ชำระเงิน / แนบสลิป' : 'ดูรายละเอียด'}
                                    </button>
                                </div>
                            ) : invoices.length > 0 ? (
                                <div className="rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 text-emerald-900 p-6 flex items-center gap-4">
                                    <span className="grid place-items-center w-11 h-11 rounded-full bg-white text-emerald-600"><Icon name="checkCircle" className="w-6 h-6" /></span>
                                    <div>
                                        <div className="font-medium">ไม่มียอดค้างชำระ</div>
                                        <div className="text-sm text-emerald-800/80">ใบแจ้งหนี้ทุกใบชำระเรียบร้อยแล้ว</div>
                                    </div>
                                </div>
                            ) : null}

                            {/* ประวัติใบแจ้งหนี้ทุกเดือน (กดเพื่อดูรายละเอียด) */}
                            <div>
                                <h2 className="font-medium text-primary-dark mb-3">ประวัติใบแจ้งหนี้</h2>
                                {invoices.length === 0 ? (
                                    <div className="bg-white rounded-2xl shadow-card py-12 text-center text-muted">
                                        <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-full bg-sand text-muted"><Icon name="receipt" className="w-6 h-6" /></span>
                                        ยังไม่มีใบแจ้งหนี้
                                    </div>
                                ) : (
                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                        {invoices.map((i) => (
                                            <button
                                                key={i.id}
                                                onClick={() => setSelectedId(i.id)}
                                                className="flex items-center justify-between gap-3 bg-white rounded-2xl shadow-card px-5 py-4 text-left hover:shadow-md hover:-translate-y-0.5 transition"
                                            >
                                                <div>
                                                    <div className="font-medium text-primary-dark">เดือน {formatMonth(i.month)}</div>
                                                    <div className="text-xl font-semibold text-ink mt-0.5 tabular-nums">{baht(i.total)}</div>
                                                    {isPartiallyPaid(i) && <div className="text-xs text-amber-700 mt-0.5">ชำระแล้ว {baht(paidOf(i))} · เหลือ {baht(balanceOf(i))}</div>}
                                                    {daysLate(i) > 0 && <div className="text-xs font-semibold text-red-600 mt-0.5">เกินกำหนด {daysLate(i)} วัน · ค่าปรับ {baht(lateFeeOf(i))}</div>}
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                    <StatusBadge status={i.status} />
                                                    <span className="flex items-center gap-1 text-xs text-primary">ดูรายละเอียด<Icon name="arrowRight" className="w-3.5 h-3.5" /></span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </>
    )
}

export default TenantInvoices
