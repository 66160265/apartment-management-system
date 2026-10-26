import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import { ConfirmDialog } from '../components/RepairParts'
import Switch from '../components/Switch'
import { formatDateTime } from '../lib/billing'
import {
    BODY_MAX, TITLE_MAX, countRecipients, createAnnouncement, deleteAnnouncement, loadAnnouncements, updateAnnouncement, validateAnnouncement,
} from '../lib/announcements'
import { useRealtimeReload } from '../lib/realtime'
import { useCurrentUser } from '../lib/useCurrentUser'
import { SkeletonCards } from '../components/Skeleton.jsx'

const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white focus:ring-4 focus:ring-secondary/15'

// ฟอร์มหัวข้อ + เนื้อหา + ประกาศสำคัญ ใช้ทั้งตอนลงประกาศใหม่และตอนแก้ไข
function AnnouncementForm({ value, onChange, disabled }) {
    return (
        <div className="flex flex-col gap-3">
            <label className="text-sm text-muted">
                <span className="flex justify-between">
                    <span>หัวข้อ</span>
                    <span className="text-xs tabular-nums">{value.title.length}/{TITLE_MAX}</span>
                </span>
                <input
                    className={inputClass}
                    value={value.title}
                    maxLength={TITLE_MAX}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...value, title: e.target.value })}
                    placeholder="เช่น งดจ่ายน้ำวันที่ 25 ต.ค. เวลา 9.00-12.00 น."
                />
            </label>
            <label className="text-sm text-muted">
                <span className="flex justify-between">
                    <span>รายละเอียด (ไม่บังคับ)</span>
                    <span className="text-xs tabular-nums">{value.body.length}/{BODY_MAX}</span>
                </span>
                <textarea
                    rows="4"
                    className={inputClass}
                    value={value.body}
                    maxLength={BODY_MAX}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...value, body: e.target.value })}
                />
            </label>
            <div>
                <Switch checked={value.important} onChange={(v) => onChange({ ...value, important: v })} disabled={disabled}>
                    ประกาศสำคัญ (ไฮไลต์ให้เห็นเด่น)
                </Switch>
            </div>
        </div>
    )
}

// ส่วนลงประกาศใหม่ (แอดมิน): กรอก -> ตรวจ -> ยืนยันว่าจะแจ้งเตือนผู้เช่ากี่คน -> ลง
function Composer({ onPosted }) {
    const [form, setForm] = useState({ title: '', body: '', important: false })
    const [confirming, setConfirming] = useState(false)
    const [recipients, setRecipients] = useState(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [done, setDone] = useState(false)

    const change = (next) => {
        setForm(next)
        setError('')
        setDone(false)
        setConfirming(false)
    }

    // กด "ลงประกาศ": ตรวจข้อมูลแล้วถามยืนยันพร้อมจำนวนผู้เช่าที่จะได้รับแจ้งเตือน (ลงแล้วแจ้งทันที ถอนการแจ้งเตือนที่ส่งไปแล้วไม่ได้)
    const askConfirm = async () => {
        const invalid = validateAnnouncement(form)
        if (invalid) return setError(invalid)
        setRecipients(await countRecipients())
        setConfirming(true)
    }

    const post = async () => {
        setSaving(true)
        const err = await createAnnouncement(form)
        setSaving(false)
        if (err) {
            setConfirming(false)
            return setError(err)
        }
        setForm({ title: '', body: '', important: false })
        setConfirming(false)
        setDone(true)
        await onPosted()
    }

    return (
        <section aria-label="ลงประกาศใหม่" className="bg-white rounded-2xl shadow-card border border-line p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-mist/60 text-primary-dark"><Icon name="megaphone" className="w-5 h-5" /></span>
                <div>
                    <h2 className="font-medium text-primary-dark">ลงประกาศใหม่</h2>
                    <p className="text-xs text-muted">ผู้เช่าทุกคนที่มีบัญชีจะได้รับแจ้งเตือนในเว็บทันที</p>
                </div>
            </div>
            <AnnouncementForm value={form} onChange={change} disabled={saving} />
            {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            {done && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200 rounded-xl px-4 py-2">ลงประกาศแล้ว ผู้เช่าได้รับแจ้งเตือนเรียบร้อย</p>}
            {confirming ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3">
                    <p className="text-sm text-amber-900">
                        {recipients === null ? 'ลงประกาศนี้ถึงผู้เช่าทุกคน?' : `ลงประกาศนี้และแจ้งเตือนผู้เช่า ${recipients} คน?`} แจ้งเตือนที่ส่งไปแล้วเรียกคืนไม่ได้
                    </p>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setConfirming(false)} disabled={saving} className="border border-line bg-white text-muted hover:bg-sand px-4 py-1.5 rounded-xl text-sm">กลับไปแก้</button>
                        <button type="button" onClick={post} disabled={saving} className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-5 py-1.5 rounded-xl text-sm font-medium shadow-card">
                            {saving ? 'กำลังลงประกาศ...' : 'ยืนยันลงประกาศ'}
                        </button>
                    </div>
                </div>
            ) : (
                <div>
                    <button type="button" onClick={askConfirm} className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-xl shadow-card font-medium">ลงประกาศ</button>
                </div>
            )}
        </section>
    )
}

// การ์ดประกาศหนึ่งรายการ: ผู้เช่าอ่านอย่างเดียว แอดมินแก้ไข/ลบได้
function AnnouncementCard({ item, isAdmin, onChanged }) {
    const [editing, setEditing] = useState(false)
    const [form, setForm] = useState({ title: item.title, body: item.body, important: item.important })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const save = async () => {
        setSaving(true)
        const err = await updateAnnouncement(item.id, form)
        setSaving(false)
        if (err) return setError(err)
        setEditing(false)
        await onChanged()
    }

    const remove = async () => {
        setDeleting(true)
        const err = await deleteAnnouncement(item.id)
        setDeleting(false)
        setConfirmDelete(false)
        if (err) return setError(err)
        await onChanged()
    }

    const tone = item.important ? 'border-l-amber-500 bg-amber-50/40' : 'border-l-primary bg-white'

    return (
        <article className={`rounded-2xl shadow-card border border-line border-l-4 p-4 sm:p-5 flex flex-col gap-3 ${tone}`}>
            {editing ? (
                <>
                    <AnnouncementForm value={form} onChange={(v) => { setForm(v); setError('') }} disabled={saving} />
                    <p className="text-xs text-muted">แก้ประกาศแล้วจะไม่แจ้งเตือนผู้เช่าซ้ำ</p>
                    {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
                    <div className="flex gap-2">
                        <button type="button" onClick={save} disabled={saving} className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-5 py-1.5 rounded-xl text-sm font-medium">{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
                        <button type="button" onClick={() => { setEditing(false); setError(''); setForm({ title: item.title, body: item.body, important: item.important }) }} disabled={saving} className="border border-line text-muted hover:bg-sand px-4 py-1.5 rounded-xl text-sm">ยกเลิก</button>
                    </div>
                </>
            ) : (
                <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                {item.important && <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 ring-1 ring-amber-200">สำคัญ</span>}
                                <h3 className="text-base font-semibold text-primary-dark break-words">{item.title}</h3>
                            </div>
                            <p className="text-xs text-muted mt-0.5">
                                {formatDateTime(item.created_at)}
                                {item.updated_at && ' · แก้ไขแล้ว'}
                            </p>
                        </div>
                        {isAdmin && (
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setEditing(true)} className="border border-line bg-white text-primary-dark hover:bg-mist/40 px-4 py-2 sm:px-3 sm:py-1 rounded-lg text-sm">แก้ไข</button>
                                <button type="button" onClick={() => setConfirmDelete(true)} className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 px-4 py-2 sm:px-3 sm:py-1 rounded-lg text-sm">ลบ</button>
                            </div>
                        )}
                    </div>
                    {item.body && <p className="text-sm text-ink whitespace-pre-wrap break-words">{item.body}</p>}
                    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                </>
            )}
            {confirmDelete && (
                <ConfirmDialog title="ลบประกาศ" confirmLabel="ลบประกาศ" busy={deleting} onCancel={() => setConfirmDelete(false)} onConfirm={remove}>
                    ลบประกาศ &quot;{item.title}&quot; ออกจากรายการ (แจ้งเตือนที่ส่งไปแล้วจะยังอยู่ในกระดิ่งของผู้เช่า)
                </ConfirmDialog>
            )}
        </article>
    )
}

// หน้าประกาศ: ผู้เช่าและแอดมินอ่านได้ แอดมินลง/แก้/ลบได้
function AnnouncementsPage() {
    const me = useCurrentUser()
    const isAdmin = me?.role === 'admin'
    // null = กำลังโหลด, 'unavailable' = โหลดไม่ได้ (ยังไม่มีตาราง)
    const [items, setItems] = useState(null)

    const reload = useCallback(async () => {
        const list = await loadAnnouncements()
        setItems(list ?? 'unavailable')
    }, [])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        reload()
    }, [reload])

    // ประกาศใหม่/ถูกแก้/ถูกลบ แสดงเองไม่ต้องรีเฟรช
    useRealtimeReload(['announcements'], reload)

    return (
        <>
            <PageHeader title="ประกาศ" subtitle={isAdmin ? 'ลงประกาศแจ้งผู้เช่าทุกคน เช่น งดน้ำ-ไฟ ซ่อมบำรุง กฎของหอพัก' : 'ข่าวสารและประกาศจากผู้ดูแลหอพัก'} />
            <div className="px-4 sm:px-6 pb-10 flex flex-col gap-4">
                {isAdmin && <Composer onPosted={reload} />}

                {items === null ? (
                    <SkeletonCards count={3} lines={3} />
                ) : items === 'unavailable' ? (
                    <p className="text-sm text-muted bg-white rounded-2xl shadow-card p-4 sm:p-5">ยังใช้ระบบประกาศไม่ได้ เพราะยังไม่ได้ติดตั้งฟีเจอร์นี้ในระบบหลังบ้าน กรุณาแจ้งผู้พัฒนาระบบ</p>
                ) : items.length === 0 ? (
                    <div className="bg-white rounded-2xl shadow-card border border-line p-10 text-center text-muted flex flex-col items-center gap-2">
                        <Icon name="megaphone" className="w-8 h-8" />
                        <p>ยังไม่มีประกาศ</p>
                    </div>
                ) : (
                    items.map((item) => <AnnouncementCard key={item.id} item={item} isAdmin={isAdmin} onChanged={reload} />)
                )}
            </div>
        </>
    )
}

export default AnnouncementsPage
