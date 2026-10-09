import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from './PageHeader'
import Icon from './Icon'
import DownloadInvoiceButton from './DownloadInvoiceButton'
import { CopyButton, InvoiceBreakdown, InvoiceStepper, PromptPayCard, SlipImage, StatusBadge } from './InvoiceParts'
import { baht, formatDateTime, formatMonth } from '../lib/billing'
import { supabase } from '../lib/supabaseClient'
import { useSettings } from '../lib/useSettings'

const MAX_SIZE = 5 * 1024 * 1024
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

const formatSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`)

function SlipUpload({ invoice, userId, onUploaded }) {
    const inputRef = useRef(null)
    const [file, setFile] = useState(null)
    const [preview, setPreview] = useState(null)
    const [dragging, setDragging] = useState(false)
    const [error, setError] = useState('')
    const [uploading, setUploading] = useState(false)

    // คืนหน่วยความจำของรูปตัวอย่างเมื่อเปลี่ยนรูปหรือปิดหน้า
    useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

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

    const clear = () => {
        setFile(null)
        setPreview(null)
        setError('')
        if (inputRef.current) inputRef.current.value = ''
    }

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

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-medium shadow-card"
            >
                {uploading ? 'กำลังส่งสลิป...' : `ส่งสลิปให้ตรวจสอบ · ${baht(invoice.total)}`}
            </button>
        </div>
    )
}

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

function InvoiceDetail({ invoice, userId, onBack, onChanged }) {
    return (
        <div className="px-4 sm:px-6 pb-8 flex flex-col gap-4">
            <button onClick={onBack} className="self-start flex items-center gap-1.5 border border-line bg-white text-primary-dark hover:bg-mist/40 px-3.5 py-1.5 rounded-xl text-sm"><Icon name="arrowLeft" className="w-4 h-4" />กลับไปรายการใบแจ้งหนี้</button>

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
                <div className="flex flex-col gap-4">
                    <InvoiceBreakdown invoice={invoice} />
                    {invoice.status === 'pending' && <PromptPayCard invoice={invoice} />}
                    {invoice.status !== 'paid' && <BankCard />}
                </div>

                <div className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
                    {invoice.status === 'pending' && (
                        <>
                            <h3 className="font-medium text-primary-dark">ชำระเงินและแนบสลิป</h3>
                            {invoice.reject_reason && (
                                <p className="text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-2.5">
                                    สลิปก่อนหน้าถูกปฏิเสธ: {invoice.reject_reason} — กรุณาแนบสลิปใหม่
                                </p>
                            )}
                            <SlipUpload invoice={invoice} userId={userId} onUploaded={async () => { await onChanged(); onBack() }} />
                        </>
                    )}

                    {invoice.status === 'review' && (
                        <>
                            <h3 className="font-medium text-primary-dark">กำลังตรวจสอบสลิป</h3>
                            <p className="text-sm text-sky-800 bg-sky-50 ring-1 ring-sky-200 rounded-xl px-4 py-2.5">
                                ส่งสลิปเมื่อ {formatDateTime(invoice.slip_uploaded_at)} — รอผู้ดูแลระบบตรวจสอบ
                            </p>
                        </>
                    )}

                    {invoice.status === 'paid' && (
                        <>
                            <h3 className="font-medium text-primary-dark">ชำระเงินเรียบร้อย</h3>
                            <p className="text-sm text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200 rounded-xl px-4 py-2.5">
                                ได้รับชำระ {baht(invoice.total)} เมื่อ {formatDateTime(invoice.reviewed_at)}
                            </p>
                        </>
                    )}

                    {invoice.status !== 'pending' && invoice.slip_path && (
                        <div className="flex justify-center rounded-xl bg-sand/70 border border-dashed border-line p-4">
                            <SlipImage path={invoice.slip_path} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// RLS ให้อ่านได้เฉพาะใบแจ้งหนี้ของตัวเอง (ไม่แตะ state เพื่อเรียกใช้ได้ทั้งใน effect และหลังส่งสลิป)
const fetchInvoices = () => supabase.from('invoices').select('*').order('month', { ascending: false })

function TenantInvoices({ userId }) {
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [selectedId, setSelectedId] = useState(null)

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

            {selected ? (
                <InvoiceDetail key={selected.id} invoice={selected} userId={userId} onBack={() => setSelectedId(null)} onChanged={load} />
            ) : (
                <div className="px-4 sm:px-6 pb-8 flex flex-col gap-6">
                    {loading || loadError ? (
                        <p className={`text-center py-10 ${loadError ? 'text-red-600' : 'text-muted'}`}>{loading ? 'กำลังโหลด...' : loadError}</p>
                    ) : (
                        <>
                            {focus ? (
                                <div className="rounded-2xl bg-linear-to-br from-primary-dark to-primary text-white p-6 shadow-card flex flex-wrap items-center justify-between gap-5">
                                    <div>
                                        <div className="text-sm text-white/75">
                                            {focus.status === 'pending' ? `ยอดที่ต้องชำระ · เดือน ${formatMonth(focus.month)}` : `รอตรวจสอบสลิป · เดือน ${formatMonth(focus.month)}`}
                                        </div>
                                        <div className="text-4xl font-semibold mt-1 tabular-nums">{baht(focus.total)}</div>
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
