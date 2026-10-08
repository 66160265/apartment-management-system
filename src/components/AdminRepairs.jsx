import { useEffect, useMemo, useState } from 'react'
import AvatarMenu from './AvatarMenu'
import Icon from './Icon'
import { ConfirmDialog, RepairImagePicker, RepairStatusBadge } from './RepairParts'
import { repairStatuses, repairStatusKeys } from '../data/repairs'
import { formatDateTime } from '../lib/billing'
import { formatThaiDate, removeRepairImage, uploadRepairImage } from '../lib/repairs'
import { supabase } from '../lib/supabaseClient'

const inputClass = 'w-full border border-line rounded-xl px-4 py-2 text-ink text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30 bg-white disabled:bg-sand/60 disabled:text-muted'
const emptyForm = { room: '', problem: '', detail: '', status: 'pending', admin_note: '' }

const byRoom = (a, b) => a.localeCompare(b, undefined, { numeric: true })

const initialData = { repairs: [], rooms: [], tenants: [], loading: true, loadError: '' }

// ดึงข้อมูลทั้งหมดที่หน้านี้ใช้ (ไม่แตะ state เพื่อเรียกใช้ได้ทั้งใน effect และหลังบันทึก)
async function fetchData() {
    const [repairsRes, roomsRes, tenantsRes] = await Promise.all([
        supabase.from('repairs').select('*').order('created_at', { ascending: false }),
        supabase.from('rooms').select('number'),
        supabase.from('tenants').select('room, name, user_id'),
    ])
    const error = repairsRes.error || roomsRes.error || tenantsRes.error
    if (error) return { ...initialData, loading: false, loadError: `โหลดข้อมูลไม่สำเร็จ: ${error.message}` }
    return {
        repairs: repairsRes.data,
        rooms: roomsRes.data.map((r) => r.number).sort(byRoom),
        tenants: tenantsRes.data,
        loading: false,
        loadError: '',
    }
}

function AdminRepairs({ adminId }) {
    const [data, setData] = useState(initialData)
    const { repairs, rooms, tenants, loading, loadError } = data

    const [activeTab, setActiveTab] = useState('all')
    const [search, setSearch] = useState('')

    // editing: null = หน้ารายการ, 'new' = แจ้งซ่อมใหม่, ออบเจ็กต์ = จัดการรายการนั้น
    const [editing, setEditing] = useState(null)
    const [form, setForm] = useState(emptyForm)
    const [file, setFile] = useState(null)
    const [removeExisting, setRemoveExisting] = useState(false)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState('')
    const [confirmDelete, setConfirmDelete] = useState(false)

    // โหลดซ้ำหลังบันทึก/ลบ
    const load = async () => setData(await fetchData())

    // โหลดครั้งแรก: setState เกิดใน callback หลังได้ข้อมูล ไม่ได้เรียกตรง ๆ ใน effect
    useEffect(() => {
        let active = true
        fetchData().then((result) => {
            if (active) setData(result)
        })
        return () => {
            active = false
        }
    }, [])

    const tenantOf = (room) => tenants.find((t) => t.room === room)

    const counts = useMemo(() => {
        const c = { all: repairs.length }
        repairStatusKeys.forEach((k) => {
            c[k] = repairs.filter((r) => r.status === k).length
        })
        return c
    }, [repairs])

    const visible = repairs.filter((r) => {
        if (activeTab !== 'all' && r.status !== activeTab) return false
        const q = search.trim().toLowerCase()
        if (!q) return true
        return [r.room, r.problem, r.tenant_name].some((v) => v?.toLowerCase().includes(q))
    })

    const resetImageState = () => {
        setFile(null)
        setRemoveExisting(false)
    }

    const openNew = () => {
        setForm(emptyForm)
        resetImageState()
        setFormError('')
        setEditing('new')
    }

    const openEdit = (item) => {
        setForm({
            room: item.room,
            problem: item.problem,
            detail: item.detail,
            status: item.status,
            admin_note: item.admin_note,
        })
        resetImageState()
        setFormError('')
        setEditing(item)
    }

    const close = () => {
        if (saving) return
        setEditing(null)
        setConfirmDelete(false)
    }

    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

    const handleSave = async (e) => {
        e.preventDefault()
        const isNew = editing === 'new'
        const problem = form.problem.trim()
        if (!form.room) return setFormError('กรุณาเลือกห้อง')
        if (!problem) return setFormError('กรุณาระบุปัญหา')

        setSaving(true)
        setFormError('')

        const tenant = tenantOf(form.room)
        const oldPath = isNew ? null : editing.image_path
        // รูปเก็บในโฟลเดอร์ของผู้เช่าเจ้าของรายการ เพื่อให้ผู้เช่าเปิดดูได้
        const folder = (isNew ? tenant?.user_id : editing.user_id) || adminId

        let newPath = null
        if (file) {
            const res = await uploadRepairImage(file, folder)
            if (res.error) {
                setSaving(false)
                return setFormError(res.error)
            }
            newPath = res.path
        }
        const image_path = newPath ?? (removeExisting ? null : oldPath)

        const fields = {
            problem,
            detail: form.detail.trim(),
            status: form.status,
            admin_note: form.admin_note.trim(),
            image_path,
        }
        const { error } = isNew
            ? await supabase.from('repairs').insert({
                ...fields,
                room: form.room,
                user_id: tenant?.user_id ?? null,
                tenant_name: tenant?.name ?? '',
            })
            : await supabase.from('repairs').update(fields).eq('id', editing.id)

        if (error) {
            if (newPath) await removeRepairImage(newPath)
            setSaving(false)
            return setFormError(`บันทึกไม่สำเร็จ: ${error.message}`)
        }
        // ลบรูปเดิมออกจาก storage เมื่อถูกแทนที่หรือนำออก
        if (oldPath && oldPath !== image_path) await removeRepairImage(oldPath)

        await load()
        setSaving(false)
        setEditing(null)
    }

    const handleDelete = async () => {
        setSaving(true)
        const { error } = await supabase.from('repairs').delete().eq('id', editing.id)
        if (error) {
            setSaving(false)
            setConfirmDelete(false)
            return setFormError(`ลบไม่สำเร็จ: ${error.message}`)
        }
        await removeRepairImage(editing.image_path)
        await load()
        setSaving(false)
        setConfirmDelete(false)
        setEditing(null)
    }

    const isNew = editing === 'new'
    const existingPath = editing && !isNew && !removeExisting ? editing.image_path : null
    const tabs = [{ key: 'all', label: 'ทั้งหมด' }, ...repairStatusKeys.map((k) => ({ key: k, label: repairStatuses[k].label }))]

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-primary-dark">ระบบแจ้งซ่อม</h1>
                <div className="flex items-center gap-3">
                    {!editing && (
                        <button onClick={openNew} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-sm font-medium shadow-card flex items-center gap-1.5">
                            <Icon name="plus" className="w-4 h-4" />
                            แจ้งซ่อม
                        </button>
                    )}
                    <AvatarMenu />
                </div>
            </div>

            {editing ? (
                <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-card p-6 md:p-8 max-w-3xl mx-auto border border-line flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-primary-dark">{isNew ? 'แจ้งซ่อมใหม่' : 'จัดการรายการแจ้งซ่อม'}</h2>
                        {!isNew && <RepairStatusBadge status={editing.status} />}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-muted mb-1">ห้อง</label>
                            <select value={form.room} onChange={set('room')} disabled={!isNew || saving} className={inputClass} required>
                                <option value="">เลือกห้อง</option>
                                {rooms.map((n) => (
                                    <option key={n} value={n}>
                                        {n}{tenantOf(n) ? ` — ${tenantOf(n).name}` : ' (ว่าง)'}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm text-muted mb-1">{isNew ? 'ผู้แจ้ง' : 'วันที่แจ้ง'}</label>
                            <input
                                disabled
                                value={isNew ? tenantOf(form.room)?.name || '-' : `${editing.tenant_name || '-'} · ${formatDateTime(editing.created_at)}`}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-muted mb-1">ปัญหา</label>
                        <input required maxLength={200} value={form.problem} onChange={set('problem')} disabled={saving} placeholder="เช่น หลอดไฟขาด" className={inputClass} />
                    </div>

                    <div>
                        <label className="block text-sm text-muted mb-1">รายละเอียดเพิ่มเติม</label>
                        <textarea rows={3} maxLength={2000} value={form.detail} onChange={set('detail')} disabled={saving} placeholder="อธิบายอาการ ตำแหน่ง หรือช่วงเวลาที่สะดวกให้ช่างเข้า" className={inputClass} />
                    </div>

                    <div>
                        <label className="block text-sm text-muted mb-1">สถานะ</label>
                        <select value={form.status} onChange={set('status')} disabled={saving} className={inputClass}>
                            {repairStatusKeys.map((k) => (
                                <option key={k} value={k}>{repairStatuses[k].label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-muted mb-1">หมายเหตุถึงผู้เช่า (ผู้เช่าจะเห็นข้อความนี้)</label>
                        <textarea rows={2} maxLength={1000} value={form.admin_note} onChange={set('admin_note')} disabled={saving} placeholder="เช่น ช่างจะเข้าซ่อมวันพรุ่งนี้ช่วงบ่าย" className={inputClass} />
                    </div>

                    <div>
                        <label className="block text-sm text-muted mb-1">รูปภาพ</label>
                        <RepairImagePicker
                            file={file}
                            existingPath={existingPath}
                            disabled={saving}
                            onPick={(f) => setFile(f)}
                            onClear={() => {
                                setFile(null)
                                setRemoveExisting(true)
                            }}
                        />
                    </div>

                    {formError && <p className="text-sm text-red-600">{formError}</p>}

                    <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-4 pt-4 border-t border-line">
                        {!isNew ? (
                            <button type="button" disabled={saving} onClick={() => setConfirmDelete(true)} className="border border-red-500 text-red-600 hover:bg-red-50 rounded-xl px-8 py-2.5 text-sm font-semibold w-full sm:w-auto">
                                ลบ
                            </button>
                        ) : (
                            <div />
                        )}
                        <div className="flex gap-3 w-full sm:w-auto justify-end">
                            <button type="button" onClick={close} disabled={saving} className="border border-line text-muted hover:bg-sand rounded-xl px-8 py-2.5 text-sm font-semibold flex-1 sm:flex-initial">
                                ยกเลิก
                            </button>
                            <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark text-white rounded-xl px-10 py-2.5 text-sm font-semibold shadow-card flex-1 sm:flex-initial">
                                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                            </button>
                        </div>
                    </div>
                </form>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                        <div className="flex flex-wrap items-center gap-2">
                            {tabs.map((t) => (
                                <button
                                    key={t.key}
                                    onClick={() => setActiveTab(t.key)}
                                    className={`px-4 py-1.5 rounded-full text-sm font-medium border ${
                                        activeTab === t.key ? 'bg-primary text-white border-primary' : 'bg-white text-muted border-line hover:bg-sand'
                                    }`}
                                >
                                    {t.label} ({counts[t.key] ?? 0})
                                </button>
                            ))}
                        </div>
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="ค้นหาห้อง / ปัญหา / ผู้แจ้ง"
                            className="border border-line rounded-xl px-4 py-2 text-sm bg-white outline-none focus:border-secondary w-64 max-w-full"
                        />
                    </div>

                    <div className="bg-white rounded-2xl shadow-card p-6 overflow-x-auto border border-line">
                        {loading || loadError ? (
                            <p className={`text-center py-10 ${loadError ? 'text-red-600' : 'text-muted'}`}>{loading ? 'กำลังโหลด...' : loadError}</p>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-muted text-sm border-b border-line">
                                        <th className="pb-3 font-medium w-32">ห้อง</th>
                                        <th className="pb-3 font-medium w-28">วันที่</th>
                                        <th className="pb-3 font-medium">ปัญหา</th>
                                        <th className="pb-3 font-medium w-44 text-center">สถานะ</th>
                                        <th className="pb-3 w-24" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((r) => (
                                        <tr key={r.id} className="border-b border-line last:border-b-0 hover:bg-sand/40">
                                            <td className="py-3.5">
                                                <div className="font-bold text-ink">{r.room}</div>
                                                {r.tenant_name && <div className="text-xs text-muted">{r.tenant_name}</div>}
                                            </td>
                                            <td className="py-3.5 text-muted text-sm">{formatThaiDate(r.created_at)}</td>
                                            <td className="py-3.5 text-sm font-medium text-ink">
                                                <span className="inline-flex items-center gap-2">
                                                    {r.problem}
                                                    {r.image_path && <Icon name="image" className="w-4 h-4 text-secondary" />}
                                                </span>
                                            </td>
                                            <td className="py-3.5 text-center"><RepairStatusBadge status={r.status} /></td>
                                            <td className="py-3.5 text-right">
                                                <button onClick={() => openEdit(r)} className="bg-mist hover:bg-secondary/40 text-primary-dark font-medium px-3.5 py-1 rounded-md text-xs">
                                                    จัดการ
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {visible.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-10 text-center text-muted text-sm">
                                                {repairs.length === 0 ? 'ยังไม่มีรายการแจ้งซ่อม' : 'ไม่พบรายการที่ตรงกับเงื่อนไข'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {confirmDelete && (
                <ConfirmDialog title="ยืนยันการลบรายการ" confirmLabel="ลบรายการ" busy={saving} onCancel={() => setConfirmDelete(false)} onConfirm={handleDelete}>
                    ต้องการลบรายการแจ้งซ่อมห้อง <span className="font-semibold text-ink">{editing.room} ({editing.problem})</span> ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้
                </ConfirmDialog>
            )}
        </div>
    )
}

export default AdminRepairs
