import { useState } from 'react'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import { Avatar, ContractBadge } from '../components/TenantParts'
import { supabase } from '../lib/supabaseClient'
import { formatDate } from '../lib/tenants'
import { roleLabels, useCurrentUser } from '../lib/useCurrentUser'

const MIN_PASSWORD = 6

const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2.5 outline-none focus:border-secondary focus:bg-white focus:ring-4 focus:ring-secondary/15'

function InfoRow({ icon, label, value }) {
    return (
        <div className="flex items-center gap-3 rounded-xl bg-sand/60 px-4 py-3">
            <span className="grid place-items-center w-9 h-9 rounded-lg bg-white text-primary shrink-0">
                <Icon name={icon} className="w-[18px] h-[18px]" />
            </span>
            <div className="min-w-0">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="text-sm font-medium text-ink truncate">{value || '-'}</dd>
            </div>
        </div>
    )
}

function PasswordField({ label, value, onChange, autoComplete }) {
    const [show, setShow] = useState(false)
    return (
        <label className="text-sm text-muted block">
            {label}
            <div className="relative mt-1">
                <input
                    type={show ? 'text' : 'password'}
                    className={`${inputClass} pr-12`}
                    value={value}
                    onChange={onChange}
                    autoComplete={autoComplete}
                />
                <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted hover:text-primary-dark hover:bg-mist/40"
                >
                    <Icon name={show ? 'eyeOff' : 'eye'} className="w-[18px] h-[18px]" />
                </button>
            </div>
        </label>
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
            <PasswordField label="รหัสผ่านปัจจุบัน" value={form.current} onChange={set('current')} autoComplete="current-password" />
            <PasswordField label="รหัสผ่านใหม่" value={form.next} onChange={set('next')} autoComplete="new-password" />
            <PasswordField label="ยืนยันรหัสผ่านใหม่" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            {success && (
                <p className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200 rounded-xl px-4 py-2">
                    <Icon name="checkCircle" className="w-4 h-4" />
                    เปลี่ยนรหัสผ่านเรียบร้อยแล้ว
                </p>
            )}
            <div>
                <button
                    type="submit"
                    disabled={saving}
                    className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-6 py-2.5 rounded-xl shadow-card"
                >
                    {saving ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
                </button>
            </div>
        </form>
    )
}

function AccountPage() {
    const info = useCurrentUser()
    const t = info?.tenant

    return (
        <>
            <PageHeader title="บัญชีของฉัน" subtitle="ดูข้อมูลบัญชีและเปลี่ยนรหัสผ่านของคุณ" />

            {!info ? (
                <p className="px-6 text-muted">กำลังโหลด...</p>
            ) : (
                <div className="px-4 sm:px-6 pb-10 flex flex-col gap-6">
                    <div className="bg-white rounded-2xl shadow-card p-5 flex flex-wrap items-center gap-4">
                        <Avatar name={t?.name || 'A'} className="w-16 h-16 text-2xl" />
                        <div className="flex-1 min-w-48">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-xl font-semibold text-primary-dark">{t?.name || roleLabels[info.role] || info.username}</h2>
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                    info.role === 'admin' ? 'bg-violet-50 text-violet-800 ring-1 ring-violet-200' : 'bg-sky-50 text-sky-800 ring-1 ring-sky-200'
                                }`}>
                                    {roleLabels[info.role] || info.role}
                                </span>
                                {t && <ContractBadge endDate={t.end_date} />}
                            </div>
                            <p className="flex items-center gap-1.5 text-sm text-secondary mt-1">
                                <Icon name="key" className="w-4 h-4" />
                                @{info.username.toLowerCase()}
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2 items-start">
                        <section className="bg-white rounded-2xl shadow-card p-5">
                            <h2 className="font-medium text-primary-dark mb-4">ข้อมูลบัญชี</h2>
                            <dl className="grid gap-3 sm:grid-cols-2">
                                <InfoRow icon="user" label="ชื่อผู้ใช้" value={info.username} />
                                <InfoRow icon="shield" label="สิทธิ์การใช้งาน" value={roleLabels[info.role] || info.role} />
                                {t && (
                                    <>
                                        <InfoRow icon="users" label="ชื่อ-นามสกุล" value={t.name} />
                                        <InfoRow icon="door" label="ห้องพัก" value={t.room} />
                                        <InfoRow icon="phone" label="เบอร์โทร" value={t.phone} />
                                        <InfoRow icon="calendar" label="ระยะสัญญา" value={`${formatDate(t.start_date)} – ${formatDate(t.end_date)}`} />
                                    </>
                                )}
                            </dl>
                            {t && <p className="mt-4 text-xs text-muted">หากข้อมูลไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ</p>}
                        </section>

                        <section className="bg-white rounded-2xl shadow-card p-5">
                            <h2 className="font-medium text-primary-dark">เปลี่ยนรหัสผ่าน</h2>
                            <p className="mt-1 mb-4 text-xs text-muted">
                                {info.role === 'user'
                                    ? 'รหัสผ่านเริ่มต้นเดาได้ง่าย แนะนำให้เปลี่ยนเป็นรหัสผ่านของคุณเอง'
                                    : `ตั้งรหัสผ่านใหม่อย่างน้อย ${MIN_PASSWORD} ตัวอักษร`}
                            </p>
                            <ChangePasswordForm email={info.email} />
                        </section>
                    </div>
                </div>
            )}
        </>
    )
}

export default AccountPage
