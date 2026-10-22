import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ChatThread from '../components/ChatThread'
import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import { loadConversations } from '../lib/chat'
import { supabase } from '../lib/supabaseClient'
import { useCurrentUser } from '../lib/useCurrentUser'

// ความสูงของกล่องแชท: เต็มจอที่เหลือหลังหัวหน้า (จอเล็กมีแถบเมนูด้านบนเพิ่ม)
const panelHeight = 'h-[calc(100dvh-10.5rem)] lg:h-[calc(100dvh-7.5rem)] min-h-[26rem]'

// เวลาข้อความล่าสุดในรายการห้องแชท: วันนี้แสดงเวลา วันอื่นแสดงวันที่
const formatListTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toDateString() === new Date().toDateString()
        ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

// หน้าแชท: ผู้เช่าคุยกับผู้ดูแลหอพัก / ผู้ดูแลเลือกห้องแชทของผู้เช่าแต่ละคน
function ChatPage() {
    const me = useCurrentUser()
    if (!me) return <p className="p-6 text-muted">กำลังโหลด...</p>
    return me.role === 'admin' ? <AdminChat /> : <TenantChat me={me} />
}

// ผู้เช่า: มีห้องแชทเดียวกับผู้ดูแล
function TenantChat({ me }) {
    return (
        <>
            <PageHeader title="แชท" subtitle="สอบถามหรือแจ้งเรื่องต่าง ๆ กับผู้ดูแลหอพัก" />
            <div className="px-4 sm:px-6 pb-6">
                <div className={`${panelHeight} rounded-2xl shadow-card overflow-hidden`}>
                    <ChatThread tenantUserId={me.id} isAdmin={false} title="ผู้ดูแลหอพัก" subtitle={me.tenant ? `ห้อง ${me.tenant.room}` : undefined} />
                </div>
            </div>
        </>
    )
}

// ผู้ดูแล: รายการห้องแชท (ผู้เช่าที่มีบัญชี) + ห้องแชทที่เลือก (?with=<id ผู้เช่า>)
function AdminChat() {
    const [searchParams, setSearchParams] = useSearchParams()
    const selectedId = searchParams.get('with')
    const [tenants, setTenants] = useState([])
    const [conversations, setConversations] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')

    // โหลดผู้เช่าที่มีบัญชี + สรุปห้องแชท แล้วโหลดสรุปใหม่เมื่อมีข้อความเปลี่ยน (เรียลไทม์)
    useEffect(() => {
        let active = true
        let timer = null
        const refresh = () =>
            loadConversations().then(({ conversations: list, error: err }) => {
                if (!active) return
                if (err) setError(`โหลดรายการแชทไม่สำเร็จ: ${err.message}`)
                else setConversations(list)
            })
        Promise.all([supabase.from('tenants').select('name, room, user_id').not('user_id', 'is', null), refresh()]).then(([{ data, error: err }]) => {
            if (!active) return
            if (err) setError(`โหลดรายชื่อผู้เช่าไม่สำเร็จ: ${err.message}`)
            setTenants(data ?? [])
            setLoading(false)
        })
        const channel = supabase
            .channel('chat-admin-list')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
                clearTimeout(timer)
                timer = setTimeout(refresh, 300)
            })
            .subscribe()
        return () => {
            active = false
            clearTimeout(timer)
            supabase.removeChannel(channel)
        }
    }, [])

    // รวมผู้เช่ากับสรุปห้องแชท (ผู้ที่ไม่ได้เช่าแล้วแต่ยังมีข้อความ แสดงเป็น "อดีตผู้เช่า")
    // เรียง: มีข้อความยังไม่อ่านก่อน แล้วตามข้อความล่าสุด ห้องที่ยังไม่เคยคุยเรียงตามเลขห้อง
    const rows = useMemo(() => {
        const byId = new Map(conversations.map((c) => [c.tenant_user_id, c]))
        const list = tenants.map((t) => ({ id: t.user_id, name: t.name, room: t.room, ...byId.get(t.user_id) }))
        conversations.forEach((c) => {
            if (!tenants.some((t) => t.user_id === c.tenant_user_id)) list.push({ id: c.tenant_user_id, name: 'อดีตผู้เช่า', room: '', ...c })
        })
        return list.sort(
            (a, b) =>
                (b.unread > 0) - (a.unread > 0) ||
                (b.last_at ?? '').localeCompare(a.last_at ?? '') ||
                a.room.localeCompare(b.room, undefined, { numeric: true }),
        )
    }, [tenants, conversations])

    const q = search.trim().toLowerCase()
    const visible = q ? rows.filter((r) => r.room.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) : rows
    const selected = rows.find((r) => r.id === selectedId)
    const select = (id) => setSearchParams(id ? { with: id } : {})

    return (
        <>
            <PageHeader title="แชท" subtitle="พูดคุยกับผู้เช่าแบบเรียลไทม์" />
            <div className="px-4 sm:px-6 pb-6">
                <div className={`${panelHeight} rounded-2xl shadow-card overflow-hidden bg-white flex`}>
                    {/* รายการห้องแชท (จอเล็ก: ซ่อนเมื่อเปิดห้องแชทอยู่) */}
                    <div className={`w-full lg:w-80 lg:shrink-0 lg:border-r border-line flex-col min-h-0 ${selectedId ? 'hidden lg:flex' : 'flex'}`}>
                        <div className="p-3 border-b border-line">
                            <div className="flex items-center gap-2 border border-line bg-sand/50 rounded-xl px-3 py-1.5 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/15 focus-within:bg-white">
                                <Icon name="search" className="w-4 h-4 text-muted" />
                                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาห้องหรือชื่อผู้เช่า" className="outline-none w-full bg-transparent text-sm" />
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto">
                            {loading ? (
                                <p className="text-center text-muted py-10">กำลังโหลด...</p>
                            ) : error ? (
                                <p className="text-center text-red-600 py-10 px-4 text-sm">{error}</p>
                            ) : visible.length === 0 ? (
                                <p className="text-center text-muted py-10 text-sm">{rows.length === 0 ? 'ยังไม่มีผู้เช่าที่มีบัญชีเข้าระบบ' : 'ไม่พบผู้เช่าที่ค้นหา'}</p>
                            ) : (
                                visible.map((r) => (
                                    <button
                                        key={r.id}
                                        type="button"
                                        onClick={() => select(r.id)}
                                        className={`w-full flex items-center gap-3 px-3 py-3 text-left border-b border-line/60 transition-colors ${r.id === selectedId ? 'bg-mist/50' : 'hover:bg-sand/60'}`}
                                    >
                                        <span className="grid place-items-center min-w-12 h-10 px-2 rounded-lg bg-mist/60 text-primary-dark text-sm font-semibold shrink-0">{r.room || '-'}</span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`truncate text-sm ${r.unread > 0 ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{r.name}</span>
                                                <span className="ml-auto text-[11px] text-muted shrink-0">{formatListTime(r.last_at)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`truncate text-xs ${r.unread > 0 ? 'text-ink' : 'text-muted'}`}>
                                                    {r.last_body ? `${r.last_from_tenant ? '' : 'คุณ: '}${r.last_body}` : 'ยังไม่มีข้อความ'}
                                                </span>
                                                {r.unread > 0 && (
                                                    <span className="ml-auto bg-red-500 text-white text-[11px] font-bold min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center shrink-0">
                                                        {r.unread > 99 ? '99+' : r.unread}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* ห้องแชทที่เลือก */}
                    <div className={`flex-1 min-w-0 min-h-0 ${selectedId ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'}`}>
                        {selectedId ? (
                            <ChatThread
                                key={selectedId}
                                tenantUserId={selectedId}
                                isAdmin
                                title={selected?.name ?? 'ผู้เช่า'}
                                subtitle={selected?.room ? `ห้อง ${selected.room}` : undefined}
                                onBack={() => select(null)}
                            />
                        ) : (
                            <div className="flex-1 grid place-items-center text-center text-muted bg-sand/40">
                                <div>
                                    <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-full bg-white text-secondary"><Icon name="chat" className="w-6 h-6" /></span>
                                    เลือกผู้เช่าทางซ้ายเพื่อเริ่มแชท
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}

export default ChatPage
