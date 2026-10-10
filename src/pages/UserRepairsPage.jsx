import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Icon from '../components/Icon'
import { ConfirmDialog, RepairImage, RepairImagePicker, RepairStatusBadge } from '../components/RepairParts'
import { repairStatuses, repairStatusKeys } from '../data/repairs'
import { formatDateTime } from '../lib/billing'
import { formatThaiDate, removeRepairImage, uploadRepairImage } from '../lib/repairs'
import { supabase } from '../lib/supabaseClient'
import { useCurrentUser } from '../lib/useCurrentUser'

const inputClass = 'w-full border border-line rounded-xl px-4 py-2 text-ink text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30 bg-white disabled:bg-sand/60'
const emptyForm = { problem: '', detail: '' }

const initialData = { repairs: [], loading: true, loadError: '' }

// ดึงรายการแจ้งซ่อมของผู้ใช้ (RLS ให้อ่านได้เฉพาะรายการของตัวเองอยู่แล้ว)
async function fetchRepairs(userId) {
    const { data, error } = await supabase.from('repairs').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) return { ...initialData, loading: false, loadError: `โหลดข้อมูลไม่สำเร็จ: ${error.message}` }
    return { repairs: data, loading: false, loadError: '' }
}

// แถบความคืบหน้า 3 ขั้น: รอดำเนินการ -> กำลังดำเนินการ -> เสร็จสิ้น
function Progress({ status }) {
    const current = repairStatusKeys.indexOf(status)
    return (
        <ol className="grid grid-cols-3">
            {repairStatusKeys.map((k, i) => {
                const isDone = i < current || status === 'done'
                const isCurrent = i === current && status !== 'done'
                const reached = i <= current
                return (
                    <li key={k} className="relative flex flex-col items-center gap-1.5">
                        {i > 0 && <span className={`absolute top-2.5 right-1/2 w-full h-0.5 -translate-y-1/2 ${reached ? 'bg-primary' : 'bg-line'}`} />}
                        <span
                            className={`relative z-10 grid place-items-center w-5 h-5 rounded-full ${
                                isDone
                                    ? 'bg-primary text-white'
                                    : isCurrent
                                      ? 'bg-white border-[5px] border-primary ring-4 ring-primary/15'
                                      : 'bg-white border-2 border-line'
                            }`}
                        >
                            {isDone && <Icon name="check" className="w-3 h-3" />}
                        </span>
                        <span className={`text-xs ${isCurrent ? 'text-primary-dark font-semibold' : reached ? 'text-primary-dark' : 'text-muted/60'}`}>
                            {repairStatuses[k].label}
                        </span>
                    </li>
                )
            })}
        </ol>
    )
}

function UserRepairsPage() {
    const me = useCurrentUser()
    const userId = me?.id
    const room = me?.tenant?.room

    const [data, setData] = useState(initialData)
    const { repairs, loading, loadError } = data
    const [activeTab, setActiveTab] = useState('all')
    const [notice, setNotice] = useState('')

    // editing: null = หน้ารายการ, 'new' = แจ้งซ่อมใหม่, ออบเจ็กต์ = แก้ไขรายการนั้น
    const [editing, setEditing] = useState(null)
    const [form, setForm] = useState(emptyForm)
    const [file, setFile] = useState(null)
    const [removeExisting, setRemoveExisting] = useState(false)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState('')
    const [cancelTarget, setCancelTarget] = useState(null)

    // โหลดซ้ำหลังแจ้ง/แก้ไข/ยกเลิก
    const load = async () => setData(await fetchRepairs(userId))

    // โหลดครั้งแรก: setState เกิดใน callback หลังได้ข้อมูล ไม่ได้เรียกตรง ๆ ใน effect
    useEffect(() => {
        if (!userId) return
        let active = true
        fetchRepairs(userId).then((result) => {
            if (active) setData(result)
        })
        return () => {
            active = false
        }
    }, [userId])

    // ข้อความแจ้งผลหายไปเองหลัง 4 วินาที
    useEffect(() => {
        if (!notice) return
        const t = setTimeout(() => setNotice(''), 4000)
        return () => clearTimeout(t)
    }, [notice])

    if (!me) return <p className="p-6 text-muted">กำลังโหลด...</p>

    const openNew = () => {
        setForm(emptyForm)
        setFile(null)
        setRemoveExisting(false)
        setFormError('')
        setEditing('new')
    }

    const openEdit = (repair) => {
        setForm({ problem: repair.problem, detail: repair.detail })
        setFile(null)
        setRemoveExisting(false)
        setFormError('')
        setEditing(repair)
    }

    const closeForm = () => {
        if (!saving) setEditing(null)
    }

    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (saving) return
        const isNew = editing === 'new'
        const problem = form.problem.trim()
        if (!problem) return setFormError('กรุณาระบุปัญหาที่พบ')

        setSaving(true)
        setFormError('')

        const oldPath = isNew ? null : editing.image_path
        let newPath = null
        if (file) {
            const res = await uploadRepairImage(file, me.id)
            if (res.error) {
                setSaving(false)
                return setFormError(res.error)
            }
            newPath = res.path
        }
        const image_path = newPath ?? (removeExisting ? null : oldPath)
        const fields = { problem, detail: form.detail.trim(), image_path }

        let error
        if (isNew) {
            const res = await supabase.from('repairs').insert({ ...fields, room, user_id: me.id })
            error = res.error
        } else {
            // ถ้าผู้ดูแลรับเรื่องไปแล้ว policy จะไม่ให้แก้ไข -> ไม่มีแถวที่ถูกอัปเดต
            const res = await supabase.from('repairs').update(fields).eq('id', editing.id).select('id')
            error = res.error || (res.data.length === 0 ? { message: 'ผู้ดูแลรับเรื่องนี้แล้ว จึงแก้ไขไม่ได้' } : null)
        }

        if (error) {
            if (newPath) await removeRepairImage(newPath)
            setSaving(false)
            setFormError(`บันทึกไม่สำเร็จ: ${error.message}`)
            return
        }
        if (oldPath && oldPath !== image_path) await removeRepairImage(oldPath)

        await load()
        setSaving(false)
        setEditing(null)
        setNotice(isNew ? 'ส่งเรื่องแจ้งซ่อมเรียบร้อยแล้ว' : 'บันทึกการแก้ไขเรียบร้อยแล้ว')
    }

    const handleCancel = async () => {
        setSaving(true)
        const { data, error } = await supabase.from('repairs').delete().eq('id', cancelTarget.id).select('id')
        if (error || data.length === 0) {
            setNotice(error ? `ยกเลิกไม่สำเร็จ: ${error.message}` : 'ผู้ดูแลรับเรื่องนี้แล้ว จึงยกเลิกไม่ได้')
        } else {
            await removeRepairImage(cancelTarget.image_path)
            setNotice('ยกเลิกการแจ้งซ่อมแล้ว')
        }
        await load()
        setSaving(false)
        setCancelTarget(null)
        setEditing(null)
    }

    const isNew = editing === 'new'
    // รายการที่ผู้ดูแลรับเรื่องแล้วจะแก้ไขไม่ได้ แสดงเป็นหน้าดูรายละเอียดอย่างเดียว
    const readOnly = !isNew && editing?.status !== 'pending'
    const existingPath = editing && !isNew && !removeExisting ? editing.image_path : null
    const active = repairs.filter((r) => r.status !== 'done').length
    const tabs = [{ key: 'all', label: 'ทั้งหมด' }, ...repairStatusKeys.map((k) => ({ key: k, label: repairStatuses[k].label }))]
    const countOf = (key) => (key === 'all' ? repairs.length : repairs.filter((r) => r.status === key).length)
    const visible = activeTab === 'all' ? repairs : repairs.filter((r) => r.status === activeTab)

    return (
        <>
            <PageHeader title="แจ้งซ่อม" subtitle="แจ้งปัญหาในห้องพักและติดตามสถานะการซ่อม" actions={
                    <>
                        {!editing && room && (
                        <button onClick={openNew} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-sm font-medium shadow-card flex items-center gap-1.5">
                            <Icon name="plus" className="w-4 h-4" />
                            แจ้งซ่อมใหม่
                        </button>
                    )}
                    </>
                } />

            <div className="px-4 sm:px-6 pb-8 flex flex-col gap-5">
                {notice && (
                    <div role="status" className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 text-emerald-900 text-sm px-4 py-3">
                        {notice}
                    </div>
                )}

                {!room ? (
                    <p className="text-center py-10 text-muted">บัญชีนี้ยังไม่ได้ผูกกับห้องพัก จึงยังไม่สามารถแจ้งซ่อมได้ กรุณาติดต่อผู้ดูแล</p>
                ) : editing ? (
                    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-card p-6 md:p-8 max-w-2xl w-full mx-auto border border-line flex flex-col gap-5">
                        <div className="flex items-center gap-3">
                            <button type="button" onClick={closeForm} disabled={saving} aria-label="กลับ" className="text-muted hover:text-primary-dark">
                                <Icon name="arrowLeft" />
                            </button>
                            <h2 className="text-lg font-semibold text-primary-dark">{isNew ? 'แจ้งซ่อมใหม่' : readOnly ? 'รายละเอียดการแจ้งซ่อม' : 'แก้ไขเรื่องแจ้งซ่อม'}</h2>
                            {!isNew && <div className="ml-auto"><RepairStatusBadge status={editing.status} /></div>}
                        </div>

                        {!isNew && (
                            <div className="rounded-xl bg-sand/60 border border-line px-4 py-4">
                                <Progress status={editing.status} />
                                <p className="text-xs text-muted text-center mt-3">แจ้งเมื่อ {formatDateTime(editing.created_at)}</p>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm text-muted mb-1">ห้อง</label>
                            <input disabled value={room} className={inputClass} />
                        </div>

                        <div>
                            <label className="block text-sm text-muted mb-1">ปัญหาที่พบ <span className="text-red-500">*</span></label>
                            <input required maxLength={200} value={form.problem} onChange={set('problem')} disabled={saving || readOnly} placeholder="เช่น หลอดไฟขาด, ก๊อกน้ำรั่ว" className={inputClass} />
                        </div>

                        <div>
                            <label className="block text-sm text-muted mb-1">รายละเอียดเพิ่มเติม</label>
                            <textarea rows={4} maxLength={2000} value={form.detail} onChange={set('detail')} disabled={saving || readOnly} placeholder="อธิบายอาการ ตำแหน่ง หรือช่วงเวลาที่สะดวกให้ช่างเข้า" className={inputClass} />
                        </div>

                        <div>
                            <label className="block text-sm text-muted mb-1">รูปภาพ (ถ้ามี)</label>
                            {readOnly ? (
                                editing.image_path ? (
                                    <div className="rounded-2xl bg-sand/70 border border-line p-4 flex justify-center">
                                        <RepairImage path={editing.image_path} className="max-h-72" />
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted">ไม่มีรูปภาพ</p>
                                )
                            ) : (
                                <RepairImagePicker
                                file={file}
                                existingPath={existingPath}
                                disabled={saving}
                                onPick={setFile}
                                onClear={() => {
                                    setFile(null)
                                    setRemoveExisting(true)
                                }}
                            />
                            )}
                        </div>

                        {!isNew && editing.admin_note && (
                            <div className="rounded-xl bg-mist/40 border-l-4 border-primary px-4 py-3">
                                <div className="text-xs font-semibold text-primary-dark mb-0.5">ข้อความจากผู้ดูแล</div>
                                <p className="text-sm text-ink whitespace-pre-line wrap-break-word">{editing.admin_note}</p>
                            </div>
                        )}

                        {!isNew && editing.status === 'done' && editing.completed_at && (
                            <p className="text-sm font-medium text-emerald-700 flex items-center gap-1.5">
                                <Icon name="checkCircle" className="w-4 h-4" />
                                ซ่อมเสร็จเมื่อ {formatDateTime(editing.completed_at)}
                            </p>
                        )}

                        {formError && <p className="text-sm text-red-600">{formError}</p>}

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-line">
                            {!isNew && !readOnly ? (
                                <button type="button" onClick={() => setCancelTarget(editing)} disabled={saving} className="flex items-center gap-1.5 text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl text-sm">
                                    <Icon name="trash" className="w-4 h-4" />
                                    ยกเลิกการแจ้ง
                                </button>
                            ) : (
                                <span />
                            )}
                            <div className="flex gap-3">
                                <button type="button" onClick={closeForm} disabled={saving} className="border border-line text-muted hover:bg-sand rounded-xl px-8 py-2.5 text-sm font-semibold">
                                    {readOnly ? 'ปิด' : 'ยกเลิก'}
                                </button>
                                {!readOnly && (
                                    <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark text-white rounded-xl px-8 py-2.5 text-sm font-semibold shadow-card flex items-center gap-2">
                                        <Icon name="send" className="w-4 h-4" />
                                        {saving ? 'กำลังส่ง...' : isNew ? 'ส่งเรื่อง' : 'บันทึก'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </form>
                ) : loading || loadError ? (
                    <p className={`text-center py-10 ${loadError ? 'text-red-600' : 'text-muted'}`}>{loading ? 'กำลังโหลด...' : loadError}</p>
                ) : (
                    <>
                        <div className="rounded-2xl bg-linear-to-br from-primary-dark to-primary text-white p-6 shadow-card flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <div className="text-sm text-white/75">ห้อง {room}</div>
                                <div className="text-3xl font-semibold mt-1">
                                    {active > 0 ? `${active} รายการที่ยังไม่เสร็จ` : 'ไม่มีรายการค้างซ่อม'}
                                </div>
                            </div>
                            <Icon name="wrench" className="w-12 h-12 text-white/30" />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {tabs.map((t) => (
                                <button
                                    key={t.key}
                                    onClick={() => setActiveTab(t.key)}
                                    className={`px-4 py-1.5 rounded-full text-sm font-medium border ${
                                        activeTab === t.key ? 'bg-primary text-white border-primary' : 'bg-white text-muted border-line hover:bg-sand'
                                    }`}
                                >
                                    {t.label} ({countOf(t.key)})
                                </button>
                            ))}
                        </div>

                        {visible.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-line shadow-card text-center py-12 text-muted">
                                {repairs.length === 0 ? (
                                    <>
                                        <p>ยังไม่เคยแจ้งซ่อม</p>
                                        <button onClick={openNew} className="mt-3 text-primary hover:underline font-medium">แจ้งซ่อมรายการแรก</button>
                                    </>
                                ) : (
                                    <p>ไม่มีรายการในสถานะนี้</p>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl shadow-card p-5">
                                <div className="overflow-auto rounded-xl border border-line shadow-sm">
                                    <table className="w-full min-w-[34rem] border-collapse text-sm">
                                        <thead>
                                            <tr className="bg-primary-dark text-white">
                                                <th className="px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10 text-center w-12">#</th>
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
                                                    <td className="px-3 py-3 border-x border-line/60 text-center text-muted whitespace-nowrap">{formatThaiDate(r.created_at)}</td>
                                                    <td className="px-3 py-3 border-x border-line/60 font-medium text-ink">
                                                        <span className="inline-flex items-center gap-2">
                                                            {r.problem}
                                                            {r.image_path && <Icon name="image" className="w-4 h-4 text-secondary" />}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 border-x border-line/60 text-center"><RepairStatusBadge status={r.status} /></td>
                                                    <td className="border-x border-line/60 px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                        <button onClick={() => openEdit(r)} className="px-4 py-1 rounded-lg text-sm bg-mist/60 text-primary-dark hover:bg-mist whitespace-nowrap">
                                                            {r.status === 'pending' ? 'แก้ไข' : 'ดูรายละเอียด'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {cancelTarget && (
                <ConfirmDialog title="ยืนยันการยกเลิก" confirmLabel="ยกเลิกการแจ้ง" busy={saving} onCancel={() => setCancelTarget(null)} onConfirm={handleCancel}>
                    ต้องการยกเลิกการแจ้งซ่อม <span className="font-semibold text-ink">{cancelTarget.problem}</span> ใช่หรือไม่?
                </ConfirmDialog>
            )}
        </>
    )
}

export default UserRepairsPage
