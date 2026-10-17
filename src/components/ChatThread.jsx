import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { ConfirmDialog } from './RepairParts'
import { MAX_MESSAGE_LENGTH, deleteMessage, editMessage, getChatImageUrl, loadThread, markChatRead, sendMessage, validateChatImage } from '../lib/chat'
import { supabase } from '../lib/supabaseClient'
import { useCurrentUser } from '../lib/useCurrentUser'

// รูปในข้อความ: ขอลิงก์ชั่วคราวแล้วแสดง กดเพื่อเปิดรูปเต็มขนาด
function ChatImage({ path, onLoad }) {
    const [url, setUrl] = useState(null)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        let active = true
        getChatImageUrl(path).then((u) => {
            if (!active) return
            if (u) setUrl(u)
            else setFailed(true)
        })
        return () => {
            active = false
        }
    }, [path])

    if (failed) return <div className="px-3 py-2 text-xs text-red-600 bg-white rounded-xl border border-line">โหลดรูปไม่สำเร็จ</div>
    if (!url) return <div className="w-48 h-36 rounded-xl bg-line/60 animate-pulse" aria-label="กำลังโหลดรูป" />
    return (
        <a href={url} target="_blank" rel="noreferrer" title="คลิกเพื่อเปิดรูปเต็มขนาด" className="block">
            <img src={url} alt="รูปที่ส่งในแชท" onLoad={onLoad} className="max-h-64 max-w-full w-auto rounded-xl object-contain border border-line bg-white" />
        </a>
    )
}

// 2026-10-17T09:05 -> 09:05
const formatTime = (iso) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
// หัวคั่นวัน: วันนี้ / เมื่อวาน / ส. 17 ต.ค. 69
const formatDay = (iso) => {
    const d = new Date(iso)
    const today = new Date()
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return 'วันนี้'
    if (d.toDateString() === yesterday.toDateString()) return 'เมื่อวาน'
    return d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' })
}

// เพิ่มหรือแทนที่ข้อความตาม id แล้วเรียงตามเวลา (กันข้อความซ้ำจาก realtime กับที่เพิ่งส่งเอง)
const upsert = (list, msg) => {
    const next = list.some((m) => m.id === msg.id) ? list.map((m) => (m.id === msg.id ? msg : m)) : [...list, msg]
    return next.sort((a, b) => a.created_at.localeCompare(b.created_at))
}

// ห้องแชทหนึ่งห้อง (ของผู้เช่า tenantUserId): รายการข้อความแบบเรียลไทม์ + ช่องพิมพ์
// isAdmin = มุมมองผู้ดูแล (ข้อความผู้ดูแลอยู่ฝั่งขวา) ใช้ key={tenantUserId} เพื่อเริ่มใหม่เมื่อเปลี่ยนห้อง
function ChatThread({ tenantUserId, isAdmin, title, subtitle, onBack }) {
    const myId = useCurrentUser()?.id
    const [messages, setMessages] = useState([])
    // ข้อความที่กำลังแก้ไข, ข้อความที่แตะเพื่อแสดงปุ่มแก้ไข/ลบ (จอสัมผัส), ข้อความที่รอยืนยันลบ
    const [editing, setEditing] = useState(null)
    const [activeId, setActiveId] = useState(null)
    const [deleteTarget, setDeleteTarget] = useState(null)
    const [deleting, setDeleting] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [draft, setDraft] = useState('')
    const [sending, setSending] = useState(false)
    // รูปที่เลือกจะส่ง และตัวอย่างรูป
    const [file, setFile] = useState(null)
    const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
    useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])
    const bottomRef = useRef(null)
    const inputRef = useRef(null)
    const fileRef = useRef(null)
    const listRef = useRef(null)
    // ผู้ใช้อยู่ล่างสุดของแชทไหม (รูปโหลดเสร็จแล้วจะเลื่อนตามเฉพาะตอนอยู่ล่างสุด)
    const atBottom = useRef(true)
    const onScroll = () => {
        const el = listRef.current
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    const scrollIfAtBottom = () => atBottom.current && bottomRef.current?.scrollIntoView({ block: 'end' })

    // เลือกรูป (จากปุ่มแนบหรือวางจากคลิปบอร์ด) ตรวจชนิดและขนาดก่อน
    const pickFile = (f) => {
        if (!f || editing) return
        const err = validateChatImage(f)
        if (err) return setError(err)
        setError('')
        setFile(f)
        inputRef.current?.focus()
    }
    const onPaste = (e) => {
        const item = [...e.clipboardData.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'))
        if (item) {
            e.preventDefault()
            pickFile(item.getAsFile())
        }
    }

    // ข้อความของฝั่งตัวเองแสดงด้านขวา แก้ไข/ลบได้เฉพาะข้อความที่ตัวเองส่งและยังไม่ถูกลบ
    const isMine = (m) => (isAdmin ? !m.from_tenant : m.from_tenant)
    const canManage = (m) => Boolean(myId) && m.sender_id === myId && !m.deleted_at

    // เริ่ม/ยกเลิกการแก้ไขข้อความ (ใช้ช่องพิมพ์ด้านล่าง)
    const startEdit = (m) => {
        setEditing(m)
        setDraft(m.body)
        setFile(null)
        setActiveId(null)
        setError('')
        inputRef.current?.focus()
    }
    const cancelEdit = () => {
        setEditing(null)
        setDraft('')
    }

    // ลบข้อความหลังกดยืนยัน
    const confirmDelete = async () => {
        const target = deleteTarget
        setDeleting(true)
        const { error: err } = await deleteMessage(target.id)
        setDeleting(false)
        setDeleteTarget(null)
        if (err) return setError(`ลบข้อความไม่สำเร็จ: ${err.message}`)
        setMessages((prev) => upsert(prev, { ...target, body: '', image_path: null, deleted_at: new Date().toISOString() }))
        if (editing?.id === target.id) cancelEdit()
    }

    // โหลดข้อความ แล้วรับข้อความใหม่/สถานะอ่านแล้วแบบเรียลไทม์
    useEffect(() => {
        let active = true
        loadThread(tenantUserId).then(({ messages: list, error: err }) => {
            if (!active) return
            setLoading(false)
            if (err) return setError(`โหลดข้อความไม่สำเร็จ: ${err.message}`)
            setMessages((prev) => list.reduce(upsert, prev))
            markChatRead(tenantUserId)
        })

        const channel = supabase
            .channel(`chat-thread-${tenantUserId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages', filter: `tenant_user_id=eq.${tenantUserId}` }, (payload) => {
                if (payload.eventType === 'DELETE') return
                const msg = payload.new
                setMessages((prev) => upsert(prev, msg))
                // ข้อความใหม่จากอีกฝั่งขณะเปิดหน้านี้อยู่ = อ่านแล้ว
                const fromOther = isAdmin ? msg.from_tenant : !msg.from_tenant
                if (payload.eventType === 'INSERT' && fromOther && document.visibilityState === 'visible') markChatRead(tenantUserId)
            })
            .subscribe()

        // กลับมาที่แท็บนี้: ทำเครื่องหมายอ่านแล้ว
        const onVisible = () => document.visibilityState === 'visible' && markChatRead(tenantUserId)
        document.addEventListener('visibilitychange', onVisible)
        return () => {
            active = false
            supabase.removeChannel(channel)
            document.removeEventListener('visibilitychange', onVisible)
        }
    }, [tenantUserId, isAdmin])

    // มีข้อความใหม่ให้เลื่อนลงล่างสุด
    useEffect(() => {
        atBottom.current = true
        bottomRef.current?.scrollIntoView({ block: 'end' })
    }, [messages.length])

    // บันทึกการแก้ไข (ข้อความที่มีรูป ลบตัวอักษรออกหมดได้ ข้อความล้วนต้องมีตัวอักษร)
    const saveEdit = async () => {
        const body = draft.trim()
        if (sending || (!body && !editing.image_path)) return
        if (body === editing.body) return cancelEdit()
        setSending(true)
        setError('')
        const { error: err } = await editMessage(editing.id, body)
        setSending(false)
        if (err) return setError(`แก้ไขข้อความไม่สำเร็จ: ${err.message}`)
        setMessages((prev) => upsert(prev, { ...editing, body, edited_at: new Date().toISOString() }))
        cancelEdit()
        inputRef.current?.focus()
    }

    // ส่งข้อความและ/หรือรูป (ส่งไม่สำเร็จให้คืนข้อความและรูปไว้ตามเดิม) ถ้ากำลังแก้ไขอยู่ = บันทึกการแก้ไข
    const handleSend = async (e) => {
        e?.preventDefault()
        if (editing) return saveEdit()
        const body = draft.trim()
        if ((!body && !file) || sending) return
        const sendingFile = file
        setSending(true)
        setError('')
        setDraft('')
        setFile(null)
        const { message, error: err } = await sendMessage(tenantUserId, body, sendingFile)
        setSending(false)
        if (err) {
            setDraft(body)
            setFile(sendingFile)
            setError(`ส่งข้อความไม่สำเร็จ: ${err.message}`)
        } else {
            setMessages((prev) => upsert(prev, message))
        }
        inputRef.current?.focus()
    }

    // Enter = ส่ง, Shift+Enter = ขึ้นบรรทัดใหม่, Esc = ยกเลิกการแก้ไข
    const onKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            handleSend()
        } else if (e.key === 'Escape' && editing) {
            cancelEdit()
        }
    }

    // ข้อความล่าสุดของฝั่งตัวเอง (แสดง "อ่านแล้ว" ใต้ข้อความนี้)
    const lastMine = [...messages].reverse().find(isMine)

    return (
        <div className="flex flex-col h-full min-h-0 bg-white">
            {/* หัวห้องแชท */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
                {onBack && (
                    <button type="button" onClick={onBack} aria-label="กลับไปรายการแชท" className="p-1.5 -ml-1.5 rounded-lg text-primary-dark hover:bg-mist/50 lg:hidden">
                        <Icon name="arrowLeft" className="w-5 h-5" />
                    </button>
                )}
                <span className="grid place-items-center w-10 h-10 rounded-full bg-mist text-primary-dark font-semibold shrink-0">
                    <Icon name={isAdmin ? 'user' : 'building'} className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                    <div className="font-medium text-ink truncate">{title}</div>
                    {subtitle && <div className="text-xs text-muted truncate">{subtitle}</div>}
                </div>
            </div>

            {/* รายการข้อความ */}
            <div ref={listRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 bg-sand/40">
                {loading ? (
                    <p className="text-center text-muted py-10">กำลังโหลด...</p>
                ) : messages.length === 0 ? (
                    <div className="h-full grid place-items-center text-center text-muted">
                        <div>
                            <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-full bg-white text-secondary"><Icon name="chat" className="w-6 h-6" /></span>
                            {isAdmin ? 'ยังไม่มีข้อความกับผู้เช่าคนนี้' : 'มีอะไรสอบถามผู้ดูแลหอพัก พิมพ์ข้อความได้เลย'}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {messages.map((m, i) => {
                            const mine = isMine(m)
                            const newDay = i === 0 || new Date(m.created_at).toDateString() !== new Date(messages[i - 1].created_at).toDateString()
                            return (
                                <div key={m.id}>
                                    {newDay && (
                                        <div className="my-3 text-center">
                                            <span className="px-3 py-1 rounded-full bg-white text-xs text-muted shadow-sm">{formatDay(m.created_at)}</span>
                                        </div>
                                    )}
                                    <div className={`group flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                                        {/* ปุ่มแก้ไข/ลบ: เอาเมาส์ชี้ (จอใหญ่) หรือแตะที่ข้อความ (จอสัมผัส) */}
                                        {canManage(m) && (
                                            <div className={`flex items-center gap-0.5 self-center transition-opacity ${activeId === m.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
                                                {m.body && (
                                                    <button type="button" onClick={() => startEdit(m)} aria-label="แก้ไขข้อความ" title="แก้ไข" className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-mist/50">
                                                        <Icon name="edit" className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button type="button" onClick={() => setDeleteTarget(m)} aria-label="ลบข้อความ" title="ลบ" className="p-1.5 rounded-lg text-muted hover:text-red-600 hover:bg-red-50">
                                                    <Icon name="trash" className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                        {mine && (
                                            <span className="text-[11px] text-muted shrink-0 text-right">
                                                {m.edited_at && !m.deleted_at && <span className="block">แก้ไขแล้ว</span>}
                                                {formatTime(m.created_at)}
                                            </span>
                                        )}
                                        <div
                                            onClick={() => canManage(m) && setActiveId((id) => (id === m.id ? null : m.id))}
                                            className={`max-w-[75%] flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'} ${editing?.id === m.id ? 'opacity-60' : ''}`}
                                        >
                                            {m.deleted_at ? (
                                                <div className="px-3.5 py-2 rounded-2xl text-sm italic text-muted border border-dashed border-line bg-white/60">ข้อความนี้ถูกลบแล้ว</div>
                                            ) : (
                                                <>
                                                    {m.image_path && <ChatImage path={m.image_path} onLoad={scrollIfAtBottom} />}
                                                    {m.body && (
                                                        <div
                                                            className={`px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                                                                mine ? 'bg-primary text-white rounded-br-md' : 'bg-white text-ink border border-line rounded-bl-md'
                                                            }`}
                                                        >
                                                            {m.body}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        {!mine && (
                                            <span className="text-[11px] text-muted shrink-0">
                                                {m.edited_at && !m.deleted_at && <span className="block">แก้ไขแล้ว</span>}
                                                {formatTime(m.created_at)}
                                            </span>
                                        )}
                                    </div>
                                    {m === lastMine && m.read_at && <div className="text-right text-[11px] text-muted mt-0.5">อ่านแล้ว</div>}
                                </div>
                            )
                        })}
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* ช่องพิมพ์ข้อความ */}
            <form onSubmit={handleSend} className="border-t border-line p-3 flex flex-col gap-1.5">
                {error && <p className="text-xs text-red-600">{error}</p>}
                {/* กำลังแก้ไขข้อความ */}
                {editing && (
                    <div className="flex items-center gap-2 rounded-xl bg-mist/40 px-3 py-1.5 text-xs text-primary-dark">
                        <Icon name="edit" className="w-4 h-4 shrink-0" />
                        <span className="truncate flex-1">แก้ไขข้อความ: {editing.body}</span>
                        <button type="button" onClick={cancelEdit} disabled={sending} aria-label="ยกเลิกการแก้ไข" className="p-1 rounded-lg hover:bg-white/70">
                            <Icon name="close" className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
                {/* ตัวอย่างรูปที่จะส่ง */}
                {preview && (
                    <div className="relative self-start">
                        <img src={preview} alt="รูปที่จะส่ง" className="h-24 w-auto rounded-xl border border-line object-cover" />
                        <button
                            type="button"
                            onClick={() => setFile(null)}
                            disabled={sending}
                            aria-label="นำรูปออก"
                            className="absolute -top-2 -right-2 grid place-items-center w-6 h-6 rounded-full bg-ink/80 text-white hover:bg-ink"
                        >
                            <Icon name="close" className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
                <div className="flex items-end gap-2">
                    {/* ปุ่มแนบรูป */}
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                            pickFile(e.target.files[0])
                            e.target.value = ''
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={sending || Boolean(editing)}
                        aria-label="แนบรูป"
                        title="แนบรูป (หรือวางรูปในช่องพิมพ์)"
                        className="grid place-items-center w-11 h-11 rounded-xl text-primary hover:bg-mist/50 disabled:opacity-40 shrink-0"
                    >
                        <Icon name="image" className="w-5 h-5" />
                    </button>
                    <textarea
                        ref={inputRef}
                        rows={1}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKeyDown}
                        onPaste={onPaste}
                        maxLength={MAX_MESSAGE_LENGTH}
                        placeholder="พิมพ์ข้อความ... (Shift+Enter ขึ้นบรรทัดใหม่)"
                        aria-label="ข้อความ"
                        className="flex-1 resize-none max-h-32 border border-line rounded-xl px-4 py-2.5 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30 field-sizing-content"
                    />
                    <button
                        type="submit"
                        disabled={(!draft.trim() && !file && !editing?.image_path) || sending}
                        aria-label={editing ? 'บันทึกการแก้ไข' : 'ส่งข้อความ'}
                        className="grid place-items-center w-11 h-11 rounded-xl bg-primary hover:bg-primary-dark text-white disabled:opacity-40 shrink-0"
                    >
                        <Icon name={editing ? 'check' : 'send'} className="w-5 h-5" />
                    </button>
                </div>
            </form>

            {/* ยืนยันลบข้อความ */}
            {deleteTarget && (
                <ConfirmDialog title="ลบข้อความนี้?" confirmLabel="ลบข้อความ" busy={deleting} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete}>
                    ข้อความ{deleteTarget.image_path ? 'และรูป' : ''}จะถูกลบสำหรับทั้งสองฝั่ง และจะแสดงว่า "ข้อความนี้ถูกลบแล้ว" แทน
                </ConfirmDialog>
            )}
        </div>
    )
}

export default ChatThread
