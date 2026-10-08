import { useState } from 'react'
import PageHeader from './PageHeader'
import Icon from './Icon'
import DatePicker from './DatePicker'
import { Avatar, ContractBadge } from './TenantParts'
import TenantDocuments from './TenantDocuments'
import { callAdminUsers } from '../lib/adminUsers'
import { supabase } from '../lib/supabaseClient'
import { contractStatus, formatDate } from '../lib/tenants'

const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white disabled:opacity-70'

function DeleteTenantModal({ tenant, onConfirm, onCancel }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const handleDelete = async () => {
        setBusy(true)
        const err = await onConfirm()
        setBusy(false)
        if (err) setError(err)
    }

    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 shadow-xl w-[420px] max-w-[92vw] flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-primary-dark">ลบผู้เช่า</h2>
                <p className="text-sm text-ink">
                    ลบ {tenant.name} (ห้อง {tenant.room}) พร้อมเอกสารทั้งหมดและบัญชีเข้าสู่ระบบ {tenant.username && `(${tenant.username})`}
                    ห้องจะกลับเป็นสถานะ "ว่าง" การลบไม่สามารถกู้คืนได้
                </p>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="border border-line text-muted hover:bg-sand px-4 py-1.5 rounded-lg">ยกเลิก</button>
                    <button onClick={handleDelete} disabled={busy} className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-4 py-1.5 rounded-lg">
                        {busy ? 'กำลังลบ...' : 'ลบผู้เช่า'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// หน้ารายละเอียดผู้เช่า: ข้อมูลผู้เช่า + เอกสาร
function TenantDetail({ tenant, floor, onBack, onChanged }) {
    const [form, setForm] = useState({
        name: tenant.name,
        phone: tenant.phone,
        startDate: tenant.startDate,
        endDate: tenant.endDate,
    })
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const set = (key) => (e) => {
        setForm({ ...form, [key]: e.target.value })
        setError('')
    }

    const handleSave = async (e) => {
        e.preventDefault()
        if (!form.name.trim() || !form.phone.trim() || !form.startDate || !form.endDate) {
            setError('กรุณากรอกข้อมูลให้ครบ')
            return
        }
        if (form.endDate < form.startDate) {
            setError('วันสิ้นสุดสัญญาต้องไม่ก่อนวันเริ่มสัญญา')
            return
        }
        setSaving(true)
        const { error: err } = await supabase
            .from('tenants')
            .update({ name: form.name.trim(), phone: form.phone.trim(), start_date: form.startDate, end_date: form.endDate })
            .eq('room', tenant.room)
        setSaving(false)
        if (err) {
            setError(`บันทึกไม่สำเร็จ: ${err.message}`)
            return
        }
        await onChanged()
        onBack()
    }

    const handleDelete = async () => {
        // จดรายการไฟล์ไว้ก่อน เพราะแถวเอกสารจะถูกลบตามผู้เช่า
        const { data: docs } = await supabase.from('tenant_documents').select('file_path').eq('room', tenant.room)

        if (tenant.userId) {
            // ลบบัญชี ข้อมูลผู้เช่า และตั้งห้องเป็นว่างในครั้งเดียว
            const { error: err } = await callAdminUsers({ action: 'delete', userId: tenant.userId })
            if (err) return err
        } else {
            const { error: err } = await supabase.from('tenants').delete().eq('room', tenant.room)
            if (err) return `ลบไม่สำเร็จ: ${err.message}`
            await supabase.from('rooms').update({ status: 'vacant' }).eq('number', tenant.room)
        }

        if (docs?.length) await supabase.storage.from('tenant-docs').remove(docs.map((d) => d.file_path))
        await onChanged()
        onBack()
    }

    const status = contractStatus(tenant.endDate)

    const facts = [
        { icon: 'door', label: 'ห้องพัก', value: `${tenant.room}${floor ? ` · ชั้น ${floor}` : ''}` },
        { icon: 'phone', label: 'เบอร์โทร', value: tenant.phone },
        { icon: 'calendar', label: 'ระยะสัญญา', value: `${formatDate(tenant.startDate)} – ${formatDate(tenant.endDate)}` },
        { icon: 'clock', label: 'เหลือเวลา', value: status.key === 'expired' ? status.hint : status.hint },
    ]

    return (
        <>
            <PageHeader title="รายละเอียดผู้เช่า" subtitle="ตรวจสอบและแก้ไขข้อมูลผู้เช่า พร้อมจัดการเอกสาร" />

            <div className="px-6 pb-28 flex flex-col gap-4">
                <button onClick={onBack} className="self-start flex items-center gap-1.5 border border-line bg-white text-primary-dark hover:bg-mist/40 px-3.5 py-1.5 rounded-xl text-sm">
                    <Icon name="arrowLeft" className="w-4 h-4" />
                    กลับไปรายชื่อผู้เช่า
                </button>

                <div className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-5">
                    <div className="flex flex-wrap items-center gap-4">
                        <Avatar name={tenant.name} className="w-16 h-16 text-2xl" />
                        <div className="flex-1 min-w-48">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-xl font-semibold text-primary-dark">{tenant.name}</h2>
                                <ContractBadge endDate={tenant.endDate} />
                            </div>
                            {tenant.username && (
                                <p className="flex items-center gap-1.5 text-sm text-secondary mt-1">
                                    <Icon name="key" className="w-4 h-4" />
                                    บัญชีเข้าสู่ระบบ : @{tenant.username.toLowerCase()}
                                </p>
                            )}
                        </div>
                    </div>
                    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {facts.map((f) => (
                            <div key={f.label} className="flex items-center gap-3 rounded-xl bg-sand/60 px-4 py-3">
                                <span className="grid place-items-center w-9 h-9 rounded-lg bg-white text-primary shrink-0"><Icon name={f.icon} className="w-[18px] h-[18px]" /></span>
                                <div className="min-w-0">
                                    <dt className="text-xs text-muted">{f.label}</dt>
                                    <dd className="text-sm font-medium text-ink truncate">{f.value}</dd>
                                </div>
                            </div>
                        ))}
                    </dl>
                </div>

                <form id="tenant-form" onSubmit={handleSave} className="bg-white rounded-2xl shadow-card p-5 flex flex-col gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-primary-dark">ข้อมูลผู้เช่า</h2>
                        <p className="text-sm text-muted">แก้ไขแล้วกด "บันทึก" ที่แถบด้านล่าง</p>
                    </div>
                    <label className="text-sm text-muted">
                        ชื่อ-นามสกุล
                        <input className={inputClass} value={form.name} onChange={set('name')} />
                    </label>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <label className="text-sm text-muted">
                            เบอร์โทร
                            <input className={inputClass} value={form.phone} onChange={set('phone')} inputMode="tel" />
                        </label>
                        <label className="text-sm text-muted">
                            ห้องพัก <span className="text-xs">(เปลี่ยนไม่ได้ เพราะผูกกับชื่อผู้ใช้)</span>
                            <input className={inputClass} value={`${tenant.room}${floor ? ` (ชั้น ${floor})` : ''}`} disabled />
                        </label>
                    </div>
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
                    {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
                </form>

                <TenantDocuments room={tenant.room} />
            </div>

            <div className="fixed bottom-0 right-0 left-0 lg:left-64 z-20 bg-white/90 backdrop-blur border-t border-line px-6 py-3 flex flex-wrap items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 px-5 py-2 rounded-xl"
                >
                    ลบผู้เช่า
                </button>
                <div className="flex gap-3">
                    <button type="button" onClick={onBack} className="border border-line bg-white text-muted hover:bg-sand px-5 py-2 rounded-xl">ยกเลิก</button>
                    <button type="submit" form="tenant-form" disabled={saving} className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-7 py-2 rounded-xl shadow-card">
                        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                    </button>
                </div>
            </div>

            {confirmDelete && <DeleteTenantModal tenant={tenant} onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} />}
        </>
    )
}

export default TenantDetail
