import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import DatePicker from './DatePicker'
import { MAX_SLOTS, repairStatuses, repairUrgencies } from '../data/repairs'
import { formatSize, formatSlot, getRepairImageUrl, isPastTime, parsePeriod, repairEndOptions, repairStartOptions, todayIso, validateImage } from '../lib/repairs'

// ป้ายสถานะงานซ่อม (รอดำเนินการ / กำลังดำเนินการ / เสร็จสิ้น) สีตามสถานะ ถ้าไม่รู้จักสถานะจะแสดงเป็นสีเทา
export function RepairStatusBadge({ status }) {
    const s = repairStatuses[status] ?? { label: status, color: 'bg-gray-100 text-gray-800', dot: 'bg-gray-400' }
    return (
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium ${s.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    )
}

// แสดงรูปจาก storage (bucket private จึงต้องขอลิงก์ชั่วคราว) คลิกเพื่อเปิดรูปเต็ม
export function RepairImage({ path, className = 'max-h-80' }) {
    const [url, setUrl] = useState(null)
    const [failed, setFailed] = useState(false)

    // ขอลิงก์รูปใหม่ทุกครั้งที่ path เปลี่ยน (active กันไม่ให้ตั้งค่าหลังคอมโพเนนต์ถูกปิดไปแล้ว)
    useEffect(() => {
        let active = true
        getRepairImageUrl(path).then((u) => {
            if (!active) return
            if (u) setUrl(u)
            else setFailed(true)
        })
        return () => {
            active = false
        }
    }, [path])

    if (failed) return <p className="text-sm text-red-600">โหลดรูปไม่สำเร็จ</p>
    if (!url) return <div className="w-48 h-40 rounded-xl bg-line/60 animate-pulse" aria-label="กำลังโหลดรูป" />
    return (
        <a href={url} target="_blank" rel="noreferrer" title="คลิกเพื่อเปิดรูปเต็มขนาด" className="block">
            <img src={url} alt="รูปภาพปัญหา" className={`${className} max-w-full w-auto object-contain rounded-xl shadow-card`} />
        </a>
    )
}

// ช่องแนบรูป: แสดงรูปใหม่ที่เลือก > รูปเดิมในระบบ > กล่องเลือกไฟล์
// onPick(file) เมื่อเลือกไฟล์ใหม่, onClear() เมื่อกดนำรูปออก
export function RepairImagePicker({ file, existingPath, onPick, onClear, disabled = false }) {
    const inputRef = useRef(null)
    const [preview, setPreview] = useState(null)
    const [error, setError] = useState('')

    // คืนหน่วยความจำของรูปตัวอย่างเมื่อเปลี่ยนรูปหรือปิดหน้า
    useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

    // ตรวจไฟล์ที่เลือก (ชนิด/ขนาด) ถ้าผ่านให้สร้างรูปตัวอย่างแล้วส่งไฟล์ออกไป จากนั้นล้างช่อง input ให้เลือกไฟล์เดิมซ้ำได้
    const pick = (f) => {
        if (!f) return
        const message = validateImage(f)
        setError(message)
        if (!message) {
            setPreview(URL.createObjectURL(f))
            onPick(f)
        }
        if (inputRef.current) inputRef.current.value = ''
    }

    // นำรูปออก: ล้างข้อความ error และรูปตัวอย่าง แล้วแจ้งให้หน้าที่เรียกใช้รู้
    const clear = () => {
        setError('')
        setPreview(null)
        onClear()
    }

    // มีรูปให้แสดงไหม (รูปใหม่ที่เลือก หรือรูปเดิมในระบบ)
    const hasImage = file || existingPath

    return (
        <div className="flex flex-col gap-2">
            {/* ช่องเลือกไฟล์จริงซ่อนไว้ กดผ่านปุ่มอื่นแทน */}
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => pick(e.target.files[0])}
                disabled={disabled}
                className="hidden"
            />
            {/* มีรูป: แสดงรูป + ปุ่มเปลี่ยน/นำออก, ไม่มีรูป: กล่องคลิกหรือลากไฟล์มาวาง */}
            {hasImage ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl bg-sand/70 border border-line p-4">
                    {file && preview ? (
                        <img src={preview} alt="ตัวอย่างรูปภาพ" className="max-h-72 max-w-full object-contain rounded-xl shadow-card" />
                    ) : (
                        <RepairImage path={existingPath} className="max-h-72" />
                    )}
                    <div className="flex items-center gap-4 text-sm">
                        {file && <span className="text-muted truncate max-w-48">{file.name} · {formatSize(file.size)}</span>}
                        <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="text-primary hover:underline">
                            เปลี่ยนรูป
                        </button>
                        <button type="button" disabled={disabled} onClick={clear} className="text-red-600 hover:underline">
                            นำรูปออก
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault()
                        pick(e.dataTransfer.files[0])
                    }}
                    className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line hover:border-secondary hover:bg-sand/60 text-muted py-10 transition-colors"
                >
                    <Icon name="image" className="w-8 h-8" />
                    <span className="text-sm font-medium">คลิกหรือลากรูปมาวางเพื่อแนบรูปปัญหา</span>
                    <span className="text-xs">JPG, PNG หรือ WEBP ไม่เกิน 5 MB</span>
                </button>
            )}
            {/* ข้อความ error ของไฟล์ */}
            {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
    )
}

// หน้าต่างยืนยันการลบ/ยกเลิก
export function ConfirmDialog({ title, children, confirmLabel, busy, onCancel, onConfirm }) {
    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div role="alertdialog" aria-modal="true" className="bg-white rounded-2xl p-4 sm:p-6 shadow-xl w-[380px] max-w-full flex flex-col gap-3">
                {/* หัวข้อ, ข้อความ (children) และปุ่ม ไม่ใช่ / ยืนยัน */}
                <h3 className="text-lg font-semibold text-primary-dark">{title}</h3>
                <div className="text-sm text-muted">{children}</div>
                <div className="flex justify-end gap-2 mt-2">
                    <button type="button" onClick={onCancel} disabled={busy} className="border border-line text-muted hover:bg-sand px-4 py-1.5 rounded-lg">
                        ไม่ใช่
                    </button>
                    <button type="button" onClick={onConfirm} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg font-medium">
                        {busy ? 'กำลังดำเนินการ...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ป้ายความเร่งด่วน (ไม่แสดงอะไรถ้าเป็นระดับปกติ เว้นแต่ showNormal)
export function UrgencyBadge({ urgency, showNormal = false }) {
    if (!urgency || (urgency === 'normal' && !showNormal)) return null
    const u = repairUrgencies[urgency] ?? repairUrgencies.normal
    return (
        <span className={`inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${u.color}`}>
            {urgency === 'emergency' && <Icon name="alert" className="w-3.5 h-3.5" />}
            {u.label}
        </span>
    )
}

// ปุ่มเลือกเวลา กดแล้วเปิดตารางเวลาแบบกะทัดรัด (แทน select ของเบราว์เซอร์ที่รายการยาวเกินไป)
function TimeSelect({ value, options, isBlocked, onChange, disabled, label, align, className, placeholder = 'เลือกเวลา' }) {
    const ref = useRef(null)
    const [open, setOpen] = useState(false)

    // ขณะเปิด: คลิกด้านนอกหรือกด Esc ให้ปิด
    useEffect(() => {
        if (!open) return
        const onClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        const onKey = (e) => e.key === 'Escape' && setOpen(false)
        document.addEventListener('mousedown', onClick)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onClick)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    return (
        <div ref={ref} className="relative flex-1 min-w-0">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                disabled={disabled}
                aria-label={label}
                aria-expanded={open}
                className={`${className} flex items-center justify-between gap-1 text-left ${open ? 'border-secondary' : ''}`}
            >
                <span className={value ? '' : 'text-muted'}>{value || placeholder}</span>
                <Icon name="clock" className="w-4 h-4 text-primary shrink-0" />
            </button>
            {open && (
                <div className={`absolute z-40 mt-1 w-56 grid grid-cols-4 gap-1 bg-white rounded-2xl shadow-xl border border-line p-2 ${align === 'right' ? 'right-0' : 'left-0'}`}>
                    {options.map((t) => {
                        const blocked = isBlocked?.(t)
                        return (
                            <button
                                key={t}
                                type="button"
                                disabled={blocked}
                                onClick={() => {
                                    onChange(t)
                                    setOpen(false)
                                }}
                                className={`py-1.5 rounded-lg text-xs transition-colors ${
                                    t === value ? 'bg-primary text-white font-medium' : blocked ? 'text-line cursor-not-allowed' : 'text-ink hover:bg-mist/50'
                                }`}
                            >
                                {t}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// เลือกช่วงเวลาที่สะดวก: เวลาเริ่ม ถึง เวลาสิ้นสุด ค่าเป็น "09:00-16:00" (เลือกไม่ครบ = "09:00-" หรือ "-16:00")
// isStartBlocked(start) = เวลาเริ่มนี้เลือกไม่ได้ (เช่น กระชั้นเกินไป)
function TimeRangePicker({ value, onChange, isStartBlocked, disabled = false }) {
    const { start, end } = parsePeriod(value)
    const className = 'w-full border border-line rounded-xl px-3 py-2 text-sm bg-white outline-none focus:border-secondary'
    return (
        <div className="order-last sm:order-none w-full sm:w-64 shrink-0 flex items-center gap-1.5">
            <TimeSelect
                value={start}
                options={repairStartOptions}
                isBlocked={isStartBlocked}
                // เปลี่ยนเวลาเริ่มแล้วเวลาสิ้นสุดเดิมไม่หลังเวลาเริ่ม ให้ล้างเวลาสิ้นสุด
                onChange={(t) => onChange(`${t}-${end && end > t ? end : ''}`)}
                disabled={disabled}
                label="เวลาเริ่ม"
                placeholder="เริ่ม"
                className={className}
            />
            <span className="text-muted text-sm">ถึง</span>
            <TimeSelect
                value={end}
                options={repairEndOptions(start)}
                onChange={(t) => onChange(`${start}-${t}`)}
                disabled={disabled}
                label="เวลาสิ้นสุด"
                placeholder="สิ้นสุด"
                align="right"
                className={className}
            />
            <span className="text-muted text-sm">น.</span>
        </div>
    )
}

// ตัวเลือกวันและช่วงเวลาที่สะดวกให้ช่างเข้า (สูงสุด MAX_SLOTS ตัวเลือก) ค่าเป็น [{ date: 'YYYY-MM-DD', period: '09:00-16:00' }]
export function SlotPicker({ slots, onChange, disabled = false }) {
    // แสดงช่องตัวเลือกที่ 1 ไว้เสมอ ถ้ายังไม่ได้เลือกวันจะยังไม่นับเป็นข้อมูล (ส่ง [] ออกไป แต่จำเวลาที่ตั้งไว้)
    const [draftPeriod, setDraftPeriod] = useState('')
    const rows = slots.length > 0 ? slots : [{ date: '', period: draftPeriod }]
    const emit = (next) => {
        if (next.length === 1 && !next[0].date) {
            setDraftPeriod(next[0].period)
            onChange([])
        } else onChange(next)
    }

    // แก้ค่าของช่วงที่ index
    const update = (index, key, value) => emit(rows.map((s, i) => (i === index ? { ...s, [key]: value } : s)))
    const remove = (index) => emit(rows.filter((_, i) => i !== index))
    const add = () => emit([...rows, { date: '', period: '' }])

    return (
        <div className="flex flex-col gap-2">
            {rows.map((s, i) => (
                <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-xl border border-line bg-sand/40 p-2">
                    <div className="flex-1 min-w-40">
                        <DatePicker value={s.date} onChange={(v) => update(i, 'date', v)} min={todayIso()} disabled={disabled} placeholder="เลือกวัน" />
                    </div>
                    <TimeRangePicker
                        value={s.period}
                        onChange={(v) => update(i, 'period', v)}
                        // ปิดเวลาเริ่มที่ผ่านไปแล้ว
                        isStartBlocked={(t) => Boolean(s.date) && isPastTime(s.date, `${t}-`)}
                        disabled={disabled}
                    />
                    {/* ช่องแรกลบไม่ได้ ลบได้เฉพาะช่องที่เพิ่มเอง (ช่องแรกเว้นที่ว่างเท่าปุ่ม ให้ช่องวันที่กว้างเท่ากันทุกแถว) */}
                    {i > 0 ? (
                        <button type="button" onClick={() => remove(i)} disabled={disabled} aria-label="ลบช่วงเวลานี้" className="p-2 text-muted hover:text-red-600">
                            <Icon name="trash" className="w-4 h-4" />
                        </button>
                    ) : (
                        MAX_SLOTS > 1 && <span className="hidden sm:block w-8 shrink-0" aria-hidden="true" />
                    )}
                </div>
            ))}
            {rows.length < MAX_SLOTS && (
                <button type="button" onClick={add} disabled={disabled} className="self-start flex items-center gap-1.5 text-sm text-primary hover:underline">
                    <Icon name="plus" className="w-4 h-4" />
                    เพิ่มช่วงเวลาที่สะดวก (เลือกได้อีก {MAX_SLOTS - rows.length})
                </button>
            )}
            <p className="text-xs text-muted">
                เลือกได้สูงสุด {MAX_SLOTS} ตัวเลือก ช่วงยิ่งกว้างยิ่งนัดได้เร็ว
            </p>
        </div>
    )
}

// รายการช่วงเวลาที่ผู้เช่าสะดวก (อ่านอย่างเดียว ใช้ทั้งฝั่งผู้เช่าและแอดมิน) วันที่ผ่านไปแล้วขีดฆ่า
export function SlotList({ slots, allowEntry, note }) {
    const today = todayIso()
    return (
        <div className="flex flex-col gap-1.5 text-sm">
            {(slots ?? []).length === 0 && !allowEntry && <p className="text-muted">ผู้เช่าไม่ได้ระบุช่วงเวลา</p>}
            {(slots ?? []).map((s) => {
                const past = s.date < today
                return (
                    <div key={`${s.date}-${s.period}`} className={`flex items-center gap-2 ${past ? 'text-muted line-through' : 'text-ink'}`}>
                        <Icon name="calendar" className="w-4 h-4 text-secondary shrink-0" />
                        <span className="flex-1">{formatSlot(s.date, s.period)}</span>
                    </div>
                )
            })}
            {allowEntry && (
                <div className="flex items-center gap-2 text-emerald-700">
                    <Icon name="key" className="w-4 h-4 shrink-0" />
                    อนุญาตให้ช่างเข้าห้องได้แม้ผู้เช่าไม่อยู่
                </div>
            )}
            {note && <p className="text-muted whitespace-pre-line">หมายเหตุ: {note}</p>}
        </div>
    )
}

// กล่องแสดงวันนัดเข้าซ่อม (สถานะ proposed = รอผู้เช่ายืนยัน, confirmed = ยืนยันแล้ว)
export function AppointmentBox({ repair, children }) {
    if (!repair.appointment_date) return null
    const proposed = repair.appointment_state === 'proposed'
    return (
        <div className={`rounded-xl border-l-4 px-4 py-3 ${proposed ? 'bg-amber-50 border-amber-400' : 'bg-violet-50 border-violet-400'}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <Icon name="calendar" className="w-4 h-4" />
                <span className={proposed ? 'text-amber-800' : 'text-violet-800'}>
                    {proposed ? 'ผู้ดูแลเสนอวันเข้าซ่อม (รอผู้เช่ายืนยัน)' : 'นัดเข้าซ่อม (ยืนยันแล้ว)'}
                </span>
            </div>
            <div className="mt-1 text-base font-semibold text-ink">{formatSlot(repair.appointment_date, repair.appointment_period)}</div>
            <TechnicianInfo repair={repair} className="mt-0.5" />
            {children}
        </div>
    )
}

// ชื่อช่างและเบอร์โทร (กดโทรได้) ไม่มีชื่อช่าง = ไม่แสดง
export function TechnicianInfo({ repair, className = '' }) {
    if (!repair.technician) return null
    return (
        <div className={`text-sm text-muted flex flex-wrap items-center gap-x-2 ${className}`}>
            <span>ช่าง: <span className="text-ink">{repair.technician}</span></span>
            {repair.technician_phone && (
                <a href={`tel:${repair.technician_phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Icon name="phone" className="w-3.5 h-3.5" />
                    {repair.technician_phone}
                </a>
            )}
        </div>
    )
}
