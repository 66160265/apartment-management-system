import { useEffect, useSyncExternalStore } from 'react'
import { useRealtimeReload } from './realtime'
import { supabase } from './supabaseClient'
import { unpaidRepairCosts } from './repairPayments'
import { useCurrentUser } from './useCurrentUser'

// ค่าซ่อมที่ผู้เช่ายังไม่ได้ชำระ (ใช้ทำป้ายที่เมนู แถบเตือน และป้ายในรายการแจ้งซ่อม)
// เก็บไว้ระดับโมดูลให้หลายที่ใช้ร่วมกันโดยไม่ยิงซ้ำ โหลดตอนเปิดหน้า ตอนกลับมาที่แท็บ และเมื่อเรียก refreshRepairCosts()
// เฉพาะผู้เช่า (แอดมินอ่านตารางแจ้งซ่อมได้ทั้งหมด จึงไม่ใช้กับแอดมิน)

const EMPTY = []
let state = { userId: null, items: EMPTY }
let current = null
let inflight = null
const listeners = new Set()

const subscribe = (l) => {
    listeners.add(l)
    return () => listeners.delete(l)
}
const getSnapshot = () => state

async function load(userId) {
    if (inflight === userId) return
    inflight = userId
    const [repairsRes, paymentsRes] = await Promise.all([
        supabase
            .from('repairs')
            .select('id, room, problem, status, cost, cost_payer, completed_at')
            .eq('user_id', userId)
            .eq('status', 'done')
            .eq('cost_payer', 'tenant')
            .gt('cost', 0),
        supabase.from('repair_payments').select('repair_id, status').eq('user_id', userId).in('status', ['review', 'paid']),
    ])
    inflight = null
    if (current !== userId) return
    // โหลดไม่สำเร็จ (เช่น ยังไม่ได้รัน ส่วน repair-payments ของไฟล์ migration) ไม่แสดงค่าซ่อมค้าง เพราะผู้เช่าจะชำระไม่ได้
    const items = repairsRes.error || paymentsRes.error ? EMPTY : unpaidRepairCosts(repairsRes.data ?? [], paymentsRes.data ?? [])
    state = { userId, items }
    listeners.forEach((l) => l())
}

// โหลดใหม่ทันที (เรียกหลังส่งสลิปค่าซ่อม)
export const refreshRepairCosts = () => {
    if (current) load(current)
}

// hook: รายการค่าซ่อมที่ผู้เช่าล็อกอินอยู่ยังไม่ได้ชำระ (ว่างสำหรับแอดมินหรือยังไม่รู้ผล)
export function useRepairCosts() {
    const me = useCurrentUser()
    const userId = me?.role === 'user' ? me.id : null
    const snap = useSyncExternalStore(subscribe, getSnapshot)

    useEffect(() => {
        if (!userId) return
        current = userId
        load(userId)
        const onFocus = () => load(userId)
        window.addEventListener('focus', onFocus)
        return () => {
            window.removeEventListener('focus', onFocus)
            if (current === userId) current = null
        }
    }, [userId])

    // อัปเดตเองเมื่อผู้ดูแลใส่/แก้ค่าซ่อม หรือสลิปค่าซ่อมถูกยืนยัน/ปฏิเสธ (ป้ายที่เมนูและแถบเตือนเปลี่ยนทันที)
    useRealtimeReload(['repairs', 'repair_payments'], () => userId && load(userId), { enabled: Boolean(userId) })

    return userId && snap.userId === userId ? snap.items : EMPTY
}
