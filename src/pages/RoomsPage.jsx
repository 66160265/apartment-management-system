import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import { baht } from '../lib/billing'
import { supabase } from '../lib/supabaseClient'

const emptyForm = { number: '', floor: '', status: 'vacant', rent: '', note: '' }

const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white'

const statuses = {
    occupied: { label: 'มีผู้เช่า', badge: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200', dot: 'bg-sky-500', card: 'border-sky-200 hover:border-sky-400' },
    vacant: { label: 'ว่าง', badge: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200', dot: 'bg-emerald-500', card: 'border-emerald-200 hover:border-emerald-400' },
    maintenance: { label: 'ปรับปรุง', badge: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', dot: 'bg-amber-500', card: 'border-amber-200 hover:border-amber-400' },
}

const summaryCards = [
    { value: 'all', label: 'ห้องทั้งหมด', icon: 'building', tone: 'bg-slate-100 text-slate-600' },
    { value: 'occupied', label: 'มีผู้เช่า', icon: 'users', tone: 'bg-sky-50 text-sky-700' },
    { value: 'vacant', label: 'ห้องว่าง', icon: 'door', tone: 'bg-emerald-50 text-emerald-700' },
    { value: 'maintenance', label: 'ปรับปรุง', icon: 'wrench', tone: 'bg-amber-50 text-amber-700' },
]

// onDelete มีเฉพาะตอนแก้ไขห้องเดิม tenantName = ชื่อผู้เช่าของห้องนี้ (ถ้ามี ลบไม่ได้)
function RoomModal({ title, initial, tenantName, onSave, onDelete, onCancel }) {
    const [form, setForm] = useState(initial)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const set = (key) => (e) => {
        setForm({ ...form, [key]: e.target.value })
        setError('')
    }

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

    const handleDelete = async () => {
        setDeleting(true)
        const err = await onDelete(initial)
        setDeleting(false)
        if (err) {
            setConfirming(false)
            setError(err)
        }
    }

    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl w-[440px] max-w-full max-h-[92vh] overflow-y-auto flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-primary-dark">{title}</h2>
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
                {confirming ? (
                    <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-4 flex flex-col gap-3">
                        <p className="text-sm text-red-900">
                            ลบห้อง <b>{initial.number}</b> ออกจากระบบถาวร การลบไม่สามารถกู้คืนได้
                        </p>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setConfirming(false)} disabled={deleting} className="border border-line bg-white text-muted hover:bg-sand px-4 py-1.5 rounded-xl">ยกเลิก</button>
                            <button type="button" onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-4 py-1.5 rounded-xl">
                                {deleting ? 'กำลังลบ...' : 'ยืนยันลบห้อง'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-between gap-2">
                        {onDelete ? (
                            <button
                                type="button"
                                onClick={() => setConfirming(true)}
                                disabled={!!tenantName}
                                title={tenantName ? `ห้องนี้มีผู้เช่า (${tenantName}) ต้องลบผู้เช่าออกก่อน` : undefined}
                                className="border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent px-4 py-2 rounded-xl"
                            >
                                ลบห้อง
                            </button>
                        ) : (
                            <span />
                        )}
                        <div className="flex gap-2">
                            <button type="button" onClick={onCancel} className="border border-line text-muted hover:bg-sand px-5 py-2 rounded-xl">ยกเลิก</button>
                            <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-6 py-2 rounded-xl shadow-card">
                                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                            </button>
                        </div>
                    </div>
                )}
                {onDelete && tenantName && !confirming && (
                    <p className="text-xs text-muted -mt-2">ห้องนี้มีผู้เช่า ({tenantName}) จึงลบห้องไม่ได้ ต้องลบผู้เช่าออกก่อน</p>
                )}
            </form>
        </div>
    )
}

const fetchRooms = () =>
    Promise.all([supabase.from('rooms').select('*'), supabase.from('tenants').select('room, name')])

function RoomsPage() {
    const [rooms, setRooms] = useState([])
    // ห้อง -> ชื่อผู้เช่า (แสดงบนการ์ดห้อง)
    const [tenantNames, setTenantNames] = useState({})
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [filter, setFilter] = useState('all')
    // null = ปิด, 'new' = เพิ่มห้อง, ออบเจ็กต์ห้อง = แก้ไขห้องนั้น
    const [modal, setModal] = useState(null)

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

    const load = async () => applyResult(await fetchRooms())

    useEffect(() => {
        let active = true
        fetchRooms().then((result) => {
            if (active) applyResult(result)
        })
        return () => {
            active = false
        }
    }, [applyResult])

    const count = (status) => rooms.filter((r) => status === 'all' || r.status === status).length
    const visible = rooms.filter((r) => filter === 'all' || r.status === filter)
    const floors = [...new Set(visible.map((r) => r.floor))].sort((a, b) => a - b)

    // ลบห้อง: ห้องที่มีผู้เช่า หรือมีประวัติใบแจ้งหนี้/แจ้งซ่อม ลบไม่ได้ (ข้อมูลอ้างอิงห้องนี้อยู่)
    const handleDelete = async (room) => {
        if (tenantNames[room.number]) return 'ห้องนี้มีผู้เช่าอยู่ ต้องลบผู้เช่าออกก่อน'
        const { data, error } = await supabase.from('rooms').delete().eq('number', room.number).select('number')
        if (error) {
            return error.code === '23503'
                ? 'ลบไม่ได้ เพราะห้องนี้มีประวัติใบแจ้งหนี้หรือแจ้งซ่อมอยู่ หากไม่ต้องการใช้ห้องนี้แล้ว ให้เปลี่ยนสถานะเป็น "ปรับปรุง" แทน'
                : `ลบไม่สำเร็จ: ${error.message}`
        }
        if (!data?.length) return 'ลบไม่สำเร็จ ไม่พบห้องนี้หรือไม่มีสิทธิ์ลบ'
        await load()
        setModal(null)
        return null
    }

    const handleSave = async (data) => {
        const editing = modal !== 'new' ? modal.number : null
        if (rooms.some((r) => r.number === data.number && r.number !== editing)) {
            return 'เลขห้องนี้มีอยู่แล้ว'
        }
        // ห้องที่มีผู้เช่า: เปลี่ยนเลขห้องไม่ได้ (ชื่อผู้ใช้ผูกกับเลขห้อง) และสถานะต้องเป็น "มีผู้เช่า"
        if (editing && tenantNames[editing]) {
            if (data.number !== editing) return 'ห้องนี้มีผู้เช่าอยู่ ไม่สามารถเปลี่ยนเลขห้องได้'
            if (data.status !== 'occupied') return 'ห้องนี้มีผู้เช่าอยู่ สถานะต้องเป็น "มีผู้เช่า" (หากผู้เช่าย้ายออก ให้ลบผู้เช่าก่อน)'
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
            <PageHeader
                title="จัดการห้องพัก"
                subtitle="ดูสถานะของทุกห้อง ค่าเช่า และผู้เช่าที่พักอยู่"
                actions={
                    <button
                        onClick={() => setModal('new')}
                        className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-xl shadow-card"
                    >
                        <Icon name="plus" className="w-4 h-4" />
                        เพิ่มห้องพัก
                    </button>
                }
            />

            <div className="px-4 sm:px-6 pb-10 flex flex-col gap-6">
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

                {(loading || loadError || visible.length === 0) && (
                    <div className={`bg-white rounded-2xl shadow-card py-14 text-center ${loadError ? 'text-red-600' : 'text-muted'}`}>
                        {loading ? 'กำลังโหลด...' : loadError || 'ไม่พบห้องในหมวดนี้'}
                    </div>
                )}

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

            {modal && (
                <RoomModal
                    key={modal === 'new' ? 'new' : modal.number}
                    title={modal === 'new' ? 'เพิ่มห้องใหม่' : `แก้ไขห้อง ${modal.number}`}
                    initial={modal === 'new' ? emptyForm : modal}
                    tenantName={modal === 'new' ? undefined : tenantNames[modal.number]}
                    onSave={handleSave}
                    onDelete={modal === 'new' ? undefined : handleDelete}
                    onCancel={() => setModal(null)}
                />
            )}
        </>
    )
}

export default RoomsPage
