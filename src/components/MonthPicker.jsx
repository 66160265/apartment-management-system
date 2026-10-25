import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { currentMonth } from '../lib/billing'

// ชื่อเดือนแบบย่อ (ใช้ในตาราง) และแบบเต็ม (ใช้บนปุ่ม)
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

// แยกข้อความ YYYY-MM เป็นปีและเดือน
const parse = (value) => {
    const [y, m] = value.split('-').map(Number)
    return { year: y, month: m }
}
// รวมปีและเดือนกลับเป็นข้อความ YYYY-MM
const build = (year, month) => `${year}-${String(month).padStart(2, '0')}`

// ตัวเลือกเดือน: ปุ่ม ‹ › เลื่อนทีละเดือน กดตรงกลางเพื่อเลือกจากตารางเดือน
// marked = เดือน (YYYY-MM) ที่มีใบแจ้งหนี้แล้ว จะมีจุดกำกับในตาราง
function MonthPicker({ value, onChange, marked = [], disabled = false }) {
    // ref ของกล่องทั้งหมด (ใช้ตรวจคลิกนอกกล่อง), เปิดตารางอยู่ไหม, และปีที่กำลังดูในตาราง
    const ref = useRef(null)
    const [open, setOpen] = useState(false)
    const [year, setYear] = useState(parse(value).year)

    // ขณะเปิดตารางเดือน: คลิกด้านนอกหรือกด Esc ให้ปิด
    useEffect(() => {
        if (!open) return
        // ปฏิทินลอยอยู่ล่างจอ: เลื่อนหน้าให้เห็นทั้งก้อน (ไม่ต้องให้ผู้ใช้เลื่อนหาเอง)
        const frame = requestAnimationFrame(() => ref.current?.querySelector('[data-popover]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
        // คลิกนอกตารางเดือนให้ปิด
        const onClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        // กด Esc ให้ปิดตารางเดือน
        const onKey = (e) => e.key === 'Escape' && setOpen(false)
        document.addEventListener('mousedown', onClick)
        document.addEventListener('keydown', onKey)
        return () => {
            cancelAnimationFrame(frame)
            document.removeEventListener('mousedown', onClick)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    // เดือนที่เลือกอยู่ (แยกเป็นปี/เดือน)
    const current = parse(value)
    // เลื่อนเดือนที่เลือกไปข้างหน้า/ย้อนหลังตาม delta (ข้ามปีให้อัตโนมัติ)
    const shift = (delta) => {
        const index = current.year * 12 + (current.month - 1) + delta
        onChange(build(Math.floor(index / 12), (index % 12) + 1))
    }
    // เปิด/ปิดตารางเดือน โดยเริ่มแสดงที่ปีของเดือนที่เลือกอยู่
    const toggle = () => {
        setYear(current.year)
        setOpen(!open)
    }
    // เลือกเดือนจากตารางแล้วปิด
    const pick = (m) => {
        onChange(build(year, m))
        setOpen(false)
    }

    // เดือนปัจจุบัน (ใช้ไฮไลต์ในตารางและปุ่ม "เดือนนี้")
    const now = currentMonth()

    return (
        <div ref={ref} className="relative inline-block">
            {/* แถบหลัก: ‹ เดือนก่อน | ชื่อเดือน ปี พ.ศ. (กดเปิดตาราง) | เดือนถัดไป › */}
            <div className="flex items-stretch rounded-xl border border-line bg-white overflow-hidden">
                <button type="button" onClick={() => shift(-1)} disabled={disabled} aria-label="เดือนก่อนหน้า" className="px-3.5 sm:px-2.5 hover:bg-mist/50 disabled:opacity-40"><Icon name="chevronLeft" className="w-4 h-4" /></button>
                <button
                    type="button"
                    onClick={toggle}
                    disabled={disabled}
                    aria-expanded={open}
                    className="flex items-center gap-2 min-w-40 px-3 py-2.5 sm:py-1.5 text-sm font-medium text-primary-dark border-x border-line hover:bg-mist/30 disabled:opacity-70"
                >
                    <Icon name="calendar" className="w-4 h-4 text-primary" />
                    {MONTHS_FULL[current.month - 1]} {current.year + 543}
                </button>
                <button type="button" onClick={() => shift(1)} disabled={disabled} aria-label="เดือนถัดไป" className="px-3.5 sm:px-2.5 hover:bg-mist/50 disabled:opacity-40"><Icon name="chevronRight" className="w-4 h-4" /></button>
            </div>

            {/* ตารางเลือกเดือน */}
            {/* จอมือถือ: เด้งขึ้นเป็นแผ่นล่างพร้อมฉากมืด จอกว้างขึ้น: ลอยใต้ปุ่มชิดขวาเหมือนเดิม */}
            {open && (
                <>
                <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
                <div data-popover className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-sm sm:absolute sm:inset-x-auto sm:bottom-auto sm:z-30 sm:mx-0 sm:right-0 sm:mt-2 sm:w-72 sm:max-w-none bg-white rounded-2xl shadow-xl border border-line p-3">
                    {/* เลื่อนปีที่แสดงในตาราง */}
                    <div className="flex items-center justify-between mb-2">
                        <button type="button" onClick={() => setYear(year - 1)} aria-label="ปีก่อนหน้า" className="px-3.5 py-2.5 sm:px-2.5 sm:py-1.5 rounded-lg hover:bg-mist/50"><Icon name="chevronLeft" className="w-4 h-4" /></button>
                        <span className="font-medium text-primary-dark">{year + 543}</span>
                        <button type="button" onClick={() => setYear(year + 1)} aria-label="ปีถัดไป" className="px-3.5 py-2.5 sm:px-2.5 sm:py-1.5 rounded-lg hover:bg-mist/50"><Icon name="chevronRight" className="w-4 h-4" /></button>
                    </div>
                    {/* ปุ่ม 12 เดือน: เดือนที่เลือกพื้นทึบ เดือนปัจจุบันมีกรอบ เดือนที่มีใบแจ้งหนี้มีจุดสีส้ม */}
                    <div className="grid grid-cols-3 gap-1.5">
                        {MONTHS.map((name, i) => {
                            const key = build(year, i + 1)
                            const selected = key === value
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => pick(i + 1)}
                                    className={`relative py-2.5 sm:py-2 rounded-lg text-sm ${
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
                    {/* คำอธิบายจุดสีส้ม และปุ่มกลับไปเดือนนี้ */}
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-line text-xs text-muted">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> มีใบแจ้งหนี้แล้ว</span>
                        <button type="button" onClick={() => { onChange(now); setOpen(false) }} className="text-primary hover:underline">เดือนนี้</button>
                    </div>
                </div>
                </>
            )}
        </div>
    )
}

export default MonthPicker
