import { useEffect, useState } from 'react'
import Icon from './Icon'
import { invoiceStatuses } from '../data/billing'
import { baht, calcInvoice, getSlipUrl } from '../lib/billing'
import { formatPromptPayId, generatePromptPayQR } from '../lib/promptpay'
import { useSettings } from '../lib/useSettings'

export function StatusBadge({ status }) {
    const s = invoiceStatuses[status]
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${s.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    )
}

const STEPS = ['ออกใบแจ้งหนี้', 'ส่งสลิป', 'ตรวจสอบ', 'ชำระแล้ว']
const STEP_OF = { pending: 1, review: 2, paid: 4 }

// ไทม์ไลน์สถานะ: ออกใบแจ้งหนี้ -> ส่งสลิป -> ตรวจสอบ -> ชำระแล้ว
export function InvoiceStepper({ status }) {
    const current = STEP_OF[status]
    return (
        <ol className="flex items-center">
            {STEPS.map((label, i) => {
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
            <div className="flex items-center justify-between px-4 py-3.5 bg-linear-to-r from-primary-dark to-primary text-white">
                <span className="text-sm font-medium">ยอดรวมสุทธิ</span>
                <span className="text-xl font-semibold tabular-nums">{baht(invoice.total)}</span>
            </div>
        </div>
    )
}

// ปุ่มคัดลอกข้อความ (เช่น เลขบัญชี)
export function CopyButton({ text, label = 'คัดลอก' }) {
    const [copied, setCopied] = useState(false)

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

    useEffect(() => {
        let active = true
        generatePromptPayQR(settings.promptpayId, invoice.total, { width: 360 })
            .then((url) => active && setQr({ url, error: '' }))
            .catch((e) => active && setQr({ url: null, error: e.message }))
        return () => {
            active = false
        }
    }, [settings.promptpayId, invoice.total])

    return (
        <div className="bg-white rounded-2xl shadow-card p-4 flex flex-col items-center gap-3 text-center">
            <div className="font-medium text-primary-dark">สแกนจ่ายด้วยพร้อมเพย์</div>
            {qr.url ? (
                <img src={qr.url} alt="QR พร้อมเพย์" className="w-48 h-48 rounded-xl border border-line" />
            ) : qr.error ? (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                    ยังสร้าง QR ไม่ได้ เพราะรหัสพร้อมเพย์ของหอพักไม่ถูกต้อง กรุณาติดต่อผู้ดูแลหอพัก หรือโอนเข้าบัญชีธนาคารแทน
                </p>
            ) : (
                <div className="w-48 h-48 rounded-xl bg-line/60 animate-pulse" aria-label="กำลังสร้าง QR" />
            )}
            <div className="text-sm text-muted">
                ยอด <span className="font-semibold text-ink">{baht(invoice.total)}</span> · พร้อมเพย์{' '}
                <span className="tabular-nums">{formatPromptPayId(settings.promptpayId)}</span>
            </div>
            <CopyButton text={String(settings.promptpayId).replace(/\D/g, '')} label="คัดลอกเลขพร้อมเพย์" />
        </div>
    )
}

export function SlipImage({ path }) {
    const [url, setUrl] = useState(null)
    const [failed, setFailed] = useState(false)

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
