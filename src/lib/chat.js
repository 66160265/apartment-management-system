import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabaseClient'
import { useCurrentUser } from './useCurrentUser'

// แชทผู้เช่า <-> ผู้ดูแล: เก็บในตาราง chat_messages (ดู supabase/chat.sql)
// ผู้เช่า 1 คน = 1 ห้องแชท ระบุด้วย tenant_user_id (id บัญชีผู้เช่า)

export const MAX_MESSAGE_LENGTH = 2000
const THREAD_LIMIT = 300

// โหลดข้อความล่าสุดของห้องแชท เรียงจากเก่าไปใหม่
export async function loadThread(tenantUserId) {
    const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('tenant_user_id', tenantUserId)
        .order('created_at', { ascending: false })
        .limit(THREAD_LIMIT)
    return { messages: (data ?? []).reverse(), error }
}

// ส่งข้อความและ/หรือรูป (ผู้ส่ง ฝั่ง และเวลา ฐานข้อมูลกำหนดเอง) คืนแถวที่บันทึกแล้ว
// มีรูป: อัปโหลดเข้าโฟลเดอร์ของห้องแชทก่อน ถ้าบันทึกข้อความไม่สำเร็จให้ลบรูปทิ้ง
export async function sendMessage(tenantUserId, body, file = null) {
    let image_path = null
    if (file) {
        const path = `${tenantUserId}/${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
        if (error) return { error: { message: `อัปโหลดรูปไม่สำเร็จ (${error.message})` } }
        image_path = path
    }
    const { data, error } = await supabase.from('chat_messages').insert({ tenant_user_id: tenantUserId, body, image_path }).select().single()
    if (error && image_path) await supabase.storage.from(BUCKET).remove([image_path])
    return { message: data, error }
}

// แก้ไขข้อความของตัวเอง (แก้ได้เฉพาะตัวอักษร)
export async function editMessage(id, body) {
    const { error } = await supabase.rpc('chat_edit_message', { p_id: id, p_body: body })
    return { error }
}

// ลบข้อความของตัวเอง (แถวยังอยู่แต่แสดงเป็น "ข้อความนี้ถูกลบแล้ว") แล้วลบรูปออกจาก storage ด้วย
export async function deleteMessage(id) {
    const { data: imagePath, error } = await supabase.rpc('chat_delete_message', { p_id: id })
    if (!error && imagePath) await supabase.storage.from(BUCKET).remove([imagePath])
    return { error }
}

// ---- รูปในแชท (bucket ส่วนตัว ต้องขอลิงก์ชั่วคราว) ----

const BUCKET = 'chat'
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_IMAGE_SIZE = 5 * 1024 * 1024

// คืนข้อความ error หรือสตริงว่างเมื่อไฟล์ใช้ได้
export function validateChatImage(file) {
    if (!IMAGE_TYPES[file.type]) return 'ส่งได้เฉพาะรูป JPG, PNG หรือ WEBP'
    if (file.size > MAX_IMAGE_SIZE) return 'รูปต้องมีขนาดไม่เกิน 5 MB'
    return ''
}

// แคชลิงก์รูป (อายุ 1 ชั่วโมง ใช้ซ้ำได้ 50 นาที) ไม่ต้องขอใหม่ทุกครั้งที่แสดงผล
const urlCache = new Map()
export async function getChatImageUrl(path) {
    const hit = urlCache.get(path)
    if (hit && hit.expires > Date.now()) return hit.url
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
    if (data?.signedUrl) urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 })
    return data?.signedUrl ?? null
}

// ทำเครื่องหมายว่าอ่านข้อความของอีกฝั่งในห้องนี้แล้ว
export async function markChatRead(tenantUserId) {
    const { error } = await supabase.rpc('chat_mark_read', { p_tenant: tenantUserId })
    if (!error) refreshUnread()
}

// รายการห้องแชท (เฉพาะผู้ดูแล): ข้อความล่าสุด + จำนวนที่ยังไม่อ่านของแต่ละห้อง
export async function loadConversations() {
    const { data, error } = await supabase.rpc('chat_conversations')
    return { conversations: data ?? [], error }
}

// ---- จำนวนข้อความที่ยังไม่อ่าน (ใช้ร่วมกันระหว่างเมนูข้างและหน้าแชท) ----

let state = { userId: null, count: 0 }
const listeners = new Set()
let refs = 0
let channel = null
let current = null // { userId, isAdmin }
let timer = null

const emit = (patch) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
}
const subscribe = (l) => {
    listeners.add(l)
    return () => listeners.delete(l)
}
const getSnapshot = () => state

// นับข้อความของอีกฝั่งที่ยังไม่อ่าน: ผู้ดูแลนับข้อความจากผู้เช่าทุกห้อง ผู้เช่านับข้อความจากผู้ดูแลในห้องตัวเอง
async function countUnread() {
    if (!current) return
    const { userId, isAdmin } = current
    let query = supabase.from('chat_messages').select('id', { count: 'exact', head: true }).is('read_at', null).is('deleted_at', null).eq('from_tenant', isAdmin)
    if (!isAdmin) query = query.eq('tenant_user_id', userId)
    const { count, error } = await query
    if (!error && current?.userId === userId) emit({ userId, count: count ?? 0 })
}

// หลายเหตุการณ์ติดกันรวมเป็นการนับครั้งเดียว
export function refreshUnread() {
    clearTimeout(timer)
    timer = setTimeout(countUnread, 250)
}

function start(userId, isAdmin) {
    stop()
    current = { userId, isAdmin }
    emit({ userId, count: 0 })
    countUnread()
    channel = supabase
        .channel(`chat-unread-${userId}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'chat_messages', ...(isAdmin ? {} : { filter: `tenant_user_id=eq.${userId}` }) },
            refreshUnread,
        )
        .subscribe()
}

function stop() {
    if (channel) supabase.removeChannel(channel)
    channel = null
    current = null
    clearTimeout(timer)
}

supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
        stop()
        emit({ userId: null, count: 0 })
    }
})

// hook: จำนวนข้อความที่ยังไม่อ่านของผู้ใช้ที่ login อยู่ (อัปเดตแบบเรียลไทม์)
export function useChatUnread() {
    const me = useCurrentUser()
    const userId = me?.id
    const isAdmin = me?.role === 'admin'
    const snap = useSyncExternalStore(subscribe, getSnapshot)

    useEffect(() => {
        if (!userId) return
        refs += 1
        if (current?.userId !== userId) start(userId, isAdmin)
        return () => {
            refs -= 1
            if (refs === 0) stop()
        }
    }, [userId, isAdmin])

    return snap.userId === userId ? snap.count : 0
}
