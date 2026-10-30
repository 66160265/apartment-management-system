import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import ScrollDownHint from './ScrollDownHint.jsx'
import Sidebar from './Sidebar.jsx'
import { SkeletonPage } from './Skeleton.jsx'
import { checkBillingReminder } from '../lib/billingReminder.js'
import { prefetchPages } from '../lib/pages.js'
import { useCurrentUser } from '../lib/useCurrentUser.js'

// โครงหน้าหลักหลัง login: เมนูข้าง (Sidebar) + เนื้อหาของแต่ละหน้า (Outlet) และปุ่มเปิดเมนูบนจอเล็ก
function Layout() {
    // เมนูข้างบนจอเล็กเปิดอยู่หรือไม่ และ path ปัจจุบัน
    const [menuOpen, setMenuOpen] = useState(false)
    const { pathname } = useLocation()
    const role = useCurrentUser()?.role

    // รู้สิทธิ์แล้ว ดึงโค้ดหน้าที่น่าจะเปิดต่อไว้ล่วงหน้าตอนเครื่องว่าง (ไปหน้าอื่นแล้วเปิดทันที ไม่ต้องรอโหลดไฟล์)
    useEffect(() => (role ? prefetchPages(role) : undefined), [role])

    // ผู้ดูแลเปิดเว็บ: ให้ฐานข้อมูลตรวจว่าถึงวันออกบิลและยังมีห้องที่ไม่ได้ออกบิลไหม ถ้ามีจะส่งแจ้งเตือนถึงผู้ดูแลทุกคน (เดือนละครั้ง)
    useEffect(() => {
        if (role === 'admin') checkBillingReminder()
    }, [role])

    // เปลี่ยนหน้าแล้วปิดเมนูบนจอเล็ก
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMenuOpen(false)
    }, [pathname])

    // ตอนเมนูเปิด ไม่ให้หน้าด้านหลังเลื่อน และกด Esc เพื่อปิดได้
    useEffect(() => {
        if (!menuOpen) return
        // กด Esc ให้ปิดเมนูบนจอเล็ก
        const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
        document.body.style.overflow = 'hidden'
        window.addEventListener('keydown', onKey)
        return () => {
            document.body.style.overflow = ''
            window.removeEventListener('keydown', onKey)
        }
    }, [menuOpen])

    return (
        <div className="flex min-h-screen bg-sand">
            {/* เมนูข้าง */}
            <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
            {/* ฉากมืดด้านหลังเมนูบนจอเล็ก กดเพื่อปิดเมนู */}
            {menuOpen && (
                <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            )}
            {/* พื้นที่เนื้อหา */}
            <main className="flex-1 min-w-0">
                {/* แถบด้านบนบนจอเล็ก: ปุ่มเปิดเมนู + ชื่อระบบ */}
                <div className="lg:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-sand/90 backdrop-blur border-b border-line">
                    <button
                        onClick={() => setMenuOpen(true)}
                        aria-label="เปิดเมนู"
                        className="p-2 -ml-2 rounded-lg text-primary-dark hover:bg-mist/50"
                    >
                        <Icon name="menu" className="w-6 h-6" />
                    </button>
                    <span className="font-semibold text-primary-dark">ระบบจัดการหอพัก</span>
                </div>
                {/* จำกัดความกว้างเนื้อหาบนจอใหญ่มาก ให้อ่านง่ายและเรียงตรงกลาง */}
                <div className="mx-auto w-full max-w-[1500px]">
                    {/* เมนูข้างอยู่ค้างไว้ ระหว่างโหลดโค้ดของหน้าที่เปิดครั้งแรกแสดงเฉพาะส่วนเนื้อหาว่าง ๆ */}
                    <Suspense fallback={<SkeletonPage />}>
                        <Outlet />
                    </Suspense>
                </div>
            </main>
            {/* ลูกศรบอกว่ายังเลื่อนลงได้ (ทุกหน้า) ซ่อนตอนเมนูบนจอเล็กเปิดอยู่ */}
            {!menuOpen && <ScrollDownHint watchKey={pathname} />}
        </div>
    )
}

export default Layout
