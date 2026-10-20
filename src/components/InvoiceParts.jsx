import { useEffect, useState } from 'react'
import Icon from './Icon'
import { invoiceStatuses } from '../data/billing'
import { balanceOf, baht, calcInvoice, formatDateTime, getSlipUrl, paidOf } from '../lib/billing'
import { formatPromptPayId, generatePromptPayQR } from '../lib/promptpay'
import { supabase } from '../lib/supabaseClient'
import { useSettings } from '../lib/useSettings'

// ป้ายสถานะใบแจ้งหนี้ (รอชำระ / รอตรวจสอบ / ชำระแล้ว)
export function StatusBadge({ status }) {
    const s = invoiceStatuses[status]
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${s.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    )
}

// ขั้นตอนของใบแจ้งหนี้ และสถานะ -> ขั้นที่กำลังอยู่ (ชำระแล้ว = ผ่านครบทุกขั้น)
const STEPS = ['ออกใบแจ้งหนี้', 'ส่งสลิป', 'ตรวจสอบ', 'ชำระแล้ว']
const STEP_OF = { pending: 1, review: 2, paid: 4 }

// ไทม์ไลน์สถานะ: ออกใบแจ้งหนี้ -> ส่งสลิป -> ตรวจสอบ -> ชำระแล้ว
export function InvoiceStepper({ status }) {
    const current = STEP_OF[status]
    return (
        <ol className="flex items-center">
            {STEPS.map((label, i) => {
                // ขั้นที่ผ่านแล้วแสดงเครื่องหมายถูก ขั้นปัจจุบันมีกรอบ ขั้นที่ยังไม่ถึงเป็นสีเทา
                const done = i < current
                const active = i === current
                return (
                    <li key={label} className="flex-1 flex items-center last:flex-none">
                        <div className="flex flex-col items-center gap-1.5">
                            <span
                                className={`grid place-items-center w-7 h-7 rounded-full text-xs font-semibold transition-colors ${
                                    done
                                        ? 'bg-primary text-white'
                                        : active
                                            ? 'bg-white text-primary ring-2 ring-primary'
                                            : 'bg-sand text-muted ring-1 ring-line'
                                }`}
                            >
                                {done ? <Icon name="check" className="w-4 h-4" /> : i + 1}
                            </span>
                            <span className={`text-[11px] leading-tight text-center ${done || active ? 'text-primary-dark font-medium' : 'text-muted'}`}>
                                {label}
                            </span>
                        </div>
                        {/* เส้นเชื่อมไปขั้นถัดไป (เป็นสีเมื่อผ่านขั้นนี้แล้ว) */}
                        {i < STEPS.length - 1 && (
                            <span className={`flex-1 h-0.5 mx-2 mb-5 rounded ${done ? 'bg-primary' : 'bg-line'}`} />
                        )}
                    </li>
                )
            })}
        </ol>
    )
}

// รายละเอียดการคำนวณยอดของใบแจ้งหนี้ (ใช้ร่วมกันทั้งฝั่งแอดมินและผู้เช่า)
export function InvoiceBreakdown({ invoice }) {
    // คำนวณหน่วยและค่าน้ำ/ไฟจากเลขมิเตอร์ในใบแจ้งหนี้
    const c = calcInvoice({
        rent: Number(invoice.rent),
        waterPrev: invoice.water_prev,
        waterCurr: invoice.water_curr,
        elecPrev: invoice.elec_prev,
        elecCurr: invoice.elec_curr,
        waterRate: Number(invoice.water_rate),
        elecRate: Number(invoice.elec_rate),
        commonFee: Number(invoice.common_fee),
    })
    // รายการค่าใช้จ่ายที่แสดงทีละแถว
    const rows = [
        { icon: 'home', tone: 'bg-sky-50 text-sky-700', label: 'ค่าเช่าห้อง', detail: '', value: Number(invoice.rent) },
        { icon: 'droplet', tone: 'bg-cyan-50 text-cyan-700', label: 'ค่าน้ำ', detail: `${c.waterUnits} หน่วย × ${baht(invoice.water_rate)}`, value: c.water },
        { icon: 'bolt', tone: 'bg-amber-50 text-amber-700', label: 'ค่าไฟ', detail: `${c.elecUnits} หน่วย × ${baht(invoice.elec_rate)}`, value: c.elec },
        { icon: 'building', tone: 'bg-violet-50 text-violet-700', label: 'ค่าส่วนกลาง', detail: '', value: Number(invoice.common_fee) },
    ]
    return (
        <div className="rounded-2xl border border-line overflow-hidden bg-white">
            <ul className="divide-y divide-line">
                {rows.map((r) => (
                    <li key={r.label} className="flex items-center gap-3 px-4 py-3">
                        <span className={`grid place-items-center w-9 h-9 rounded-xl shrink-0 ${r.tone}`}><Icon name={r.icon} className="w-[18px] h-[18px]" /></span>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm text-ink">{r.label}</div>
                            {r.detail && <div className="text-xs text-muted">{r.detail}</div>}
                        </div>
                        <span className="text-sm font-medium text-ink tabular-nums">{baht(r.value)}</span>
                    </li>
                ))}
            </ul>
            {/* แถบยอดรวมสุทธิด้านล่าง */}
            <div className="flex items-center justify-between px-4 py-3.5 bg-linear-to-r from-primary-dark to-primary text-white">
                <span className="text-sm font-medium">ยอดรวมสุทธิ</span>
                <span className="text-xl font-semibold tabular-nums">{baht(invoice.total)}</span>
            </div>
            {/* ได้รับเงินแล้ว: ผู้เช่าโอนไม่ครบ แล้วโอนเพิ่มได้ จึงแสดงยอดที่ได้รับและยอดคงเหลือ (หรือยอดที่ต้องโอนคืนถ้าโอนเกิน) */}
            {paidOf(invoice) > 0 && (
                <dl className="px-4 py-3 text-sm flex flex-col gap-1.5 border-t border-line">
                    <div className="flex justify-between"><dt className="text-muted">ได้รับชำระแล้ว</dt><dd className="tabular-nums font-medium text-emerald-700">{baht(paidOf(invoice))}</dd></div>
                    {invoice.status !== 'paid' && (
                        <div className="flex justify-between"><dt className="text-muted">คงเหลือที่ต้องชำระ</dt><dd className="tabular-nums font-semibold text-amber-700">{baht(balanceOf(invoice))}</dd></div>
                    )}
                    {Number(invoice.refund_amount) > 0 && (
                        <div className="flex justify-between"><dt className="text-muted">ชำระเกิน {invoice.refund_status === 'done' ? '(โอนคืนแล้ว)' : '(รอโอนคืน)'}</dt><dd className="tabular-nums font-medium text-sky-700">{baht(invoice.refund_amount)}</dd></div>
                    )}
                </dl>
            )}
        </div>
    )
}

// ประวัติการรับเงินของใบแจ้งหนี้ (สลิปที่แอดมินยืนยันแล้วทุกใบ) ไม่แสดงอะไรถ้ายังไม่มี
// refreshKey เปลี่ยนเมื่อต้องโหลดใหม่ (เช่น หลังยืนยันสลิป)
export function PaymentHistory({ invoiceId, refreshKey }) {
    const [rows, setRows] = useState([])

    useEffect(() => {
        let active = true
        supabase
            .from('invoice_payments')
            .select('id, amount, slip_path, confirmed_at')
            .eq('invoice_id', invoiceId)
            .order('confirmed_at')
            .then(({ data }) => active && setRows(data ?? []))
        return () => {
            active = false
        }
    }, [invoiceId, refreshKey])

    if (rows.length === 0) return null
    return (
        <div className="flex flex-col gap-2">
            <h3 className="font-medium text-primary-dark">ประวัติการรับชำระ</h3>
            <ul className="flex flex-col gap-2">
                {rows.map((p) => (
                    <li key={p.id} className="rounded-xl border border-line bg-sand/40 px-4 py-2.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted">{formatDateTime(p.confirmed_at)}</span>
                            <span className="font-semibold text-emerald-700 tabular-nums">{baht(p.amount)}</span>
                        </div>
                        {p.slip_path && (
                            <details className="mt-1.5">
                                <summary className="text-xs text-primary cursor-pointer">ดูสลิป</summary>
                                <div className="flex justify-center pt-2"><SlipImage path={p.slip_path} /></div>
                            </details>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    )
}

// ปุ่มคัดลอกข้อความ (เช่น เลขบัญชี)
export function CopyButton({ text, label = 'คัดลอก' }) {
    const [copied, setCopied] = useState(false)

    // คัดลอกข้อความลงคลิปบอร์ด แล้วแสดง "คัดลอกแล้ว" ชั่วคราว
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            // เบราว์เซอร์ไม่อนุญาตให้คัดลอก ไม่ต้องทำอะไร
        }
    }

    return (
        <button
            type="button"
            onClick={copy}
            className="text-xs px-2.5 py-1 rounded-lg bg-white border border-line text-primary hover:bg-mist/50"
        >
            {copied ? 'คัดลอกแล้ว' : label}
        </button>
    )
}

// การ์ด QR พร้อมเพย์ระบุยอดตามใบแจ้งหนี้ ให้ผู้เช่าสแกนจ่ายผ่านแอปธนาคาร
export function PromptPayCard({ invoice }) {
    const settings = useSettings()
    const [qr, setQr] = useState({ url: null, error: '' })
    // ยอดใน QR คือยอดคงเหลือ (ชำระบางส่วนมาแล้วจะเหลือเฉพาะส่วนที่ยังขาด)
    const due = balanceOf(invoice)

    // สร้างรูป QR พร้อมเพย์ใหม่เมื่อรหัสพร้อมเพย์หรือยอดเปลี่ยน
    useEffect(() => {
        let active = true
        generatePromptPayQR(settings.promptpayId, due, { width: 360 })
            .then((url) => active && setQr({ url, error: '' }))
            .catch((e) => active && setQr({ url: null, error: e.message }))
        return () => {
            active = false
        }
    }, [settings.promptpayId, due])

    return (
        <div className="bg-white rounded-2xl shadow-card p-4 flex flex-col items-center gap-3 text-center">
            <div className="font-medium text-primary-dark">สแกนจ่ายด้วยพร้อมเพย์</div>
            {/* แสดง QR / ข้อความเมื่อรหัสพร้อมเพย์ผิด / กล่องกำลังโหลด */}
            {qr.url ? (
                <img src={qr.url} alt="QR พร้อมเพย์" className="w-48 h-48 rounded-xl border border-line" />
            ) : qr.error ? (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                    {settings.promptpayId
                        ? 'ยังสร้าง QR ไม่ได้ เพราะรหัสพร้อมเพย์ของหอพักไม่ถูกต้อง กรุณาติดต่อผู้ดูแลหอพัก หรือโอนเข้าบัญชีธนาคารแทน'
                        : 'ผู้ดูแลหอพักยังไม่ได้ตั้งค่าช่องทางรับชำระเงิน กรุณาติดต่อผู้ดูแลหอพักก่อนโอนเงิน'}
                </p>
            ) : (
                <div className="w-48 h-48 rounded-xl bg-line/60 animate-pulse" aria-label="กำลังสร้าง QR" />
            )}
            {/* ยอดที่ต้องจ่ายและเลขพร้อมเพย์ + ปุ่มคัดลอกเลข */}
            <div className="text-sm text-muted">
                ยอด <span className="font-semibold text-ink">{baht(due)}</span>
                {settings.promptpayId && <> · พร้อมเพย์{' '}<span className="tabular-nums">{formatPromptPayId(settings.promptpayId)}</span></>}
            </div>
            {settings.promptpayId && <CopyButton text={String(settings.promptpayId).replace(/\D/g, '')} label="คัดลอกเลขพร้อมเพย์" />}
        </div>
    )
}

// แสดงรูปสลิปจาก storage (bucket private จึงต้องขอลิงก์ชั่วคราว)
export function SlipImage({ path }) {
    const [url, setUrl] = useState(null)
    const [failed, setFailed] = useState(false)

    // ขอลิงก์รูปสลิปใหม่ทุกครั้งที่ path เปลี่ยน
    useEffect(() => {
        let active = true
        getSlipUrl(path).then((u) => {
            if (!active) return
            if (u) setUrl(u)
            else setFailed(true)
        })
        return () => {
            active = false
        }
    }, [path])

    // โหลดไม่สำเร็จแสดงข้อความ, ระหว่างโหลดแสดงกล่องว่าง, โหลดแล้วแสดงรูป (คลิกเปิดรูปเต็ม)
    if (failed) return <p className="text-sm text-red-600">โหลดรูปสลิปไม่สำเร็จ</p>
    if (!url) {
        return <div className="w-48 h-64 rounded-xl bg-line/60 animate-pulse" aria-label="กำลังโหลดรูปสลิป" />
    }
    return (
        <a href={url} target="_blank" rel="noreferrer" title="คลิกเพื่อเปิดดูรูปเต็มขนาด" className="group relative block">
            <img src={url} alt="สลิปการโอนเงิน" className="max-h-[68vh] max-w-full w-auto object-contain rounded-xl shadow-card" />
            <span className="absolute bottom-2 right-2 text-xs bg-black/60 text-white px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                เปิดรูปเต็ม
            </span>
        </a>
    )
}
