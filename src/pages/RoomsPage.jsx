import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import { baht } from '../lib/billing'
import { useRealtimeReload } from '../lib/realtime'
import { supabase } from '../lib/supabaseClient'
import { SkeletonCardGrid } from '../components/Skeleton.jsx'

// คลาส Tailwind ของช่องกรอกในฟอร์ม
const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white'

// ป้าย สี และกรอบการ์ดของสถานะห้องแต่ละแบบ
const statuses = {
    occupied: { label: 'มีผู้เช่า', badge: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200', dot: 'bg-sky-500', card: 'border-sky-200 hover:border-sky-400' },
    vacant: { label: 'ว่าง', badge: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200', dot: 'bg-emerald-500', card: 'border-emerald-200 hover:border-emerald-400' },
    maintenance: { label: 'ปรับปรุง', badge: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', dot: 'bg-amber-500', card: 'border-amber-200 hover:border-amber-400' },
}

// การ์ดสรุปด้านบน (กดเพื่อกรองห้องตามสถานะ)
const summaryCards = [
    { value: 'all', label: 'ห้องทั้งหมด', icon: 'building', tone: 'bg-slate-100 text-slate-600' },
    { value: 'occupied', label: 'มีผู้เช่า', icon: 'users', tone: 'bg-sky-50 text-sky-700' },
    { value: 'vacant', label: 'ห้องว่าง', icon: 'door', tone: 'bg-emerald-50 text-emerald-700' },
    { value: 'maintenance', label: 'ปรับปรุง', icon: 'wrench', tone: 'bg-amber-50 text-amber-700' },
]

// หน้าต่างแก้ไขห้องเดิม (ไม่มีเพิ่ม/ลบห้องในหน้าเว็บ)
function RoomModal({ title, initial, onSave, onCancel }) {
    // ค่าในฟอร์ม, error, กำลังบันทึก
    const [form, setForm] = useState(initial)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    // สร้างฟังก์ชันจัดการ onChange ของช่องในฟอร์มตาม key และล้างข้อความ error
    const set = (key) => (e) => {
        setForm({ ...form, [key]: e.target.value })
        setError('')
    }

    // ตรวจว่ากรอกเลขห้อง ชั้น และค่าเช่าครบ แล้วส่งไปบันทึก
    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!String(form.number).trim() || !form.floor || form.rent === '') {
            setError('กรุณากรอกเลขห้อง ชั้น และค่าเช่า')
            return
        }
        setSaving(true)
        const err = await onSave({
            ...form,
            number: String(form.number).trim(),
            floor: Number(form.floor),
            rent: Number(form.rent),
        })
        setSaving(false)
        if (err) setError(err)
    }

    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl w-[440px] max-w-full max-h-[92vh] overflow-y-auto flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-primary-dark">{title}</h2>
                {/* เลขห้องและชั้น */}
                <div className="grid grid-cols-2 gap-4">
                    <label className="text-sm text-muted">
                        เลขห้อง
                        <input className={inputClass} value={form.number} onChange={set('number')} autoFocus />
                    </label>
                    <label className="text-sm text-muted">
                        ชั้น
                        <input type="number" min="1" className={inputClass} value={form.floor} onChange={set('floor')} />
                    </label>
                </div>
                {/* สถานะ ค่าเช่า และหมายเหตุ */}
                <label className="text-sm text-muted">
                    สถานะ
                    <select className={inputClass} value={form.status} onChange={set('status')}>
                        {Object.entries(statuses).map(([value, s]) => (
                            <option key={value} value={value}>{s.label}</option>
                        ))}
                    </select>
                </label>
                <label className="text-sm text-muted">
                    ค่าเช่า/เดือน (บาท)
                    <input type="number" min="0" className={inputClass} value={form.rent} onChange={set('rent')} />
                </label>
                <label className="text-sm text-muted">
                    หมายเหตุ
                    <textarea rows="3" className={inputClass} value={form.note} onChange={set('note')} />
                </label>
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className="border border-line text-muted hover:bg-sand px-5 py-2 rounded-xl">ยกเลิก</button>
                    <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-6 py-2 rounded-xl shadow-card">
                        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                    </button>
                </div>
            </form>
        </div>
    )
}

// ดึงรายการห้องทั้งหมดพร้อมชื่อผู้เช่าของแต่ละห้อง
const fetchRooms = () =>
    Promise.all([supabase.from('rooms').select('*'), supabase.from('tenants').select('room, name')])

// หน้าจัดการห้องพักของแอดมิน: ดูห้องแยกตามชั้น กรองตามสถานะ และแก้ไขข้อมูลห้อง
function RoomsPage() {
    const [rooms, setRooms] = useState([])
    // ห้อง -> ชื่อผู้เช่า (แสดงบนการ์ดห้อง)
    const [tenantNames, setTenantNames] = useState({})
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [filter, setFilter] = useState('all')
    // null = ปิด, ออบเจ็กต์ห้อง = แก้ไขห้องนั้น
    const [modal, setModal] = useState(null)

    // เรียงห้องตามเลขห้อง และสร้างแผนที่ ห้อง -> ชื่อผู้เช่า
    const applyResult = useCallback(([roomsRes, tenantsRes]) => {
        if (roomsRes.error) {
            setLoadError(`โหลดข้อมูลไม่สำเร็จ: ${roomsRes.error.message}`)
        } else {
            setRooms(roomsRes.data.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })))
            setTenantNames(Object.fromEntries((tenantsRes.data ?? []).map((t) => [t.room, t.name])))
            setLoadError('')
        }
        setLoading(false)
    }, [])

    // โหลดรายการห้องใหม่ (ใช้หลังบันทึก)
    const load = async () => applyResult(await fetchRooms())

    // อัปเดตเองเมื่อห้องหรือผู้เช่าเปลี่ยน (เช่น เพิ่ม/ลบผู้เช่า เปลี่ยนสถานะห้อง)
    useRealtimeReload(['rooms', 'tenants'], load)

    // โหลดรายการห้องครั้งแรกเมื่อเปิดหน้า
    useEffect(() => {
        let active = true
        fetchRooms().then((result) => {
            if (active) applyResult(result)
        })
        return () => {
            active = false
        }
    }, [applyResult])

    // นับจำนวนห้องตามสถานะ ('all' = ทั้งหมด)
    const count = (status) => rooms.filter((r) => status === 'all' || r.status === status).length
    // ห้องที่ผ่านตัวกรอง และรายการชั้นที่มีห้องให้แสดง
    const visible = rooms.filter((r) => filter === 'all' || r.status === filter)
    const floors = [...new Set(visible.map((r) => r.floor))].sort((a, b) => a - b)

    // บันทึกการแก้ไขห้อง: กันเลขห้องซ้ำ
    const handleSave = async (data) => {
        const editing = modal.number
        if (rooms.some((r) => r.number === data.number && r.number !== editing)) {
            return 'เลขห้องนี้มีอยู่แล้ว'
        }
        // ห้องที่มีผู้เช่า: เปลี่ยนเลขห้องไม่ได้ (ชื่อผู้ใช้ผูกกับเลขห้อง) และสถานะต้องเป็น "มีผู้เช่า"
        if (tenantNames[editing]) {
            if (data.number !== editing) return 'ห้องนี้มีผู้เช่าอยู่ ไม่สามารถเปลี่ยนเลขห้องได้'
            if (data.status !== 'occupied') return 'ห้องนี้มีผู้เช่าอยู่ สถานะต้องเป็น "มีผู้เช่า" (หากผู้เช่าย้ายออก ให้ลบผู้เช่าก่อน)'
        }
        const { error } = await supabase.from('rooms').update(data).eq('number', editing)
        if (error) return `บันทึกไม่สำเร็จ: ${error.message}`
        await load()
        setModal(null)
    }

    return (
        <>
            <PageHeader
                title="จัดการห้องพัก"
                subtitle="ดูสถานะของทุกห้อง ค่าเช่า และผู้เช่าที่พักอยู่"
            />

            <div className="px-4 sm:px-6 pb-10 flex flex-col gap-6">
                {/* การ์ดสรุปจำนวนห้องตามสถานะ (ทำหน้าที่เป็นตัวกรอง) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {summaryCards.map((c) => {
                        const active = filter === c.value
                        return (
                            <button
                                key={c.value}
                                onClick={() => setFilter(c.value)}
                                aria-pressed={active}
                                className={`text-left rounded-2xl p-4 bg-white shadow-card border-2 transition ${active ? 'border-primary' : 'border-transparent hover:border-mist'}`}
                            >
                                <div className="flex items-center justify-between text-sm text-muted">
                                    <span>{c.label}</span>
                                    <span className={`grid place-items-center w-8 h-8 rounded-lg ${c.tone}`}><Icon name={c.icon} className="w-[18px] h-[18px]" /></span>
                                </div>
                                <div className="mt-2 flex items-baseline gap-2">
                                    <span className="text-2xl font-semibold text-primary-dark">{count(c.value)}</span>
                                    <span className="text-xs text-muted">ห้อง</span>
                                </div>
                            </button>
                        )
                    })}
                </div>

                {/* ข้อความกำลังโหลด / error / ไม่มีห้อง */}
                {(loading || loadError || visible.length === 0) && (
                    <div className={`bg-white rounded-2xl shadow-card py-14 text-center ${loadError ? 'text-red-600' : 'text-muted'}`}>
                        {loading ? <SkeletonCardGrid count={8} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 p-4 text-left" /> : loadError || 'ไม่พบห้องในหมวดนี้'}
                    </div>
                )}

                {/* ห้องแยกตามชั้น: การ์ดห้องแสดงเลขห้อง สถานะ ผู้เช่า และค่าเช่า (กดเพื่อแก้ไข) */}
                {floors.map((floor) => (
                    <section key={floor}>
                        <h2 className="flex items-center gap-2 mb-3 font-medium text-primary-dark">
                            ชั้น {floor}
                            <span className="text-xs font-normal text-muted bg-white rounded-full px-2 py-0.5 ring-1 ring-line">
                                {visible.filter((r) => r.floor === floor).length} ห้อง
                            </span>
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                            {visible.filter((r) => r.floor === floor).map((room) => {
                                const s = statuses[room.status] ?? statuses.vacant
                                const tenant = tenantNames[room.number]
                                return (
                                    <button
                                        key={room.number}
                                        onClick={() => setModal(room)}
                                        className={`text-left bg-white rounded-2xl border-2 p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-md ${s.card}`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="text-2xl font-semibold text-primary-dark">{room.number}</span>
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${s.badge}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                                                {s.label}
                                            </span>
                                        </div>
                                        <div className="mt-3 text-sm text-ink truncate min-h-5">
                                            {tenant || <span className="text-muted">{room.status === 'maintenance' ? 'กำลังปรับปรุง' : 'ยังไม่มีผู้เช่า'}</span>}
                                        </div>
                                        <div className="mt-1 text-xs text-muted tabular-nums">{baht(room.rent)} / เดือน</div>
                                    </button>
                                )
                            })}
                        </div>
                    </section>
                ))}
            </div>

            {/* หน้าต่างแก้ไขห้อง */}
            {modal && (
                <RoomModal
                    key={modal.number}
                    title={`แก้ไขห้อง ${modal.number}`}
                    initial={modal}
                    onSave={handleSave}
                    onCancel={() => setModal(null)}
                />
            )}
        </>
    )
}

export default RoomsPage
