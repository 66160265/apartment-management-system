import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { homeFor } from '../lib/auth'
import { supabase } from '../lib/supabaseClient'
import { useCurrentUser } from '../lib/useCurrentUser'
import { SkeletonApp, SkeletonPage } from './Skeleton'

// หน้าจอกำลังโหลดระหว่างตรวจสอบการเข้าสู่ระบบ
function Loading() {
    return <SkeletonApp />
}

// เซสชันปัจจุบัน: undefined = กำลังตรวจ, null = ยังไม่ได้ login
// ตรวจกับเซิร์ฟเวอร์หนึ่งครั้งตอนเปิดหน้า (กันบัญชีที่ถูกลบหรือเซสชันเสีย) แล้วติดตามการ login/logout ต่อ
function useSession() {
    const [session, setSession] = useState(undefined)

    // ตรวจเซสชันตอนเปิดหน้า แล้วติดตามการ login/logout ต่อ
    useEffect(() => {
        let active = true

        ;(async () => {
            // อ่านเซสชันที่เก็บในเครื่องก่อน ถ้าไม่มีแปลว่ายังไม่ได้ login
            const { data: { session: local } } = await supabase.auth.getSession()
            if (!local) {
                if (active) setSession(null)
                return
            }
            // แสดงหน้าทันทีจากเซสชันในเครื่อง ไม่รอไปถามเซิร์ฟเวอร์ก่อน (ลดเวลารอตอนเปิดเว็บหนึ่งรอบเดินทางเครือข่าย)
            if (active) setSession(local)
            // แล้วถามเซิร์ฟเวอร์ใน background ว่าเซสชันนี้ยังใช้ได้จริงไหม บัญชีถูกลบหรือเซสชันใช้ไม่ได้ = ออกจากระบบ
            // (ข้อมูลจริงถูกคุมด้วย RLS อยู่แล้ว ช่วงสั้น ๆ ก่อนตรวจเสร็จเห็นแค่โครงหน้า)
            const { error } = await supabase.auth.getUser()
            // ปฏิเสธเฉพาะกรณีเซิร์ฟเวอร์ตอบว่าเซสชันใช้ไม่ได้ ถ้าแค่เน็ตหลุดให้ใช้เซสชันเดิมไปก่อน
            if (error && (error.status === 401 || error.status === 403 || error.status === 404)) {
                await supabase.auth.signOut()
                if (active) setSession(null)
            }
        })()

        // ติดตามการ login/logout/ต่ออายุเซสชันหลังจากนี้
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

    // อยู่ใต้ Layout ที่มีเมนูข้างจริงแล้ว: แสดง skeleton เฉพาะเนื้อหา (ไม่ใช้ Loading ที่มีแถบเมนูข้างปลอมซ้อนอีกชั้น)
    if (!me) return <SkeletonPage />
    // อ่านสิทธิ์ไม่ได้ (ไม่มีแถวใน profiles) ส่งกลับหน้า login กันวนไปมา
    if (!me.role) return <Navigate to="/" replace />
    if (me.role !== role) return <Navigate to={homeFor(me.role)} replace />
    return children
}

// บัญชีที่ถูกตั้งให้ต้องเปลี่ยนรหัสผ่าน (แอดมินสร้าง/รีเซ็ตรหัสให้) ใช้ได้แค่หน้าบัญชีจนกว่าจะตั้งรหัสใหม่
// ไม่รอข้อมูลผู้ใช้ก่อนแสดงหน้า (ไม่ให้หน้าแรกช้าลง) พอโหลดเสร็จและต้องเปลี่ยนรหัสจึงพาไปหน้าบัญชี
export function RequireFreshPassword({ children }) {
    const me = useCurrentUser()
    const { pathname } = useLocation()

    if (me?.mustChangePassword && pathname !== '/account') return <Navigate to="/account" replace />
    return children
}

// ครอบหน้า login: ถ้า login ค้างอยู่แล้วให้ข้ามไปหน้าแรกของสิทธิ์นั้น
// ตรวจครั้งเดียวตอนเปิดหน้า (ไม่ติดตามต่อ เพื่อไม่ให้ขัดกับขั้นตอน login ในหน้า login เอง)
export function RedirectIfAuthed({ children }) {
    const [target, setTarget] = useState(undefined)

    // อ่านเซสชันและสิทธิ์ครั้งเดียว เพื่อหาว่าต้องพาไปหน้าแรกของสิทธิ์ไหน
    useEffect(() => {
        let active = true
        ;(async () => {
            // ไม่มีเซสชัน = แสดงหน้า login ตามปกติ
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                if (active) setTarget(null)
                return
            }
            // มีเซสชัน: อ่านสิทธิ์เพื่อหาหน้าแรกที่ต้องพาไป
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
            // ไม่มีสิทธิ์/อ่านโปรไฟล์ไม่ได้ ถือว่าไม่ได้ login ให้ใช้หน้า login ตามปกติ
            if (active) setTarget(profile?.role ? homeFor(profile.role) : null)
        })()
        return () => {
            active = false
        }
    }, [])

    // ระหว่างตรวจแสดงหน้ากำลังโหลด มีปลายทางให้เปลี่ยนหน้า ไม่งั้นแสดงหน้า login
    if (target === undefined) return <Loading />
    if (target) return <Navigate to={target} replace />
    return children
}
