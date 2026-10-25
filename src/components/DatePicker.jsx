import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

// ชื่อเดือนแบบเต็ม/แบบย่อ และชื่อวันในสัปดาห์ (เริ่มวันอาทิตย์)
const MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

// เติม 0 ข้างหน้าให้ครบ 2 หลัก
const pad = (n) => String(n).padStart(2, '0')
// แปลงปี/เดือน (เริ่มที่ 0)/วัน เป็นข้อความ YYYY-MM-DD
const toIso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
// วันที่วันนี้ในรูปแบบ YYYY-MM-DD (เวลาท้องถิ่น)
const todayIso = () => {
    const d = new Date()
    return toIso(d.getFullYear(), d.getMonth(), d.getDate())
}
// แยกข้อความ YYYY-MM-DD เป็นปี/เดือน (เริ่มที่ 0)/วัน
const parse = (iso) => {
    const [y, m, d] = iso.split('-').map(Number)
    return { y, m: m - 1, d }
}

// ตัวเลือกวันที่ (ค่าเป็น YYYY-MM-DD) แทนช่อง type="date" ของเบราว์เซอร์
// min = วันที่เร็วสุดที่เลือกได้ (YYYY-MM-DD), align = ขอบของป๊อปอัปที่ชิดกับปุ่ม
function DatePicker({ value, onChange, min, align = 'left', placeholder = 'เลือกวันที่', disabled = false }) {
    // ref ของกล่องทั้งหมด (ตรวจคลิกนอกกล่อง), เปิดปฏิทินอยู่ไหม
    const ref = useRef(null)
    const [open, setOpen] = useState(false)
    // วันที่ตั้งต้น (ค่าที่เลือก หรือวันนี้) และเดือน/ปีที่ปฏิทินกำลังแสดง
    const base = value ? parse(value) : parse(todayIso())
    const [view, setView] = useState({ y: base.y, m: base.m })

    // ขณะเปิดปฏิทิน: คลิกด้านนอกหรือกด Esc ให้ปิด
    useEffect(() => {
        if (!open) return
        // ปฏิทินลอยอยู่ล่างจอ: เลื่อนหน้าให้เห็นทั้งก้อน (ไม่ต้องให้ผู้ใช้เลื่อนหาเอง)
        const frame = requestAnimationFrame(() => ref.current?.querySelector('[data-popover]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
        // คลิกนอกปฏิทินให้ปิด
        const onClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        // กด Esc ให้ปิดปฏิทิน
        const onKey = (e) => e.key === 'Escape' && setOpen(false)
        document.addEventListener('mousedown', onClick)
        document.addEventListener('keydown', onKey)
        return () => {
            cancelAnimationFrame(frame)
            document.removeEventListener('mousedown', onClick)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    // เปิด/ปิดปฏิทิน ตอนเปิดให้แสดงเดือนของวันที่ที่เลือกอยู่
    const toggle = () => {
        if (!open) setView({ y: base.y, m: base.m })
        setOpen(!open)
    }

    // เลื่อนเดือนที่แสดงไปข้างหน้า/ย้อนหลังตาม delta
    const shiftMonth = (delta) => {
        const index = view.y * 12 + view.m + delta
        setView({ y: Math.floor(index / 12), m: index % 12 })
    }

    // เลือกวันที่แล้วปิดปฏิทิน
    const pick = (iso) => {
        onChange(iso)
        setOpen(false)
    }

    // ตารางวันของเดือนที่แสดง: ช่องว่างนำหน้าตามวันแรกของเดือน
    const firstWeekday = new Date(view.y, view.m, 1).getDay()
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
    const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

    // วันนี้ และรายการปีให้เลือก (ย้อนหลัง/ล่วงหน้า 10 ปีจากวันที่ตั้งต้น)
    const today = todayIso()
    const years = Array.from({ length: 21 }, (_, i) => base.y - 10 + i)
    if (!years.includes(view.y)) years.push(view.y)
    years.sort((a, b) => a - b)

    // ข้อความบนปุ่ม เช่น 5 ต.ค. 2569 (ยังไม่เลือกแสดง placeholder)
    const display = value ? `${parse(value).d} ${MONTHS_SHORT[parse(value).m]} ${parse(value).y + 543}` : placeholder

    return (
        <div ref={ref} className="relative mt-1">
            {/* ปุ่มแสดงวันที่ที่เลือก กดเพื่อเปิดปฏิทิน */}
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

            {/* ป็อปอัปปฏิทิน */}
            {/* จอมือถือ: เด้งขึ้นเป็นแผ่นด้านล่างจอพร้อมฉากมืด (ไม่ให้ปฏิทินหลุดขอบจอ/อยู่ใต้นิ้ว) จอกว้างขึ้น: ลอยใต้ช่องเหมือนเดิม */}
            {open && (
                <>
                <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
                <div data-popover className={`fixed inset-x-3 bottom-3 z-50 mx-auto max-w-sm sm:absolute sm:inset-x-auto sm:bottom-auto sm:z-40 sm:mx-0 sm:mt-2 sm:w-72 sm:max-w-none bg-white rounded-2xl shadow-xl border border-line p-3 ${align === 'right' ? 'sm:right-0' : 'sm:left-0'}`}>
                    {/* แถบเลือกเดือน/ปี: ‹ เดือน ปี › */}
                    <div className="flex items-center gap-1 mb-2">
                        <button type="button" onClick={() => shiftMonth(-1)} aria-label="เดือนก่อนหน้า" className="p-2.5 sm:p-1.5 rounded-lg hover:bg-mist/50">
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
                        <button type="button" onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป" className="p-2.5 sm:p-1.5 rounded-lg hover:bg-mist/50">
                            <Icon name="chevronRight" className="w-4 h-4" />
                        </button>
                    </div>

                    {/* หัวตาราง: ชื่อวัน (วันอาทิตย์สีแดง) */}
                    <div className="grid grid-cols-7 text-center text-xs text-muted mb-1">
                        {WEEKDAYS.map((w, i) => (
                            <span key={w} className={`py-1 ${i === 0 ? 'text-red-400' : ''}`}>{w}</span>
                        ))}
                    </div>
                    {/* ช่องวันที่: วันที่เลือกพื้นทึบ วันก่อน min กดไม่ได้ วันนี้มีกรอบ */}
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
                                    className={`mx-auto w-10 h-10 sm:w-9 sm:h-9 rounded-full text-sm transition-colors ${
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

                    {/* ปุ่มเลือกวันนี้ และปิดปฏิทิน */}
                    <div className="flex justify-between mt-2 pt-2 border-t border-line text-xs">
                        <button type="button" onClick={() => pick(today)} disabled={min && today < min} className="text-primary hover:underline disabled:opacity-40 disabled:no-underline py-2 px-1 sm:py-0 sm:px-0 text-sm sm:text-xs">วันนี้</button>
                        <button type="button" onClick={() => setOpen(false)} className="text-muted hover:underline py-2 px-1 sm:py-0 sm:px-0 text-sm sm:text-xs">ปิด</button>
                    </div>
                </div>
                </>
            )}
        </div>
    )
}

export default DatePicker
