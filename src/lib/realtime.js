import { useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

// อัปเดตข้อมูลแบบ real-time ทั้งระบบ: เมื่อมีคนเพิ่ม/แก้/ลบแถวในตารางที่หน้านั้นใช้ หน้าจะโหลดข้อมูลใหม่เองโดยไม่ต้องกดรีเฟรช
// (เหมือนแจ้งเตือน) วิธีทำ: ฟังเหตุการณ์ของตารางจาก Supabase Realtime แล้ว "โหลดซ้ำ" ด้วยฟังก์ชันโหลดเดิมของหน้า
//   ไม่แก้ state จากข้อมูลในเหตุการณ์โดยตรง จึงไม่มีทางแสดงข้อมูลที่ผู้ใช้ไม่มีสิทธิ์เห็น (การโหลดซ้ำผ่าน RLS เหมือนเดิมทุกครั้ง)
// ต้องรัน supabase/migrations/20261022000000_initial_schema.sql (ส่วน performance) เพื่อเปิด Realtime ให้ตารางเหล่านี้ ถ้ายังไม่ได้รัน หน้าจะทำงานตามเดิม (ไม่อัปเดตเอง)

// ---- การสมัครรับเหตุการณ์ต่อตาราง (หนึ่งตาราง = หนึ่งช่องทาง ใช้ร่วมกันทุกหน้า/ทุก hook) ----

const entries = new Map()
// หลังคนสุดท้ายเลิกฟัง รอสักครู่ค่อยปิดช่องทาง กันการเปิด-ปิดซ้ำตอนเปลี่ยนหน้าหรือ React StrictMode ติดตั้งซ้ำ
export const CLOSE_DELAY_MS = 1500

// ฟังการเปลี่ยนแปลงของตาราง คืนฟังก์ชันเลิกฟัง
export function subscribeTable(table, listener) {
    let entry = entries.get(table)
    if (entry) {
        clearTimeout(entry.closeTimer)
        entry.closeTimer = null
    } else {
        const listeners = new Set()
        const channel = supabase
            .channel(`live-${table}`)
            .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => listeners.forEach((l) => l(payload)))
            .subscribe()
        entry = { channel, listeners, closeTimer: null }
        entries.set(table, entry)
    }
    entry.listeners.add(listener)

    const mine = entry
    return () => {
        mine.listeners.delete(listener)
        if (mine.listeners.size > 0) return
        mine.closeTimer = setTimeout(() => {
            if (mine.listeners.size === 0 && entries.get(table) === mine) {
                supabase.removeChannel(mine.channel)
                entries.delete(table)
            }
        }, CLOSE_DELAY_MS)
    }
}

// ออกจากระบบ: ปิดทุกช่องทาง (ผู้ใช้คนถัดไปจะสมัครใหม่ด้วยสิทธิ์ของตัวเอง)
supabase.auth.onAuthStateChange((event) => {
    if (event !== 'SIGNED_OUT') return
    for (const entry of entries.values()) {
        clearTimeout(entry.closeTimer)
        supabase.removeChannel(entry.channel)
    }
    entries.clear()
})

// ---- ตัวกระตุ้นโหลดซ้ำ: รวมเหตุการณ์ที่มาติดกันเป็นการโหลดครั้งเดียว และโหลดตามให้ทันเมื่อกลับมาที่แท็บ ----

// wait = รอกี่มิลลิวินาทีหลังเหตุการณ์สุดท้ายก่อนโหลด (เหตุการณ์ของการกระทำเดียวมักมาหลายแถวติดกัน)
// catchUpMs = กลับมาที่แท็บหลังซ่อนนานเกินนี้ ให้โหลดตามทันที (ช่วงที่แท็บซ่อนเบราว์เซอร์อาจหน่วง/ตัดการเชื่อมต่อ จึงอาจพลาดเหตุการณ์)
export function createLiveTrigger({ reload, wait = 400, catchUpMs = 20000, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
    let timer = null
    let hiddenAt = null

    const trigger = () => {
        clearTimer(timer)
        timer = setTimer(() => {
            timer = null
            reload()
        }, wait)
    }

    return {
        trigger,
        // เหตุการณ์จากตารางที่ฟังอยู่
        onChange: trigger,
        // ซ่อนแท็บ / กลับมาที่แท็บ / กลับมาออนไลน์
        onHidden: () => {
            hiddenAt = now()
        },
        onVisible: () => {
            const away = hiddenAt === null ? 0 : now() - hiddenAt
            hiddenAt = null
            if (away >= catchUpMs) trigger()
        },
        onOnline: trigger,
        dispose: () => {
            clearTimer(timer)
            timer = null
        },
    }
}

// hook: ฟังตารางที่ระบุ แล้วเรียก reload() (ฟังก์ชันโหลดข้อมูลเดิมของหน้านั้น) เมื่อมีการเปลี่ยนแปลง
// reload ควรโหลดแบบ "เงียบ" (ไม่เปลี่ยนเป็นหน้าจอกำลังโหลด ไม่รีเซ็ตสิ่งที่ผู้ใช้เลือกไว้/ฟอร์มที่กำลังกรอก)
// enabled = false เพื่อปิด (เช่น ยังไม่รู้ว่าใครล็อกอิน)
export function useRealtimeReload(tables, reload, { enabled = true, wait = 400 } = {}) {
    const reloadRef = useRef(reload)
    useEffect(() => {
        reloadRef.current = reload
    })

    const key = tables.join(',')
    useEffect(() => {
        if (!enabled) return undefined
        const live = createLiveTrigger({ reload: () => reloadRef.current?.(), wait })
        const unsubscribers = key.split(',').filter(Boolean).map((table) => subscribeTable(table, live.onChange))
        const onVisibility = () => (document.visibilityState === 'hidden' ? live.onHidden() : live.onVisible())
        document.addEventListener('visibilitychange', onVisibility)
        window.addEventListener('online', live.onOnline)
        return () => {
            document.removeEventListener('visibilitychange', onVisibility)
            window.removeEventListener('online', live.onOnline)
            unsubscribers.forEach((off) => off())
            live.dispose()
        }
    }, [key, enabled, wait])
}
