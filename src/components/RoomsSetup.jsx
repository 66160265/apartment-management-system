import { useState } from 'react'
import { baht } from '../lib/billing'
import { buildRooms, MAX_FLOORS, MAX_ROOMS_PER_FLOOR, validateSetup } from '../lib/rooms'

// คลาส Tailwind ของช่องกรอกในฟอร์ม
const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white'

// ฟอร์มตั้งค่าห้องพักครั้งแรก (แสดงเมื่อยังไม่มีห้องเลย): กรอกจำนวนชั้น ห้องต่อชั้น และค่าเช่าเริ่มต้น
// onCreate(rooms) สร้างห้องทั้งหมดแล้วคืนข้อความ error (ถ้ามี)
function RoomsSetup({ onCreate }) {
    const [form, setForm] = useState({ floors: '4', perFloor: '5', rent: '4500' })
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    // สร้างฟังก์ชันจัดการ onChange ของช่องในฟอร์มตาม key และล้างข้อความ error
    const set = (key) => (e) => {
        setForm({ ...form, [key]: e.target.value })
        setError('')
    }

    // ตัวอย่างเลขห้องที่จะได้ (แสดงใต้ฟอร์ม) เมื่อค่าที่กรอกใช้ได้
    const valid = !validateSetup(form)
    const preview = valid ? buildRooms(form) : []

    // ตรวจค่าแล้วสร้างห้องทั้งหมด
    const handleSubmit = async (e) => {
        e.preventDefault()
        const problem = validateSetup(form)
        if (problem) {
            setError(problem)
            return
        }
        setSaving(true)
        const err = await onCreate(buildRooms(form))
        setSaving(false)
        if (err) setError(err)
    }

    return (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-card p-4 sm:p-6 max-w-xl w-full mx-auto flex flex-col gap-4">
            <div>
                <h2 className="text-lg font-semibold text-primary-dark">ตั้งค่าห้องพักครั้งแรก</h2>
                <p className="text-sm text-muted mt-1">ยังไม่มีห้องในระบบ กรอกโครงสร้างของหอพักเพื่อสร้างห้องทั้งหมด ตั้งได้ครั้งเดียว ภายหลังแก้ค่าเช่าและสถานะรายห้องได้ในหน้านี้</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <label className="text-sm text-muted">
                    จำนวนชั้น
                    <input type="number" min="1" max={MAX_FLOORS} className={inputClass} value={form.floors} onChange={set('floors')} autoFocus />
                </label>
                <label className="text-sm text-muted">
                    ห้องต่อชั้น
                    <input type="number" min="1" max={MAX_ROOMS_PER_FLOOR} className={inputClass} value={form.perFloor} onChange={set('perFloor')} />
                </label>
            </div>
            <label className="text-sm text-muted">
                ค่าเช่าเริ่มต้น/เดือน (บาท)
                <input type="number" min="0" className={inputClass} value={form.rent} onChange={set('rent')} />
            </label>
            {/* สรุปสิ่งที่จะถูกสร้าง */}
            {valid && (
                <p className="text-sm text-ink bg-sand/60 rounded-xl px-4 py-2">
                    จะสร้าง {preview.length} ห้อง ({preview[0].number} ถึง {preview[preview.length - 1].number}) ค่าเช่า {baht(form.rent)} / เดือน
                </p>
            )}
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            <div className="flex justify-end">
                <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-6 py-2 rounded-xl shadow-card">
                    {saving ? 'กำลังสร้างห้อง...' : 'สร้างห้องทั้งหมด'}
                </button>
            </div>
        </form>
    )
}

export default RoomsSetup
