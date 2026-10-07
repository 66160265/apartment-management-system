import { useState } from 'react'
import AvatarMenu from '../components/AvatarMenu'
import { supabase } from '../lib/supabaseClient'
import { roleLabels, useCurrentUser } from '../lib/useCurrentUser'

const MIN_PASSWORD = 6

const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white'

// 2026-03-01 -> 1 มี.ค. 69
const formatDate = (iso) =>
    iso
        ? new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
        : '-'

function Row({ label, value }) {
    return (
        <>
            <dt className="text-muted">{label}</dt>
            <dd className="text-ink break-all">{value || '-'}</dd>
        </>
    )
}

function ChangePasswordForm({ email }) {
    const [form, setForm] = useState({ current: '', next: '', confirm: '' })
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [saving, setSaving] = useState(false)

    const set = (key) => (e) => {
        setForm({ ...form, [key]: e.target.value })
        setError('')
        setSuccess(false)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.current || !form.next || !form.confirm) {
            setError('กรุณากรอกข้อมูลให้ครบ')
            return
        }
        if (form.next.length < MIN_PASSWORD) {
            setError(`รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD} ตัวอักษร`)
            return
        }
        if (form.next !== form.confirm) {
            setError('ยืนยันรหัสผ่านใหม่ไม่ตรงกัน')
            return
        }
        if (form.next === form.current) {
            setError('รหัสผ่านใหม่ต้องไม่เหมือนรหัสผ่านเดิม')
            return
        }

        setSaving(true)
        // ยืนยันรหัสผ่านเดิมก่อน กันคนอื่นที่นั่งใช้เครื่องที่ login ค้างไว้
        const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: form.current })
        if (verifyError) {
            setSaving(false)
            setError('รหัสผ่านปัจจุบันไม่ถูกต้อง')
            return
        }
        const { error: updateError } = await supabase.auth.updateUser({ password: form.next })
        setSaving(false)
        if (updateError) {
            setError(`เปลี่ยนรหัสผ่านไม่สำเร็จ: ${updateError.message}`)
            return
        }
        setForm({ current: '', next: '', confirm: '' })
        setSuccess(true)
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="text-sm text-muted">
                รหัสผ่านปัจจุบัน
                <input type="password" className={inputClass} value={form.current} onChange={set('current')} autoComplete="current-password" />
            </label>
            <label className="text-sm text-muted">
                รหัสผ่านใหม่
                <input type="password" className={inputClass} value={form.next} onChange={set('next')} autoComplete="new-password" />
            </label>
            <label className="text-sm text-muted">
                ยืนยันรหัสผ่านใหม่
                <input type="password" className={inputClass} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-700">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว</p>}
            <div>
                <button
                    type="submit"
                    disabled={saving}
                    className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-4 py-2 rounded-xl"
                >
                    {saving ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
                </button>
            </div>
        </form>
    )
}

function AccountPage() {
    const info = useCurrentUser()

    return (
        <>
            <div className="flex justify-between items-center p-6">
                <h1 className="text-2xl font-semibold text-primary-dark">จัดการบัญชีผู้ใช้</h1>
                <AvatarMenu />
            </div>

            {!info ? (
                <p className="px-6 text-muted">กำลังโหลด...</p>
            ) : (
                <div className="px-6 pb-6 grid gap-6 lg:grid-cols-2 items-start">
                    <section className="bg-white rounded-2xl shadow-card p-5">
                        <h2 className="font-medium text-primary-dark mb-4">ข้อมูลบัญชี</h2>
                        <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5">
                            <Row label="ชื่อผู้ใช้" value={info.username} />
                            <Row label="สิทธิ์" value={roleLabels[info.role] || info.role} />
                            {info.tenant && (
                                <>
                                    <Row label="ชื่อ-นามสกุล" value={info.tenant.name} />
                                    <Row label="ห้องพัก" value={info.tenant.room} />
                                    <Row label="เบอร์โทร" value={info.tenant.phone} />
                                    <Row label="เริ่มสัญญา" value={formatDate(info.tenant.start_date)} />
                                    <Row label="สิ้นสุดสัญญา" value={formatDate(info.tenant.end_date)} />
                                </>
                            )}
                        </dl>
                        {info.tenant && (
                            <p className="mt-4 text-xs text-muted">หากข้อมูลไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ</p>
                        )}
                    </section>

                    <section className="bg-white rounded-2xl shadow-card p-5">
                        <h2 className="font-medium text-primary-dark mb-1">เปลี่ยนรหัสผ่าน</h2>
                        {info.role === 'user' && (
                            <p className="mb-4 text-xs text-muted">รหัสผ่านเริ่มต้นเดาได้ง่าย แนะนำให้เปลี่ยนเป็นรหัสผ่านของคุณเอง</p>
                        )}
                        <ChangePasswordForm email={info.email} />
                    </section>
                </div>
            )}
        </>
    )
}

export default AccountPage
