import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabaseClient'
import { useCurrentUser } from './useCurrentUser'

// แจ้งเตือนภายในเว็บ/แอปเท่านั้น: เก็บในตาราง notifications ของ Supabase (สร้างโดย trigger)
// ใช้ store ระดับโมดูลตัวเดียว ให้กระดิ่ง หน้าแจ้งเตือน และ Sidebar ใช้ข้อมูลและ realtime ร่วมกัน

const LIMIT = 100
const POLL_MS = 60_000 // สำรองกรณี realtime ใช้ไม่ได้
const IDLE_STOP_MS = 2000 // กันสมัคร/ยกเลิก realtime ซ้ำตอนเปลี่ยนหน้า

// state ของ store กลาง: ผู้ใช้เจ้าของข้อมูล รายการแจ้งเตือน สถานะโหลด และ error
const emptyState = { userId: null, items: [], loading: true, error: '' }
let state = emptyState
// ตัวแปรภายใน: ผู้ฟัง, จำนวนคอมโพเนนต์ที่ใช้งาน, ช่อง realtime และตัวจับเวลาต่าง ๆ
const listeners = new Set()
let refs = 0
let channel = null
let stopTimer = null
let refreshTimer = null
let pollTimer = null

// อัปเดต state แล้วแจ้งทุกคอมโพเนนต์ที่ฟังอยู่ให้แสดงผลใหม่
const emit = (patch) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
}
// ลงทะเบียนผู้ฟังการเปลี่ยนแปลง (ใช้กับ useSyncExternalStore) คืนฟังก์ชันยกเลิก
const subscribe = (l) => {
    listeners.add(l)
    return () => listeners.delete(l)
}
// คืน state ปัจจุบันของ store
const getSnapshot = () => state

// โหลดแจ้งเตือนล่าสุดของผู้ใช้ปัจจุบันจากฐานข้อมูล
async function load() {
    const userId = state.userId
    if (!userId) return
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(LIMIT)
    if (state.userId !== userId) return // ผู้ใช้เปลี่ยนระหว่างรอ
    if (error) emit({ loading: false, error: `โหลดการแจ้งเตือนไม่สำเร็จ: ${error.message}` })
    else emit({ items: data, loading: false, error: '' })
}

// หลายเหตุการณ์ติดกัน (เช่น อ่านทั้งหมด) รวมเป็นการโหลดครั้งเดียว
const scheduleLoad = () => {
    clearTimeout(refreshTimer)
    refreshTimer = setTimeout(load, 250)
}
// กลับมาที่แท็บนี้แล้วให้โหลดแจ้งเตือนใหม่
const onVisible = () => {
    if (document.visibilityState === 'visible') load()
}

// หยุดติดตามแจ้งเตือน: ยกเลิก realtime ตัวจับเวลา และ event listener
function stop() {
    if (channel) {
        supabase.removeChannel(channel)
        channel = null
    }
    clearTimeout(refreshTimer)
    clearInterval(pollTimer)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', load)
}

// เริ่มติดตามแจ้งเตือนของผู้ใช้: โหลดครั้งแรก สมัคร realtime และตั้งโหลดสำรองเป็นระยะ
function start(userId) {
    stop()
    state = { userId, items: [], loading: true, error: '' }
    listeners.forEach((l) => l())
    load()
    // สมัคร realtime: แถวแจ้งเตือนของผู้ใช้นี้เปลี่ยนเมื่อไหร่ให้โหลดใหม่
    channel = supabase
        .channel(`notifications-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, scheduleLoad)
        .subscribe()
    // โหลดสำรองทุก 1 นาที, เมื่อกลับมาที่แท็บ และเมื่อเน็ตกลับมา
    pollTimer = setInterval(load, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', load)
}

// นับจำนวนคอมโพเนนต์ที่ใช้งาน store อยู่ เริ่มติดตามเมื่อมีคนใช้ และหยุดเมื่อไม่มีใครใช้แล้ว
function retain(userId) {
    refs += 1
    clearTimeout(stopTimer)
    if (state.userId !== userId || !channel) start(userId)
    return () => {
        refs -= 1
        if (refs === 0) stopTimer = setTimeout(stop, IDLE_STOP_MS)
    }
}

// ออกจากระบบ: ล้างข้อมูลของผู้ใช้เดิมทันที
supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
        stop()
        state = emptyState
        listeners.forEach((l) => l())
    }
})

// ---- การกระทำ: อัปเดตหน้าจอทันที (optimistic) แล้วค่อยบันทึก ถ้าพลาดให้โหลดใหม่ ----

export async function markRead(id) {
    const target = state.items.find((n) => n.id === id)
    if (!target || target.read_at) return
    const now = new Date().toISOString()
    emit({ items: state.items.map((n) => (n.id === id ? { ...n, read_at: now } : n)) })
    const { error } = await supabase.from('notifications').update({ read_at: now }).eq('id', id)
    if (error) load()
}

// ทำเครื่องหมายอ่านแล้วทุกรายการของผู้ใช้
export async function markAllRead() {
    const userId = state.userId
    if (!userId || !state.items.some((n) => !n.read_at)) return
    const now = new Date().toISOString()
    emit({ items: state.items.map((n) => (n.read_at ? n : { ...n, read_at: now })) })
    const { error } = await supabase.from('notifications').update({ read_at: now }).eq('recipient_id', userId).is('read_at', null)
    if (error) load()
}

// ลบแจ้งเตือนหนึ่งรายการ
export async function removeNotification(id) {
    emit({ items: state.items.filter((n) => n.id !== id) })
    const { error } = await supabase.from('notifications').delete().eq('id', id)
    if (error) load()
}

// ลบแจ้งเตือนทั้งหมดที่อ่านแล้ว
export async function clearRead() {
    const userId = state.userId
    if (!userId) return
    emit({ items: state.items.filter((n) => !n.read_at) })
    const { error } = await supabase.from('notifications').delete().eq('recipient_id', userId).not('read_at', 'is', null)
    if (error) load()
}

// hook สำหรับคอมโพเนนต์: คืนรายการแจ้งเตือน จำนวนที่ยังไม่อ่าน และสถานะการโหลด
export function useNotifications() {
    const userId = useCurrentUser()?.id
    const snap = useSyncExternalStore(subscribe, getSnapshot)

    // เริ่ม/หยุดติดตามแจ้งเตือนตามผู้ใช้ที่ login อยู่
    useEffect(() => (userId ? retain(userId) : undefined), [userId])

    // ยังไม่ได้เริ่มโหลดของผู้ใช้คนนี้ (หรือเป็นข้อมูลของผู้ใช้คนก่อน) ให้ถือว่ากำลังโหลด
    const ready = Boolean(userId) && snap.userId === userId
    const items = ready ? snap.items : []
    // ส่งรายการ สถานะโหลด error และนับจำนวนที่ยังไม่อ่าน
    return {
        items,
        loading: !ready || snap.loading,
        error: ready ? snap.error : '',
        unreadCount: items.filter((n) => !n.read_at).length,
    }
}
