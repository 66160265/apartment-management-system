import { useState } from 'react'
import { tenants as initialTenants } from '../data/tenants'
import { rooms } from '../data/rooms'

const emptyForm = {
    name: '',
    username: '',
    password: '',
    phone: '',
    room: '',
    startDate: '',
    endDate: '',
}

const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white'

// 2026-03-01 -> 1 มี.ค. 69
const formatDate = (iso) =>
    iso
        ? new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
        : '-'

function TenantModal({ title, initial, isEdit, onSave, onCancel }) {
    const [form, setForm] = useState(initial)
    const [error, setError] = useState('')

    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

    // ห้องที่เลือกได้: ห้องทั้งหมดในระบบ + ห้องเดิมของผู้เช่า (กรณีแก้ไข)
    const roomOptions = [...new Set([...rooms.map((r) => r.number), initial.room].filter(Boolean))]

    const handleSubmit = (e) => {
        e.preventDefault()
        if (!form.name.trim() || !form.phone.trim() || !form.room || !form.startDate || !form.endDate) {
            setError('กรุณากรอกข้อมูลให้ครบ')
            return
        }
        if (!isEdit && (!form.username.trim() || !form.password)) {
            setError('กรุณากรอกชื่อผู้ใช้ login และรหัสผ่าน')
            return
        }
        if (form.endDate < form.startDate) {
            setError('วันสิ้นสุดสัญญาต้องไม่ก่อนวันเริ่มสัญญา')
            return
        }
        const err = onSave({
            name: form.name.trim(),
            username: form.username.trim(),
            phone: form.phone.trim(),
            room: form.room,
            startDate: form.startDate,
            endDate: form.endDate,
        })
        if (err) setError(err)
    }

    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-sm flex items-center justify-center z-50">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl w-[420px] max-w-[92vw] max-h-[95vh] overflow-y-auto flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-primary-dark">{title}</h2>
                <label className="text-sm text-muted">
                    ชื่อ-นามสกุล
                    <input className={inputClass} value={form.name} onChange={set('name')} />
                </label>
                <div className="flex gap-4">
                    <label className="flex-1 min-w-0 text-sm text-muted">
                        ชื่อผู้ใช้ login
                        <input className={inputClass} value={form.username} onChange={set('username')} />
                    </label>
                    <label className="flex-1 min-w-0 text-sm text-muted">
                        รหัสผ่าน
                        <input
                            type="password"
                            className={inputClass}
                            value={form.password}
                            onChange={set('password')}
                            placeholder={isEdit ? 'ไม่เปลี่ยนรหัสผ่าน' : ''}
                            autoComplete="new-password"
                        />
                    </label>
                </div>
                <label className="text-sm text-muted">
                    เบอร์โทร
                    <input className={inputClass} value={form.phone} onChange={set('phone')} />
                </label>
                <label className="text-sm text-muted">
                    ห้องพัก
                    <select className={inputClass} value={form.room} onChange={set('room')}>
                        <option value="" />
                        {roomOptions.map((n) => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </label>
                <div className="flex gap-4">
                    <label className="flex-1 min-w-0 text-sm text-muted">
                        เริ่มสัญญา
                        <input type="date" className={inputClass} value={form.startDate} onChange={set('startDate')} />
                    </label>
                    <label className="flex-1 min-w-0 text-sm text-muted">
                        สิ้นสุดสัญญา
                        <input type="date" className={inputClass} value={form.endDate} onChange={set('endDate')} />
                    </label>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className="border border-line text-muted hover:bg-sand px-4 py-1.5 rounded-lg">ยกเลิก</button>
                    <button type="submit" className="bg-primary hover:bg-primary-dark text-white px-4 py-1.5 rounded-lg">บันทึก</button>
                </div>
            </form>
        </div>
    )
}

function TenantsPage() {
    const [tenants, setTenants] = useState(initialTenants)
    const [search, setSearch] = useState('')
    // null = ปิด, 'new' = เพิ่มผู้เช่า, ออบเจ็กต์ผู้เช่า = ดู/แก้ไขรายละเอียด
    const [modal, setModal] = useState(null)

    const keyword = search.trim().toLowerCase()
    const visible = tenants.filter(
        (t) => !keyword || t.name.toLowerCase().includes(keyword) || t.room.includes(keyword)
    )

    const handleSave = (data) => {
        const editing = modal !== 'new' ? modal.room : null
        if (tenants.some((t) => t.room === data.room && t.room !== editing)) {
            return 'ห้องนี้มีผู้เช่าอยู่แล้ว'
        }
        setTenants(editing
            ? tenants.map((t) => (t.room === editing ? { ...t, ...data } : t))
            : [...tenants, data].sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true })))
        setModal(null)
    }

    return (
        <>
            <div className="flex justify-between items-center p-6">
                <h1 className="text-2xl font-semibold text-primary-dark">จัดการผู้เช่า</h1>
                <div className="flex items-center gap-4">
                    <button onClick={() => setModal('new')} className="bg-primary hover:bg-primary-dark transition-colors text-white px-4 py-2 rounded-xl shadow-card">
                        + เพิ่มผู้เช่า
                    </button>
                    <div className="w-10 h-10 rounded-full bg-mist text-primary-dark font-medium flex items-center justify-center">
                        AD
                    </div>
                </div>
            </div>
            <div className="px-6">
                <div className="flex items-center gap-2 border border-line bg-white rounded-xl px-4 py-2 w-96 max-w-full focus-within:border-secondary">
                    <span>🔍</span>
                    <input
                        type="text"
                        placeholder="ค้นหาชื่อ/ห้อง"
                        className="outline-none w-full"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>
            <div className="mx-6 mt-4 bg-white rounded-2xl shadow-card p-5 overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="text-muted text-sm">
                            <th className="pb-3 font-medium">ห้อง</th>
                            <th className="pb-3 font-medium">ชื่อ-สกุล</th>
                            <th className="pb-3 font-medium">เบอร์โทร</th>
                            <th className="pb-3 font-medium">เริ่มสัญญา</th>
                            <th className="pb-3 font-medium">สิ้นสุดสัญญา</th>
                            <th className="pb-3 font-medium text-right">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((t) => (
                            <tr key={t.room} className="border-t border-line hover:bg-sand/60">
                                <td className="py-3">{t.room}</td>
                                <td className="py-3">{t.name}</td>
                                <td className="py-3">{t.phone}</td>
                                <td className="py-3">{formatDate(t.startDate)}</td>
                                <td className="py-3">{formatDate(t.endDate)}</td>
                                <td className="py-3 text-right">
                                    <button onClick={() => setModal(t)} className="bg-mist text-primary-dark hover:bg-secondary/40 transition-colors px-3 py-1 rounded-lg text-sm">รายละเอียด</button>
                                </td>
                            </tr>
                        ))}
                        {visible.length === 0 && (
                            <tr>
                                <td colSpan="6" className="py-6 text-center text-muted">ไม่พบผู้เช่า</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {modal && (
                <TenantModal
                    key={modal === 'new' ? 'new' : modal.room}
                    title={modal === 'new' ? 'เพิ่มผู้เช่า' : `รายละเอียดผู้เช่า ห้อง ${modal.room}`}
                    initial={modal === 'new' ? emptyForm : { ...emptyForm, ...modal }}
                    isEdit={modal !== 'new'}
                    onSave={handleSave}
                    onCancel={() => setModal(null)}
                />
            )}
        </>
    )
}

export default TenantsPage;
