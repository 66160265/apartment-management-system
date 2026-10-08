import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Icon from '../components/Icon'
import { Avatar } from '../components/TenantParts'
import DatePicker from '../components/DatePicker'
import { callAdminUsers } from '../lib/adminUsers'
import { makeDefaultPassword } from '../lib/tenantAccount'
import { emailToUsername, roleLabels, useCurrentUser } from '../lib/useCurrentUser'

const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white'

const formatDateTime = (iso) =>
    iso
        ? new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
        : 'ยังไม่เคยเข้าสู่ระบบ'

function EditModal({ user, onSave, onCancel }) {
    const t = user.tenant
    const [form, setForm] = useState({
        name: t?.name ?? '',
        phone: t?.phone ?? '',
        startDate: t?.startDate ?? '',
        endDate: t?.endDate ?? '',
        password: '',
    })
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (t && (!form.name.trim() || !form.phone.trim() || !form.startDate || !form.endDate)) {
            setError('กรุณากรอกข้อมูลผู้เช่าให้ครบ')
            return
        }
        if (t && form.endDate < form.startDate) {
            setError('วันสิ้นสุดสัญญาต้องไม่ก่อนวันเริ่มสัญญา')
            return
        }
        if (form.password && form.password.length < 6) {
            setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
            return
        }
        setSaving(true)
        const err = await onSave({
            userId: user.id,
            ...(form.password && { password: form.password }),
            ...(t && {
                name: form.name.trim(),
                phone: form.phone.trim(),
                startDate: form.startDate,
                endDate: form.endDate,
            }),
        })
        setSaving(false)
        if (err) setError(err)
    }

    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-sm flex items-center justify-center z-50">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl w-[420px] max-w-[92vw] max-h-[95vh] overflow-y-auto flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-primary-dark">แก้ไขบัญชี {emailToUsername(user.email)}</h2>
                {t && (
                    <>
                        <label className="text-sm text-muted">
                            ชื่อ-นามสกุล
                            <input className={inputClass} value={form.name} onChange={set('name')} />
                        </label>
                        <label className="text-sm text-muted">
                            เบอร์โทร
                            <input className={inputClass} value={form.phone} onChange={set('phone')} />
                        </label>
                        <p className="text-sm text-muted">ห้องพัก: <span className="text-ink">{t.room}</span></p>
                        <div className="flex gap-4">
                            <div className="flex-1 min-w-0 text-sm text-muted">
                                เริ่มสัญญา
                                <DatePicker value={form.startDate} onChange={(v) => set('startDate')({ target: { value: v } })} />
                            </div>
                            <div className="flex-1 min-w-0 text-sm text-muted">
                                สิ้นสุดสัญญา
                                <DatePicker value={form.endDate} onChange={(v) => set('endDate')({ target: { value: v } })} min={form.startDate} align="right" />
                            </div>
                        </div>
                    </>
                )}
                <label className="text-sm text-muted">
                    รหัสผ่านใหม่
                    <input
                        className={inputClass}
                        value={form.password}
                        onChange={set('password')}
                        placeholder="เว้นว่างไว้ = ไม่เปลี่ยนรหัสผ่าน"
                        autoComplete="off"
                    />
                </label>
                {t && (
                    <button
                        type="button"
                        onClick={() => setForm({ ...form, password: makeDefaultPassword(t.room, form.phone || t.phone) })}
                        className="self-start text-sm text-primary hover:underline cursor-pointer"
                    >
                        ใช้รหัสผ่านเริ่มต้น
                    </button>
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onCancel} className="border border-line text-muted hover:bg-sand px-4 py-1.5 rounded-lg">ยกเลิก</button>
                    <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-4 py-1.5 rounded-lg">
                        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                    </button>
                </div>
            </form>
        </div>
    )
}

function DeleteModal({ user, onConfirm, onCancel }) {
    const [error, setError] = useState('')
    const [deleting, setDeleting] = useState(false)

    const handleDelete = async () => {
        setDeleting(true)
        const err = await onConfirm(user)
        setDeleting(false)
        if (err) setError(err)
    }

    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 shadow-xl w-[400px] max-w-[92vw] flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-primary-dark">ลบบัญชี {emailToUsername(user.email)}</h2>
                <p className="text-sm text-ink">
                    {user.tenant
                        ? `ระบบจะลบบัญชีและข้อมูลผู้เช่า ${user.tenant.name} (ห้อง ${user.tenant.room}) และเปลี่ยนสถานะห้องเป็นว่าง`
                        : 'ระบบจะลบบัญชีนี้ออกจากระบบ'}
                    {' '}การลบไม่สามารถกู้คืนได้
                </p>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="border border-line text-muted hover:bg-sand px-4 py-1.5 rounded-lg">ยกเลิก</button>
                    <button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-4 py-1.5 rounded-lg">
                        {deleting ? 'กำลังลบ...' : 'ลบบัญชี'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function AdminUsersPage() {
    const me = useCurrentUser()
    const [users, setUsers] = useState([])
    const [currentUserId, setCurrentUserId] = useState(null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [search, setSearch] = useState('')
    // { type: 'edit' | 'delete', user }
    const [modal, setModal] = useState(null)

    const isAdmin = me?.role === 'admin'

    const load = async () => {
        const { data, error } = await callAdminUsers({ action: 'list' })
        if (error) {
            setLoadError(`โหลดข้อมูลไม่สำเร็จ: ${error}`)
        } else {
            setUsers(data.users.sort((a, b) =>
                emailToUsername(a.email).localeCompare(emailToUsername(b.email), undefined, { numeric: true })))
            setCurrentUserId(data.currentUserId)
            setLoadError('')
        }
        setLoading(false)
    }

    useEffect(() => {
        // ไม่ต้องรอข้อมูลผู้ใช้ก่อน ฟังก์ชันฝั่งเซิร์ฟเวอร์ตรวจสิทธิ์แอดมินเองอยู่แล้ว
        load()
    }, [])

    const keyword = search.trim().toLowerCase()
    const visible = users.filter((u) =>
        !keyword ||
        emailToUsername(u.email).toLowerCase().includes(keyword) ||
        u.tenant?.name.toLowerCase().includes(keyword) ||
        u.tenant?.room.includes(keyword))

    const handleSave = async (payload) => {
        const { error } = await callAdminUsers({ action: 'update', ...payload })
        if (error) return error
        await load()
        setModal(null)
    }

    const handleDelete = async (user) => {
        const { error } = await callAdminUsers({ action: 'delete', userId: user.id })
        if (error) return error
        await load()
        setModal(null)
    }

    return (
        <>
            <PageHeader title="จัดการบัญชีผู้ใช้ทั้งหมด" subtitle="ดูบัญชีของผู้ดูแลระบบและผู้เช่า รีเซ็ตรหัสผ่าน แก้ไขข้อมูล หรือลบบัญชี" />

            {me && !isAdmin ? (
                <p className="px-6 text-red-600">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>
            ) : (
                <div className="px-6 pb-10">
                    <div className="bg-white rounded-2xl shadow-card p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <h2 className="font-medium text-primary-dark">
                                บัญชีทั้งหมด
                                <span className="ml-2 text-sm font-normal text-muted">({visible.length})</span>
                            </h2>
                            <div className="flex items-center gap-2 border border-line bg-sand/50 rounded-xl px-3 py-1.5 w-72 max-w-full focus-within:border-secondary focus-within:bg-white">
                                <Icon name="search" className="w-4 h-4 text-muted" />
                                <input
                                    type="text"
                                    placeholder="ค้นหาชื่อผู้ใช้ ชื่อ หรือห้อง"
                                    className="outline-none w-full bg-transparent text-sm"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="overflow-auto max-h-[36rem] rounded-xl border border-line shadow-sm">
                            <table className="w-full min-w-[48rem] border-collapse text-sm">
                                <thead className="sticky top-0 z-10">
                                    <tr className="bg-primary-dark text-white">
                                        <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center w-12">#</th>
                                        <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-left">ผู้ใช้</th>
                                        <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">ห้อง</th>
                                        <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">สิทธิ์</th>
                                        <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-left">เข้าสู่ระบบล่าสุด</th>
                                        <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((u, index) => (
                                        <tr key={u.id} className={`border-b border-line transition-colors hover:bg-mist/30 ${index % 2 ? 'bg-sand/40' : 'bg-white'}`}>
                                            <td className="px-3 py-3 border-x border-line/60 text-center text-xs text-muted tabular-nums">{index + 1}</td>
                                            <td className="px-3 py-3 border-x border-line/60">
                                                <div className="flex items-center gap-3">
                                                    <Avatar name={u.tenant?.name || 'A'} />
                                                    <div>
                                                        <div className="font-medium text-ink">{u.tenant?.name || 'ผู้ดูแลระบบ'}</div>
                                                        <div className="text-xs text-muted">@{emailToUsername(u.email).toLowerCase()}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 border-x border-line/60 text-center">
                                                {u.tenant ? (
                                                    <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold">{u.tenant.room}</span>
                                                ) : (
                                                    <span className="text-muted">-</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 border-x border-line/60 text-center">
                                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                                    u.role === 'admin' ? 'bg-violet-50 text-violet-800 ring-1 ring-violet-200' : 'bg-sky-50 text-sky-800 ring-1 ring-sky-200'
                                                }`}>
                                                    {roleLabels[u.role] || u.role || '-'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 border-x border-line/60 text-muted">{formatDateTime(u.lastSignInAt)}</td>
                                            <td className="border-x border-line/60 px-2 py-2 text-center">
                                                <div className="inline-flex rounded-lg border border-line bg-white overflow-hidden divide-x divide-line text-sm">
                                                    <button onClick={() => setModal({ type: 'edit', user: u })} className="px-3.5 py-1 text-primary-dark hover:bg-mist/50">แก้ไข</button>
                                                    {u.id !== currentUserId && (
                                                        <button onClick={() => setModal({ type: 'delete', user: u })} className="px-3.5 py-1 text-red-600 hover:bg-red-50">ลบ</button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {(loading || loadError || visible.length === 0) && (
                                <div className={`py-12 text-center ${loadError ? 'text-red-600' : 'text-muted'}`}>
                                    {loading ? 'กำลังโหลด...' : loadError || 'ไม่พบบัญชีผู้ใช้'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {modal?.type === 'edit' && (
                <EditModal key={modal.user.id} user={modal.user} onSave={handleSave} onCancel={() => setModal(null)} />
            )}
            {modal?.type === 'delete' && (
                <DeleteModal user={modal.user} onConfirm={handleDelete} onCancel={() => setModal(null)} />
            )}
        </>
    )
}

export default AdminUsersPage
