import { useEffect, useState } from 'react'
import { useRealtimeReload } from '../lib/realtime'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import { Avatar, ContractBadge } from '../components/TenantParts'
import { supabase } from '../lib/supabaseClient'
import { loadRenewals } from '../lib/contracts'
import { formatDate } from '../lib/tenants'
import { makeDefaultPassword } from '../lib/tenantAccount'
import { homeFor } from '../lib/auth'
import { resetCurrentUser, roleLabels, useCurrentUser } from '../lib/useCurrentUser'
import { SkeletonCard } from '../components/Skeleton.jsx'

// ความยาวรหัสผ่านขั้นต่ำ
const MIN_PASSWORD = 6

// คลาส Tailwind ของช่องกรอกรหัสผ่าน
const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2.5 outline-none focus:border-secondary focus:bg-white focus:ring-4 focus:ring-secondary/15'

// แถวแสดงข้อมูลบัญชีหนึ่งรายการ: ไอคอน หัวข้อ และค่า
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

// ช่องกรอกรหัสผ่านพร้อมปุ่มแสดง/ซ่อนรหัส
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

// ฟอร์มเปลี่ยนรหัสผ่าน: ตรวจรหัสเดิมก่อน แล้วตั้งรหัสใหม่
// forced = บัญชีที่ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน (หลังเปลี่ยนสำเร็จจะล้างเครื่องหมายแล้วพาไปหน้าแรก) tenant = ข้อมูลผู้เช่า ใช้กันตั้งรหัสซ้ำรหัสเริ่มต้น
function ChangePasswordForm({ email, forced, role, tenant }) {
    const [form, setForm] = useState({ current: '', next: '', confirm: '' })
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [saving, setSaving] = useState(false)

    // สร้างฟังก์ชันจัดการ onChange ของช่องในฟอร์มตาม key และล้างข้อความ error/สำเร็จ
    const set = (key) => (e) => {
        setForm({ ...form, [key]: e.target.value })
        setError('')
        setSuccess(false)
    }

    // ตรวจข้อมูลที่กรอก ยืนยันรหัสผ่านเดิม แล้วบันทึกรหัสผ่านใหม่
    const handleSubmit = async (e) => {
        e.preventDefault()
        // ตรวจข้อมูลก่อนส่ง: กรอกครบ, ยาวพอ, ยืนยันตรงกัน, ไม่ซ้ำรหัสเดิม
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
        // ห้ามตั้งเป็นรหัสเริ่มต้นของห้อง (เดาได้จากเลขห้องกับเบอร์โทร)
        if (tenant?.room && tenant?.phone && form.next === makeDefaultPassword(tenant.room, tenant.phone)) {
            setError('รหัสผ่านใหม่ต้องไม่ใช่รหัสผ่านเริ่มต้น')
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
        // รหัสเดิมถูกต้อง: ตั้งรหัสผ่านใหม่ แล้วล้างฟอร์มและแสดงข้อความสำเร็จ
        const { error: updateError } = await supabase.auth.updateUser({ password: form.next })
        setSaving(false)
        if (updateError) {
            setError(`เปลี่ยนรหัสผ่านไม่สำเร็จ: ${updateError.message}`)
            return
        }
        // บัญชีที่ถูกบังคับเปลี่ยนรหัส: ล้างเครื่องหมายแล้วเข้าหน้าแรก (โหลดหน้าใหม่ให้สถานะผู้ใช้สดจริง)
        if (forced) {
            const { error: clearError } = await supabase.rpc('clear_must_change_password')
            if (clearError) {
                setError(`เปลี่ยนรหัสผ่านแล้ว แต่ปลดการบังคับไม่สำเร็จ: ${clearError.message}`)
                return
            }
            resetCurrentUser()
            window.location.assign(homeFor(role))
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
            {/* ข้อความ error / สำเร็จ */}
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

// ประวัติการต่อสัญญาของผู้เช่า (ผู้ดูแลเป็นผู้ต่อ ผู้เช่าดูได้อย่างเดียว) ไม่มีประวัติหรือโหลดไม่ได้ = ไม่แสดงส่วนนี้
function MyRenewals() {
    const [renewals, setRenewals] = useState(null)
    useEffect(() => {
        let active = true
        loadRenewals().then((list) => active && setRenewals(list))
        return () => {
            active = false
        }
    }, [])
    // แอดมินต่อสัญญาให้ขณะเปิดหน้านี้อยู่ ประวัติโผล่เอง
    useRealtimeReload(['tenants'], async () => setRenewals(await loadRenewals()))
    if (!renewals?.length) return null
    return (
        <section aria-label="ประวัติการต่อสัญญา" className="bg-white rounded-2xl shadow-card p-4 sm:p-5">
            <h2 className="font-medium text-primary-dark mb-3">ประวัติการต่อสัญญา</h2>
            <ul className="flex flex-col divide-y divide-line/70 border border-line rounded-xl">
                {renewals.map((r) => (
                    <li key={r.id} className="px-4 py-3 text-sm">
                        <span className="font-medium text-ink">ต่อจาก {formatDate(r.previous_end_date)} เป็น {formatDate(r.new_end_date)}</span>
                        {r.note && <span className="block text-muted whitespace-pre-wrap">{r.note}</span>}
                    </li>
                ))}
            </ul>
        </section>
    )
}

// หน้าบัญชีของฉัน: ข้อมูลผู้ใช้/ห้อง/สัญญา และฟอร์มเปลี่ยนรหัสผ่าน
function AccountPage() {
    const info = useCurrentUser()
    const t = info?.tenant

    return (
        <>
            <PageHeader title="บัญชีของฉัน" subtitle="ดูข้อมูลบัญชีและเปลี่ยนรหัสผ่านของคุณ" />

            {/* รอโหลดข้อมูลผู้ใช้ก่อน */}
            {!info ? (
                <div className="px-4 sm:px-6 pb-10 flex flex-col gap-4 sm:gap-6"><SkeletonCard lines={4} /><SkeletonCard lines={3} /></div>
            ) : (
                <div className="px-4 sm:px-6 pb-10 flex flex-col gap-4 sm:gap-6">
                    {/* การ์ดโปรไฟล์: รูปตัวอักษร ชื่อ ป้ายสิทธิ์ สถานะสัญญา และชื่อผู้ใช้ */}
                    <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5 flex flex-wrap items-center gap-4">
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

                    {info.mustChangePassword && (
                        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 ring-1 ring-amber-200 text-amber-900 px-5 py-4 text-sm">
                            <Icon name="alert" className="w-5 h-5 shrink-0 mt-0.5" />
                            <p>
                                <strong>กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งาน</strong> บัญชีนี้ใช้รหัสผ่านที่ผู้ดูแลระบบตั้งให้ ซึ่งผู้อื่นอาจรู้ได้
                                ตั้งรหัสผ่านของคุณเองในช่อง "เปลี่ยนรหัสผ่าน" ด้านล่าง แล้วระบบจะพาไปหน้าแรก
                            </p>
                        </div>
                    )}

                    <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 items-start">
                        {/* การ์ดข้อมูลบัญชี (ผู้เช่าจะเห็นข้อมูลห้องและสัญญาเพิ่ม) */}
                        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5">
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

                        {/* การ์ดเปลี่ยนรหัสผ่าน */}
                        <section className="bg-white rounded-2xl shadow-card p-4 sm:p-5">
                            <h2 className="font-medium text-primary-dark">เปลี่ยนรหัสผ่าน</h2>
                            <p className="mt-1 mb-4 text-xs text-muted">
                                {info.role === 'user'
                                    ? 'รหัสผ่านเริ่มต้นเดาได้ง่าย แนะนำให้เปลี่ยนเป็นรหัสผ่านของคุณเอง'
                                    : `ตั้งรหัสผ่านใหม่อย่างน้อย ${MIN_PASSWORD} ตัวอักษร`}
                            </p>
                            <ChangePasswordForm email={info.email} forced={info.mustChangePassword} role={info.role} tenant={t} />
                        </section>
                    </div>
                    {t && <MyRenewals />}
                </div>
            )}
        </>
    )
}

export default AccountPage
