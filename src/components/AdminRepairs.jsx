import { useEffect, useMemo, useState } from 'react'
import PageHeader from './PageHeader'
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

// ไอคอนและสีของการ์ดสรุปแต่ละสถานะ
const summaryMeta = {
    all: { icon: 'wrench', tone: 'bg-slate-100 text-slate-600' },
    pending: { icon: 'clock', tone: 'bg-sky-50 text-sky-700' },
    in_progress: { icon: 'review', tone: 'bg-amber-50 text-amber-700' },
    done: { icon: 'checkCircle', tone: 'bg-emerald-50 text-emerald-700' },
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
        <div className="p-4 sm:p-6 flex flex-col gap-5">
            <PageHeader flush title="ระบบแจ้งซ่อม" subtitle="จัดการเรื่องที่ผู้เช่าแจ้งซ่อม อัปเดตสถานะ และส่งข้อความถึงผู้เช่า" actions={
                    <>
                        {!editing && (
                        <button onClick={openNew} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-sm font-medium shadow-card flex items-center gap-1.5">
                            <Icon name="plus" className="w-4 h-4" />
                            แจ้งซ่อม
                        </button>
                    )}
                    </>
                } />

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
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {tabs.map((t) => {
                            const active = activeTab === t.key
                            const meta = summaryMeta[t.key]
                            return (
                                <button
                                    key={t.key}
                                    onClick={() => setActiveTab(t.key)}
                                    aria-pressed={active}
                                    className={`text-left rounded-2xl p-4 bg-white shadow-card border-2 transition ${active ? 'border-primary' : 'border-transparent hover:border-mist'}`}
                                >
                                    <div className="flex items-center justify-between text-sm text-muted">
                                        <span>{t.label}</span>
                                        <span className={`grid place-items-center w-8 h-8 rounded-lg ${meta.tone}`}><Icon name={meta.icon} className="w-[18px] h-[18px]" /></span>
                                    </div>
                                    <div className="mt-2 flex items-baseline gap-2">
                                        <span className="text-2xl font-semibold text-primary-dark">{counts[t.key] ?? 0}</span>
                                        <span className="text-xs text-muted">รายการ</span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    <div className="bg-white rounded-2xl shadow-card p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <h2 className="font-medium text-primary-dark">
                                รายการแจ้งซ่อม
                                <span className="ml-2 text-sm font-normal text-muted">({visible.length})</span>
                            </h2>
                            <div className="flex items-center gap-2 border border-line bg-sand/50 rounded-xl px-3 py-1.5 w-72 max-w-full focus-within:border-secondary focus-within:bg-white">
                                <Icon name="search" className="w-4 h-4 text-muted" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="ค้นหาห้อง ปัญหา หรือผู้แจ้ง"
                                    className="outline-none w-full bg-transparent text-sm"
                                />
                            </div>
                        </div>

                        {loading || loadError ? (
                            <p className={`text-center py-12 ${loadError ? 'text-red-600' : 'text-muted'}`}>{loading ? 'กำลังโหลด...' : loadError}</p>
                        ) : (
                            <div className="xl:overflow-auto xl:max-h-[36rem] xl:rounded-xl xl:border xl:border-line xl:shadow-sm">
                                <table className="hidden xl:table w-full min-w-[44rem] border-collapse text-sm">
                                    <thead className="sticky top-0 z-10">
                                        <tr className="bg-primary-dark text-white">
                                            <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center w-12">#</th>
                                            <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">ห้อง</th>
                                            <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-left">ผู้แจ้ง</th>
                                            <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">วันที่แจ้ง</th>
                                            <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-left">ปัญหา</th>
                                            <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">สถานะ</th>
                                            <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visible.map((r, index) => (
                                            <tr
                                                key={r.id}
                                                onClick={() => openEdit(r)}
                                                className={`cursor-pointer border-b border-line transition-colors hover:bg-mist/30 ${r.status === 'pending' ? 'bg-sky-50/50' : index % 2 ? 'bg-sand/40' : 'bg-white'}`}
                                            >
                                                <td className="px-3 py-3 border-x border-line/60 text-center text-xs text-muted tabular-nums">{index + 1}</td>
                                                <td className="px-3 py-3 border-x border-line/60 text-center">
                                                    <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold">{r.room}</span>
                                                </td>
                                                <td className="px-3 py-3 border-x border-line/60">{r.tenant_name || <span className="text-muted">-</span>}</td>
                                                <td className="px-3 py-3 border-x border-line/60 text-center text-muted whitespace-nowrap">{formatThaiDate(r.created_at)}</td>
                                                <td className="px-3 py-3 border-x border-line/60 font-medium text-ink">
                                                    <span className="inline-flex items-center gap-2">
                                                        {r.problem}
                                                        {r.image_path && <Icon name="image" className="w-4 h-4 text-secondary" />}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 border-x border-line/60 text-center"><RepairStatusBadge status={r.status} /></td>
                                                <td className="border-x border-line/60 px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <button onClick={() => openEdit(r)} className="px-4 py-1 rounded-lg text-sm bg-mist/60 text-primary-dark hover:bg-mist">จัดการ</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="xl:hidden grid gap-3 md:grid-cols-2">
                                    {visible.map((r) => (
                                        <div
                                            key={r.id}
                                            className={`rounded-2xl border border-line p-4 flex flex-col gap-3 ${r.status === 'pending' ? 'bg-sky-50/60' : 'bg-white'}`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold text-center">{r.room}</span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-medium text-ink">{r.problem}</div>
                                                    <div className="text-xs text-muted">
                                                        {r.tenant_name || '-'} · {formatThaiDate(r.created_at)}
                                                    </div>
                                                </div>
                                                <RepairStatusBadge status={r.status} />
                                            </div>
                                            <button onClick={() => openEdit(r)} className="py-2 rounded-xl text-sm bg-mist/60 text-primary-dark hover:bg-mist">จัดการเรื่องนี้</button>
                                        </div>
                                    ))}
                                </div>
                                {visible.length === 0 && (
                                    <div className="py-12 text-center text-muted">
                                        <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-full bg-sand text-muted"><Icon name="wrench" className="w-6 h-6" /></span>
                                        {repairs.length === 0 ? 'ยังไม่มีรายการแจ้งซ่อม' : 'ไม่พบรายการที่ตรงกับเงื่อนไข'}
                                    </div>
                                )}
                            </div>
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
