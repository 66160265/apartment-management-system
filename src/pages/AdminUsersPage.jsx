import { useEffect, useState } from 'react'
import AvatarMenu from '../components/AvatarMenu'
import { supabase } from '../lib/supabaseClient'
import { makeDefaultPassword } from '../lib/tenantAccount'
import { emailToUsername, roleLabels, useCurrentUser } from '../lib/useCurrentUser'

const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white'

// 2026-03-01 -> 1 มี.ค. 69
const formatDate = (iso) =>
    iso
        ? new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
        : '-'

const formatDateTime = (iso) =>
    iso
        ? new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
        : 'ยังไม่เคยเข้าสู่ระบบ'

// เรียก Edge Function admin-users แล้วคืนค่า { data, error }
async function callAdminUsers(body) {
    const { data, error } = await supabase.functions.invoke('admin-users', { body })
    if (error) {
        const detail = await error.context?.json?.().catch(() => null)
        return { error: detail?.error || error.message }
    }
    return data?.error ? { error: data.error } : { data }
}

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
                            <label className="flex-1 min-w-0 text-sm text-muted">
                                เริ่มสัญญา
                                <input type="date" className={inputClass} value={form.startDate} onChange={set('startDate')} />
                            </label>
                            <label className="flex-1 min-w-0 text-sm text-muted">
                                สิ้นสุดสัญญา
                                <input type="date" className={inputClass} value={form.endDate} onChange={set('endDate')} />
                            </label>
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
            <div className="flex justify-between items-center p-6">
                <h1 className="text-2xl font-semibold text-primary-dark">จัดการบัญชีผู้ใช้ทั้งหมด</h1>
                <AvatarMenu />
            </div>

            {me && !isAdmin ? (
                <p className="px-6 text-red-600">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>
            ) : (
                <>
                    <div className="px-6">
                        <div className="flex items-center gap-2 border border-line bg-white rounded-xl px-4 py-2 w-96 max-w-full focus-within:border-secondary">
                            <span>🔍</span>
                            <input
                                type="text"
                                placeholder="ค้นหาชื่อผู้ใช้/ชื่อ/ห้อง"
                                className="outline-none w-full"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="mx-6 mt-4 mb-6 bg-white rounded-2xl shadow-card p-5 overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-muted text-sm">
                                    <th className="pb-3 font-medium">ชื่อผู้ใช้</th>
                                    <th className="pb-3 font-medium">ชื่อ-สกุล</th>
                                    <th className="pb-3 font-medium">ห้อง</th>
                                    <th className="pb-3 font-medium">สิทธิ์</th>
                                    <th className="pb-3 font-medium">เข้าสู่ระบบล่าสุด</th>
                                    <th className="pb-3 font-medium text-right">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((u) => (
                                    <tr key={u.id} className="border-t border-line hover:bg-sand/60">
                                        <td className="py-3">{emailToUsername(u.email)}</td>
                                        <td className="py-3">{u.tenant?.name || '-'}</td>
                                        <td className="py-3">{u.tenant?.room || '-'}</td>
                                        <td className="py-3">{roleLabels[u.role] || u.role || '-'}</td>
                                        <td className="py-3 text-sm">{formatDateTime(u.lastSignInAt)}</td>
                                        <td className="py-3 text-right whitespace-nowrap">
                                            <button onClick={() => setModal({ type: 'edit', user: u })} className="bg-mist text-primary-dark hover:bg-secondary/40 transition-colors px-3 py-1 rounded-lg text-sm">แก้ไข</button>
                                            {u.id !== currentUserId && (
                                                <button onClick={() => setModal({ type: 'delete', user: u })} className="ml-2 border border-red-200 text-red-600 hover:bg-red-50 transition-colors px-3 py-1 rounded-lg text-sm">ลบ</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {(loading || loadError || visible.length === 0) && (
                                    <tr>
                                        <td colSpan="6" className={`py-6 text-center ${loadError ? 'text-red-600' : 'text-muted'}`}>
                                            {loading ? 'กำลังโหลด...' : loadError || 'ไม่พบบัญชีผู้ใช้'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
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
