import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import Sidebar from './Sidebar.jsx'

function Layout() {
    const [menuOpen, setMenuOpen] = useState(false)
    const { pathname } = useLocation()

    // เปลี่ยนหน้าแล้วปิดเมนูบนจอเล็ก
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMenuOpen(false)
    }, [pathname])

    return (
        <div className="flex min-h-screen bg-sand">
            <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
            {menuOpen && (
                <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            )}
            <main className="flex-1 min-w-0">
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
                    <Outlet />
                </div>
            </main>
        </div>
    )
}

export default Layout
