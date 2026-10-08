import { useEffect, useState } from 'react'
import AvatarMenu from '../components/AvatarMenu'
import UserNotificationBell from '../components/UserNotificationBell'
import Icon from '../components/Icon'
import { ConfirmDialog, RepairImage, RepairImagePicker, RepairStatusBadge } from '../components/RepairParts'
import { repairStatuses, repairStatusKeys } from '../data/repairs'
import { formatDateTime } from '../lib/billing'
import { removeRepairImage, uploadRepairImage } from '../lib/repairs'
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
        <ol className="flex flex-wrap items-center gap-2 text-xs">
            {repairStatusKeys.map((k, i) => (
                <li key={k} className="flex items-center gap-2">
                    <span className={`flex items-center gap-1.5 ${i <= current ? 'text-primary-dark font-medium' : 'text-muted/70'}`}>
                        <span className={`grid place-items-center w-4 h-4 rounded-full ${i <= current ? 'bg-primary text-white' : 'bg-line'}`}>
                            {i < current || status === 'done' ? <Icon name="check" className="w-3 h-3" /> : null}
                        </span>
                        {repairStatuses[k].label}
                    </span>
                    {i < repairStatusKeys.length - 1 && <span className={`w-6 h-px ${i < current ? 'bg-primary' : 'bg-line'}`} />}
                </li>
            ))}
        </ol>
    )
}

function RepairCard({ repair, onEdit, onCancel }) {
    const canChange = repair.status === 'pending'
    return (
        <article className="bg-white rounded-2xl shadow-card border border-line p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="font-semibold text-ink wrap-break-word">{repair.problem}</h3>
                    <p className="text-xs text-muted mt-0.5">แจ้งเมื่อ {formatDateTime(repair.created_at)}</p>
                </div>
                <RepairStatusBadge status={repair.status} />
            </div>

            <Progress status={repair.status} />

            {repair.detail && <p className="text-sm text-ink/80 whitespace-pre-line wrap-break-word">{repair.detail}</p>}

            {repair.image_path && <RepairImage path={repair.image_path} className="max-h-48" />}

            {repair.admin_note && (
                <div className="rounded-xl bg-mist/50 border border-mist px-4 py-3 text-sm">
                    <div className="text-xs font-medium text-primary-dark mb-0.5">ข้อความจากผู้ดูแล</div>
                    <p className="whitespace-pre-line wrap-break-word">{repair.admin_note}</p>
                </div>
            )}

            {repair.status === 'done' && repair.completed_at && (
                <p className="text-xs text-emerald-700">ซ่อมเสร็จเมื่อ {formatDateTime(repair.completed_at)}</p>
            )}

            {canChange && (
                <div className="flex justify-end gap-2 pt-3 border-t border-line">
                    <button onClick={() => onCancel(repair)} className="border border-red-300 text-red-600 hover:bg-red-50 px-4 py-1.5 rounded-lg text-sm">
                        ยกเลิกการแจ้ง
                    </button>
                    <button onClick={() => onEdit(repair)} className="bg-mist hover:bg-secondary/40 text-primary-dark px-4 py-1.5 rounded-lg text-sm font-medium">
                        แก้ไข
                    </button>
                </div>
            )}
        </article>
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
    }

    const isNew = editing === 'new'
    const existingPath = editing && !isNew && !removeExisting ? editing.image_path : null
    const active = repairs.filter((r) => r.status !== 'done').length
    const tabs = [{ key: 'all', label: 'ทั้งหมด' }, ...repairStatusKeys.map((k) => ({ key: k, label: repairStatuses[k].label }))]
    const countOf = (key) => (key === 'all' ? repairs.length : repairs.filter((r) => r.status === key).length)
    const visible = activeTab === 'all' ? repairs : repairs.filter((r) => r.status === activeTab)

    return (
        <>
            <div className="flex justify-between items-start gap-4 p-6 pb-4">
                <div>
                    <h1 className="text-2xl font-semibold text-primary-dark">แจ้งซ่อม</h1>
                    <p className="text-sm text-muted mt-1">แจ้งปัญหาในห้องพักและติดตามสถานะการซ่อม</p>
                </div>
                <div className="flex items-center gap-3">
                    {!editing && room && (
                        <button onClick={openNew} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-sm font-medium shadow-card flex items-center gap-1.5">
                            <Icon name="plus" className="w-4 h-4" />
                            แจ้งซ่อมใหม่
                        </button>
                    )}
                    <UserNotificationBell />
                    <AvatarMenu />
                </div>
            </div>

            <div className="px-6 pb-8 flex flex-col gap-5">
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
                            <h2 className="text-lg font-semibold text-primary-dark">{isNew ? 'แจ้งซ่อมใหม่' : 'แก้ไขเรื่องแจ้งซ่อม'}</h2>
                        </div>

                        <div>
                            <label className="block text-sm text-muted mb-1">ห้อง</label>
                            <input disabled value={room} className={inputClass} />
                        </div>

                        <div>
                            <label className="block text-sm text-muted mb-1">ปัญหาที่พบ <span className="text-red-500">*</span></label>
                            <input required maxLength={200} value={form.problem} onChange={set('problem')} disabled={saving} placeholder="เช่น หลอดไฟขาด, ก๊อกน้ำรั่ว" className={inputClass} />
                        </div>

                        <div>
                            <label className="block text-sm text-muted mb-1">รายละเอียดเพิ่มเติม</label>
                            <textarea rows={4} maxLength={2000} value={form.detail} onChange={set('detail')} disabled={saving} placeholder="อธิบายอาการ ตำแหน่ง หรือช่วงเวลาที่สะดวกให้ช่างเข้า" className={inputClass} />
                        </div>

                        <div>
                            <label className="block text-sm text-muted mb-1">รูปภาพ (ถ้ามี)</label>
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
                        </div>

                        {formError && <p className="text-sm text-red-600">{formError}</p>}

                        <div className="flex justify-end gap-3 pt-4 border-t border-line">
                            <button type="button" onClick={closeForm} disabled={saving} className="border border-line text-muted hover:bg-sand rounded-xl px-8 py-2.5 text-sm font-semibold">
                                ยกเลิก
                            </button>
                            <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark text-white rounded-xl px-8 py-2.5 text-sm font-semibold shadow-card flex items-center gap-2">
                                <Icon name="send" className="w-4 h-4" />
                                {saving ? 'กำลังส่ง...' : isNew ? 'ส่งเรื่อง' : 'บันทึก'}
                            </button>
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
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                {visible.map((r) => (
                                    <RepairCard key={r.id} repair={r} onEdit={openEdit} onCancel={setCancelTarget} />
                                ))}
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
