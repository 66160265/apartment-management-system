import { useEffect, useState } from 'react'
import AvatarMenu from '../components/AvatarMenu'
import { supabase } from '../lib/supabaseClient'
import { roomStatuses } from '../data/rooms'

const emptyForm = { number: '', floor: '', status: 'vacant', rent: '', note: '' }

const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white'

function RoomModal({ title, initial, onSave, onCancel }) {
    const [form, setForm] = useState(initial)
    const [error, setError] = useState('')

    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

    const handleSubmit = (e) => {
        e.preventDefault()
        if (!String(form.number).trim() || !form.floor || !form.rent) {
            setError('กรุณากรอกเลขห้อง ชั้น และค่าเช่า')
            return
        }
        const err = onSave({
            ...form,
            number: String(form.number).trim(),
            floor: Number(form.floor),
            rent: Number(form.rent),
        })
        if (err) setError(err)
    }

    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-sm flex items-center justify-center z-50">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl w-[400px] max-w-[90vw] flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-primary-dark">{title}</h2>
                <div className="flex gap-4">
                    <label className="flex-1 text-sm text-muted">
                        เลขห้อง
                        <input className={inputClass} value={form.number} onChange={set('number')} />
                    </label>
                    <label className="flex-1 text-sm text-muted">
                        ชั้น
                        <input type="number" min="1" className={inputClass} value={form.floor} onChange={set('floor')} />
                    </label>
                </div>
                <label className="text-sm text-muted">
                    สถานะ
                    <select className={inputClass} value={form.status} onChange={set('status')}>
                        {roomStatuses.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
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
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className="border border-line text-muted hover:bg-sand px-4 py-1.5 rounded-lg">ยกเลิก</button>
                    <button type="submit" className="bg-primary hover:bg-primary-dark text-white px-4 py-1.5 rounded-lg">บันทึก</button>
                </div>
            </form>
        </div>
    )
}

function RoomsPage() {
    const [rooms, setRooms] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')

    const load = async () => {
        const { data, error } = await supabase.from('rooms').select('*')
        if (error) {
            setLoadError(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`)
        } else {
            setRooms(data.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })))
            setLoadError('')
        }
        setLoading(false)
    }

    useEffect(() => {
        load()
    }, [])
    // null = ปิด, 'new' = เพิ่มห้อง, ออบเจ็กต์ห้อง = แก้ไขห้องนั้น
    const [modal, setModal] = useState(null)

    const count = (status) => rooms.filter((r) => r.status === status).length
    const summary = [
        { label: 'ทั้งหมด', value: rooms.length },
        { label: 'มีผู้เช่า', value: count('occupied') },
        { label: 'ว่าง', value: count('vacant') },
        { label: 'ปรับปรุง', value: count('maintenance') },
    ]

    const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b)

    const handleSave = async (data) => {
        const editing = modal !== 'new' ? modal.number : null
        if (rooms.some((r) => r.number === data.number && r.number !== editing)) {
            return 'เลขห้องนี้มีอยู่แล้ว'
        }
        const { error } = editing
            ? await supabase.from('rooms').update(data).eq('number', editing)
            : await supabase.from('rooms').insert(data)
        if (error) return `บันทึกไม่สำเร็จ: ${error.message}`
        await load()
        setModal(null)
    }

    return (
        <>
            <div className="flex justify-between items-center p-6">
                <h1 className="text-2xl font-semibold text-primary-dark">จัดการห้องพัก</h1>
                <div className="flex items-center gap-4">
                    <button onClick={() => setModal('new')} className="bg-primary hover:bg-primary-dark transition-colors text-white px-4 py-2 rounded-xl shadow-card">
                        + เพิ่มห้องพัก
                    </button>
                    <AvatarMenu />
                </div>
            </div>

            <div className="mx-6 flex justify-around bg-white rounded-2xl shadow-card py-4">
                {summary.map((s) => (
                    <div key={s.label} className="text-center">
                        <div className="text-2xl font-semibold text-primary">{s.value}</div>
                        <div className="text-xs text-muted">{s.label}</div>
                    </div>
                ))}
            </div>

            <div className="mx-6 mt-2 flex gap-4 text-xs">
                {[roomStatuses[1], roomStatuses[0], roomStatuses[2]].map((s) => (
                    <span key={s.value} className="flex items-center gap-1">
                        <span className={`w-3 h-3 rounded-sm border ${s.color}`} />
                        {s.label}
                    </span>
                ))}
            </div>

            <div className="px-6 pb-6">
                {(loading || loadError) && (
                    <p className={`mt-5 text-center ${loadError ? 'text-red-600' : 'text-muted'}`}>
                        {loading ? 'กำลังโหลด...' : loadError}
                    </p>
                )}
                {floors.map((floor) => (
                    <section key={floor} className="mt-5">
                        <h2 className="mb-3 font-medium text-primary-dark">ชั้น {floor}</h2>
                        <div className="grid grid-cols-5 gap-4">
                            {rooms.filter((r) => r.floor === floor).map((room) => {
                                const status = roomStatuses.find((s) => s.value === room.status)
                                return (
                                    <button
                                        key={room.number}
                                        onClick={() => setModal(room)}
                                        title={`${status.label} · ${room.rent.toLocaleString()} บาท/เดือน`}
                                        className={`border rounded-xl py-4 text-lg font-medium text-ink shadow-card transition hover:-translate-y-0.5 hover:shadow-md ${status.color}`}
                                    >
                                        {room.number}
                                    </button>
                                )
                            })}
                        </div>
                    </section>
                ))}
            </div>

            {modal && (
                <RoomModal
                    key={modal === 'new' ? 'new' : modal.number}
                    title={modal === 'new' ? 'เพิ่มห้องใหม่' : `แก้ไขห้อง ${modal.number}`}
                    initial={modal === 'new' ? emptyForm : modal}
                    onSave={handleSave}
                    onCancel={() => setModal(null)}
                />
            )}
        </>
    )
}

export default RoomsPage;
