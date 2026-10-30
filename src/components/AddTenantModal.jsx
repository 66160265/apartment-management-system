import { useState } from 'react'
import DatePicker from './DatePicker'
import Icon from './Icon'
import { CopyButton } from './InvoiceParts'
import { makeDefaultPassword, makeUsername } from '../lib/tenantAccount'

// คลาส Tailwind ของช่องกรอกในฟอร์ม
const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white'

// วันที่ในเครื่อง -> YYYY-MM-DD
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ค่าเริ่มต้นของสัญญา: เริ่มวันนี้ สิ้นสุดอีก 1 ปี
function newForm() {
    const start = new Date()
    const end = new Date(start)
    end.setFullYear(end.getFullYear() + 1)
    end.setDate(end.getDate() - 1)
    return { name: '', phone: '', room: '', startDate: isoDate(start), endDate: isoDate(end), deposit: '' }
}

// หน้าต่างเพิ่มผู้เช่าใหม่ (สร้างบัญชีให้อัตโนมัติ) แล้วแสดงชื่อผู้ใช้/รหัสผ่านเริ่มต้น (หน้า pages/TenantsPage.jsx)
// rooms = ห้องที่เลือกได้ (ห้องว่าง), onSave(data) สร้างผู้เช่าแล้วคืนข้อความ error (ถ้ามี)
function AddTenantModal({ rooms, onSave, onClose }) {
    // ค่าในฟอร์ม, error, กำลังบันทึก และข้อมูลบัญชีที่สร้างสำเร็จ (ใช้สลับไปหน้าสรุป)
    const [form, setForm] = useState(newForm)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const [created, setCreated] = useState(null)

    // สร้างฟังก์ชันจัดการ onChange ของช่องในฟอร์มตาม key และล้างข้อความ error
    const set = (key) => (e) => {
        setForm({ ...form, [key]: e.target.value })
        setError('')
    }

    // ตัวอย่างชื่อผู้ใช้/รหัสผ่านเริ่มต้น แสดงได้เมื่อเลือกห้องและกรอกเบอร์อย่างน้อย 4 หลัก
    const digits = form.phone.replace(/\D/g, '')
    const canPreview = form.room && digits.length >= 4
    const username = makeUsername(form.room)
    const password = canPreview ? makeDefaultPassword(form.room, form.phone) : ''

    // ตรวจว่ากรอกข้อมูลครบ แล้วสร้างผู้เช่าและบัญชีผู้ใช้
    const handleSubmit = async (e) => {
        e.preventDefault()
        // ตรวจ: กรอกครบ, เบอร์มีตัวเลขพอสร้างรหัสผ่าน, วันสิ้นสุดไม่ก่อนวันเริ่ม
        if (!form.name.trim() || !form.phone.trim() || !form.room || !form.startDate || !form.endDate) {
            setError('กรุณากรอกข้อมูลให้ครบ')
            return
        }
        if (digits.length < 4) {
            setError('เบอร์โทรต้องมีตัวเลขอย่างน้อย 4 หลัก (ใช้สร้างรหัสผ่านเริ่มต้น)')
            return
        }
        if (form.endDate < form.startDate) {
            setError('วันสิ้นสุดสัญญาต้องไม่ก่อนวันเริ่มสัญญา')
            return
        }
        if (form.deposit !== '' && (Number.isNaN(Number(form.deposit)) || Number(form.deposit) < 0)) {
            setError('เงินประกันต้องเป็นตัวเลขที่ไม่ติดลบ')
            return
        }
        // สร้างผู้เช่า สำเร็จแล้วเก็บข้อมูลบัญชีไว้แสดงให้แอดมินแจ้งผู้เช่า
        setSaving(true)
        const err = await onSave({
            name: form.name.trim(),
            phone: form.phone.trim(),
            room: form.room,
            startDate: form.startDate,
            endDate: form.endDate,
            deposit: form.deposit === '' ? 0 : Number(form.deposit),
        })
        setSaving(false)
        if (err) setError(err)
        else setCreated({ name: form.name.trim(), room: form.room, username, password })
    }

    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-[480px] max-w-full max-h-[95vh] overflow-y-auto">
                {/* สร้างสำเร็จ: แสดงชื่อผู้ใช้/รหัสผ่านพร้อมปุ่มคัดลอก / ยังไม่สร้าง: ฟอร์มเพิ่มผู้เช่า */}
                {created ? (
                    <div className="p-4 sm:p-6 flex flex-col gap-4 items-stretch">
                        <div className="flex flex-col items-center text-center gap-2">
                            <span className="grid place-items-center w-14 h-14 rounded-full bg-emerald-50 text-emerald-600">
                                <Icon name="checkCircle" className="w-8 h-8" />
                            </span>
                            <h2 className="text-lg font-semibold text-primary-dark">เพิ่มผู้เช่าเรียบร้อย</h2>
                            <p className="text-sm text-muted">{created.name} · ห้อง {created.room}<br />แจ้งข้อมูลเข้าสู่ระบบนี้ให้ผู้เช่า และแนะนำให้เปลี่ยนรหัสผ่านหลังเข้าใช้งาน</p>
                        </div>
                        <div className="rounded-xl bg-sand/70 border border-line divide-y divide-line text-sm">
                            <div className="flex items-center justify-between gap-3 px-4 py-3">
                                <div><div className="text-xs text-muted">ชื่อผู้ใช้</div><div className="font-medium text-ink">{created.username}</div></div>
                                <CopyButton text={created.username} />
                            </div>
                            <div className="flex items-center justify-between gap-3 px-4 py-3">
                                <div><div className="text-xs text-muted">รหัสผ่านเริ่มต้น</div><div className="font-medium text-ink">{created.password}</div></div>
                                <CopyButton text={created.password} />
                            </div>
                        </div>
                        <button onClick={onClose} className="bg-primary hover:bg-primary-dark text-white py-2.5 rounded-xl font-medium shadow-card">เสร็จสิ้น</button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-4 sm:p-6 flex flex-col gap-4">
                        <div>
                            <h2 className="text-lg font-semibold text-primary-dark">เพิ่มผู้เช่าใหม่</h2>
                            <p className="text-sm text-muted mt-0.5">ระบบจะสร้างบัญชีเข้าสู่ระบบให้ผู้เช่าอัตโนมัติ</p>
                        </div>
                        {/* ชื่อ-นามสกุล */}
                        <label className="text-sm text-muted">
                            ชื่อ-นามสกุล
                            <input className={inputClass} value={form.name} onChange={set('name')} autoFocus />
                        </label>
                        {/* เบอร์โทร และเลือกห้อง (เฉพาะห้องว่าง) */}
                        <div className="grid sm:grid-cols-2 gap-4">
                            <label className="text-sm text-muted">
                                เบอร์โทร
                                <input className={inputClass} value={form.phone} onChange={set('phone')} inputMode="tel" />
                            </label>
                            <label className="text-sm text-muted">
                                ห้องพัก
                                <select className={inputClass} value={form.room} onChange={set('room')}>
                                    <option value="">{rooms.length ? 'เลือกห้อง...' : 'ไม่มีห้องว่าง'}</option>
                                    {rooms.map((r) => (
                                        <option key={r.number} value={r.number}>{r.number} (ชั้น {r.floor})</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        {/* วันเริ่ม/สิ้นสุดสัญญา */}
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="text-sm text-muted">
                                เริ่มสัญญา
                                <DatePicker value={form.startDate} onChange={(v) => set('startDate')({ target: { value: v } })} />
                            </div>
                            <div className="text-sm text-muted">
                                สิ้นสุดสัญญา
                                <DatePicker value={form.endDate} onChange={(v) => set('endDate')({ target: { value: v } })} min={form.startDate} align="right" />
                            </div>
                        </div>

                        {/* เงินประกัน (ไม่บังคับ แก้ภายหลังได้ในหน้ารายละเอียดผู้เช่า) */}
                        <label className="text-sm text-muted">
                            เงินประกัน (บาท) <span className="text-xs">ไม่บังคับ</span>
                            <input className={inputClass} type="number" min="0" step="0.01" value={form.deposit} onChange={set('deposit')} placeholder="0" />
                        </label>

                        {/* ตัวอย่างบัญชีเข้าสู่ระบบที่จะถูกสร้าง */}
                        <div className="rounded-xl bg-mist/40 border border-mist px-4 py-3 text-sm flex items-start gap-3">
                            <Icon name="key" className="w-5 h-5 mt-0.5 text-primary" />
                            <div>
                                <div className="font-medium text-primary-dark">บัญชีเข้าสู่ระบบของผู้เช่า</div>
                                {canPreview ? (
                                    <div className="text-muted mt-0.5">ชื่อผู้ใช้ <b className="text-ink">{username}</b> · รหัสผ่านเริ่มต้น <b className="text-ink">{password}</b></div>
                                ) : (
                                    <div className="text-muted mt-0.5">เลือกห้องและกรอกเบอร์โทร ระบบจะแสดงชื่อผู้ใช้และรหัสผ่านที่นี่</div>
                                )}
                            </div>
                        </div>

                        {/* ข้อความ error และปุ่มยกเลิก/เพิ่มผู้เช่า */}
                        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={onClose} className="border border-line text-muted hover:bg-sand px-5 py-2 rounded-xl">ยกเลิก</button>
                            <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-6 py-2 rounded-xl shadow-card">
                                {saving ? 'กำลังเพิ่ม...' : 'เพิ่มผู้เช่า'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    )
}

export default AddTenantModal
