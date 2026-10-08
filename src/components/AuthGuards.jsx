import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { homeFor } from '../lib/auth'
import { supabase } from '../lib/supabaseClient'
import { useCurrentUser } from '../lib/useCurrentUser'

function Loading() {
    return (
        <div className="min-h-screen grid place-items-center bg-sand text-muted">
            <div className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full border-2 border-mist border-t-primary animate-spin" />
                กำลังตรวจสอบการเข้าสู่ระบบ...
            </div>
        </div>
    )
}

// เซสชันปัจจุบัน: undefined = กำลังตรวจ, null = ยังไม่ได้ login
// ตรวจกับเซิร์ฟเวอร์หนึ่งครั้งตอนเปิดหน้า (กันบัญชีที่ถูกลบหรือเซสชันเสีย) แล้วติดตามการ login/logout ต่อ
function useSession() {
    const [session, setSession] = useState(undefined)

    useEffect(() => {
        let active = true

        ;(async () => {
            const { data: { session: local } } = await supabase.auth.getSession()
            if (!local) {
                if (active) setSession(null)
                return
            }
            const { error } = await supabase.auth.getUser()
            // ปฏิเสธเฉพาะกรณีเซิร์ฟเวอร์ตอบว่าเซสชันใช้ไม่ได้ ถ้าแค่เน็ตหลุดให้ใช้เซสชันเดิมไปก่อน
            if (error && (error.status === 401 || error.status === 403 || error.status === 404)) {
                await supabase.auth.signOut()
                if (active) setSession(null)
                return
            }
            if (active) setSession(local)
        })()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
            // ข้ามเหตุการณ์เริ่มต้น เพราะตรวจกับเซิร์ฟเวอร์ข้างบนแล้ว
            if (event === 'INITIAL_SESSION') return
            if (active) setSession(next)
        })

        return () => {
            active = false
            subscription.unsubscribe()
        }
    }, [])

    return session
}

// ครอบหน้าที่ต้อง login: ถ้ายังไม่ login (หรือหมดอายุระหว่างใช้งาน) เด้งกลับหน้า login
export function RequireAuth({ children }) {
    const session = useSession()

    if (session === undefined) return <Loading />
    if (!session) return <Navigate to="/" replace />
    return children
}

// จำกัดหน้าเฉพาะสิทธิ์ที่กำหนด (ใช้ภายใน RequireAuth) สิทธิ์อื่นจะถูกส่งไปหน้าแรกของตัวเอง
export function RequireRole({ role, children }) {
    const me = useCurrentUser()

    if (!me) return <Loading />
    // อ่านสิทธิ์ไม่ได้ (ไม่มีแถวใน profiles) ส่งกลับหน้า login กันวนไปมา
    if (!me.role) return <Navigate to="/" replace />
    if (me.role !== role) return <Navigate to={homeFor(me.role)} replace />
    return children
}

// ครอบหน้า login: ถ้า login ค้างอยู่แล้วให้ข้ามไปหน้าแรกของสิทธิ์นั้น
// ตรวจครั้งเดียวตอนเปิดหน้า (ไม่ติดตามต่อ เพื่อไม่ให้ขัดกับขั้นตอน login ในหน้า login เอง)
export function RedirectIfAuthed({ children }) {
    const [target, setTarget] = useState(undefined)

    useEffect(() => {
        let active = true
        ;(async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                if (active) setTarget(null)
                return
            }
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
            // ไม่มีสิทธิ์/อ่านโปรไฟล์ไม่ได้ ถือว่าไม่ได้ login ให้ใช้หน้า login ตามปกติ
            if (active) setTarget(profile?.role ? homeFor(profile.role) : null)
        })()
        return () => {
            active = false
        }
    }, [])

    if (target === undefined) return <Loading />
    if (target) return <Navigate to={target} replace />
    return children
}
