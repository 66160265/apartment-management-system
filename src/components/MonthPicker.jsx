import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { currentMonth } from '../lib/billing'

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

const parse = (value) => {
    const [y, m] = value.split('-').map(Number)
    return { year: y, month: m }
}
const build = (year, month) => `${year}-${String(month).padStart(2, '0')}`

// ตัวเลือกเดือน: ปุ่ม ‹ › เลื่อนทีละเดือน กดตรงกลางเพื่อเลือกจากตารางเดือน
// marked = เดือน (YYYY-MM) ที่มีใบแจ้งหนี้แล้ว จะมีจุดกำกับในตาราง
function MonthPicker({ value, onChange, marked = [], disabled = false }) {
    const ref = useRef(null)
    const [open, setOpen] = useState(false)
    const [year, setYear] = useState(parse(value).year)

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

    const current = parse(value)
    const shift = (delta) => {
        const index = current.year * 12 + (current.month - 1) + delta
        onChange(build(Math.floor(index / 12), (index % 12) + 1))
    }
    const toggle = () => {
        setYear(current.year)
        setOpen(!open)
    }
    const pick = (m) => {
        onChange(build(year, m))
        setOpen(false)
    }

    const now = currentMonth()

    return (
        <div ref={ref} className="relative inline-block">
            <div className="flex items-stretch rounded-xl border border-line bg-white overflow-hidden">
                <button type="button" onClick={() => shift(-1)} disabled={disabled} aria-label="เดือนก่อนหน้า" className="px-2.5 hover:bg-mist/50 disabled:opacity-40"><Icon name="chevronLeft" className="w-4 h-4" /></button>
                <button
                    type="button"
                    onClick={toggle}
                    disabled={disabled}
                    aria-expanded={open}
                    className="flex items-center gap-2 min-w-40 px-3 py-1.5 text-sm font-medium text-primary-dark border-x border-line hover:bg-mist/30 disabled:opacity-70"
                >
                    <Icon name="calendar" className="w-4 h-4 text-primary" />
                    {MONTHS_FULL[current.month - 1]} {current.year + 543}
                </button>
                <button type="button" onClick={() => shift(1)} disabled={disabled} aria-label="เดือนถัดไป" className="px-2.5 hover:bg-mist/50 disabled:opacity-40"><Icon name="chevronRight" className="w-4 h-4" /></button>
            </div>

            {open && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-line p-3 z-30">
                    <div className="flex items-center justify-between mb-2">
                        <button type="button" onClick={() => setYear(year - 1)} aria-label="ปีก่อนหน้า" className="px-2.5 py-1.5 rounded-lg hover:bg-mist/50"><Icon name="chevronLeft" className="w-4 h-4" /></button>
                        <span className="font-medium text-primary-dark">{year + 543}</span>
                        <button type="button" onClick={() => setYear(year + 1)} aria-label="ปีถัดไป" className="px-2.5 py-1.5 rounded-lg hover:bg-mist/50"><Icon name="chevronRight" className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                        {MONTHS.map((name, i) => {
                            const key = build(year, i + 1)
                            const selected = key === value
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => pick(i + 1)}
                                    className={`relative py-2 rounded-lg text-sm ${
                                        selected
                                            ? 'bg-primary text-white'
                                            : key === now
                                                ? 'ring-1 ring-primary text-primary-dark hover:bg-mist/50'
                                                : 'hover:bg-mist/50'
                                    }`}
                                >
                                    {name}
                                    {marked.includes(key) && (
                                        <span className={`absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : 'bg-amber-500'}`} title="มีใบแจ้งหนี้แล้ว" />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-line text-xs text-muted">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> มีใบแจ้งหนี้แล้ว</span>
                        <button type="button" onClick={() => { onChange(now); setOpen(false) }} className="text-primary hover:underline">เดือนนี้</button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default MonthPicker
