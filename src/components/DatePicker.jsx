import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

const MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

const pad = (n) => String(n).padStart(2, '0')
const toIso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const todayIso = () => {
    const d = new Date()
    return toIso(d.getFullYear(), d.getMonth(), d.getDate())
}
const parse = (iso) => {
    const [y, m, d] = iso.split('-').map(Number)
    return { y, m: m - 1, d }
}

// ตัวเลือกวันที่ (ค่าเป็น YYYY-MM-DD) แทนช่อง type="date" ของเบราว์เซอร์
// min = วันที่เร็วสุดที่เลือกได้ (YYYY-MM-DD), align = ขอบของป๊อปอัปที่ชิดกับปุ่ม
function DatePicker({ value, onChange, min, align = 'left', placeholder = 'เลือกวันที่', disabled = false }) {
    const ref = useRef(null)
    const [open, setOpen] = useState(false)
    const base = value ? parse(value) : parse(todayIso())
    const [view, setView] = useState({ y: base.y, m: base.m })

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

    const toggle = () => {
        if (!open) setView({ y: base.y, m: base.m })
        setOpen(!open)
    }

    const shiftMonth = (delta) => {
        const index = view.y * 12 + view.m + delta
        setView({ y: Math.floor(index / 12), m: index % 12 })
    }

    const pick = (iso) => {
        onChange(iso)
        setOpen(false)
    }

    // ตารางวันของเดือนที่แสดง: ช่องว่างนำหน้าตามวันแรกของเดือน
    const firstWeekday = new Date(view.y, view.m, 1).getDay()
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
    const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

    const today = todayIso()
    const years = Array.from({ length: 21 }, (_, i) => base.y - 10 + i)
    if (!years.includes(view.y)) years.push(view.y)
    years.sort((a, b) => a - b)

    const display = value ? `${parse(value).d} ${MONTHS_SHORT[parse(value).m]} ${parse(value).y + 543}` : placeholder

    return (
        <div ref={ref} className="relative mt-1">
            <button
                type="button"
                onClick={toggle}
                disabled={disabled}
                aria-expanded={open}
                className={`w-full flex items-center justify-between gap-2 border rounded-xl px-3 py-2 text-left bg-sand/50 outline-none hover:bg-white disabled:opacity-70 ${
                    open ? 'border-secondary bg-white' : 'border-line'
                }`}
            >
                <span className={value ? 'text-ink' : 'text-muted'}>{display}</span>
                <Icon name="calendar" className="w-4 h-4 text-primary" />
            </button>

            {open && (
                <div className={`absolute z-40 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-line p-3 ${align === 'right' ? 'right-0' : 'left-0'}`}>
                    <div className="flex items-center gap-1 mb-2">
                        <button type="button" onClick={() => shiftMonth(-1)} aria-label="เดือนก่อนหน้า" className="p-1.5 rounded-lg hover:bg-mist/50">
                            <Icon name="chevronLeft" className="w-4 h-4" />
                        </button>
                        <select
                            value={view.m}
                            onChange={(e) => setView({ ...view, m: Number(e.target.value) })}
                            aria-label="เดือน"
                            className="flex-1 min-w-0 text-sm font-medium text-primary-dark bg-transparent rounded-lg px-1 py-1 hover:bg-mist/40 outline-none"
                        >
                            {MONTHS_FULL.map((name, i) => (
                                <option key={name} value={i}>{name}</option>
                            ))}
                        </select>
                        <select
                            value={view.y}
                            onChange={(e) => setView({ ...view, y: Number(e.target.value) })}
                            aria-label="ปี"
                            className="text-sm font-medium text-primary-dark bg-transparent rounded-lg px-1 py-1 hover:bg-mist/40 outline-none"
                        >
                            {years.map((y) => (
                                <option key={y} value={y}>{y + 543}</option>
                            ))}
                        </select>
                        <button type="button" onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป" className="p-1.5 rounded-lg hover:bg-mist/50">
                            <Icon name="chevronRight" className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 text-center text-xs text-muted mb-1">
                        {WEEKDAYS.map((w, i) => (
                            <span key={w} className={`py-1 ${i === 0 ? 'text-red-400' : ''}`}>{w}</span>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-y-0.5">
                        {cells.map((day, i) => {
                            if (!day) return <span key={`blank-${i}`} />
                            const iso = toIso(view.y, view.m, day)
                            const selected = iso === value
                            const blocked = min && iso < min
                            return (
                                <button
                                    key={iso}
                                    type="button"
                                    disabled={blocked}
                                    onClick={() => pick(iso)}
                                    className={`mx-auto w-9 h-9 rounded-full text-sm transition-colors ${
                                        selected
                                            ? 'bg-primary text-white font-medium'
                                            : blocked
                                                ? 'text-line cursor-not-allowed'
                                                : iso === today
                                                    ? 'ring-1 ring-primary text-primary-dark hover:bg-mist/50'
                                                    : 'text-ink hover:bg-mist/50'
                                    }`}
                                >
                                    {day}
                                </button>
                            )
                        })}
                    </div>

                    <div className="flex justify-between mt-2 pt-2 border-t border-line text-xs">
                        <button type="button" onClick={() => pick(today)} disabled={min && today < min} className="text-primary hover:underline disabled:opacity-40 disabled:no-underline">วันนี้</button>
                        <button type="button" onClick={() => setOpen(false)} className="text-muted hover:underline">ปิด</button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default DatePicker
