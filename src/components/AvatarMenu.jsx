import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import NotificationBell from './NotificationBell'
import UserNotificationBell from './UserNotificationBell'
import { roleLabels, useCurrentUser } from '../lib/useCurrentUser'

function AvatarMenu() {
    const navigate = useNavigate()
    const ref = useRef(null)
    const info = useCurrentUser()
    const [open, setOpen] = useState(false)
    const [loggingOut, setLoggingOut] = useState(false)

    // ปิดเมนูเมื่อคลิกข้างนอกหรือกด Esc
    useEffect(() => {
        if (!open) return
        const onClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        const onKey = (e) => e.key === 'Escape' && setOpen(false)
        document.addEventListener('mousedown', onClick)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onClick)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    const handleLogout = async () => {
        setLoggingOut(true)
        await supabase.auth.signOut()
        navigate('/')
    }

    const displayName = info?.tenant?.name || roleLabels[info?.role] || 'บัญชีของฉัน'
    const initials = info?.role === 'user' && info.tenant?.name ? info.tenant.name.trim().charAt(0) : 'AD'

    return (
        <div className="flex items-center gap-3">
            {info && (info.role === 'admin' ? <NotificationBell /> : <UserNotificationBell />)}
            <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                aria-label="เมนูบัญชีผู้ใช้"
                aria-expanded={open}
                className="w-10 h-10 rounded-full bg-mist text-primary-dark font-medium flex items-center justify-center hover:ring-2 hover:ring-secondary transition cursor-pointer"
            >
                {initials}
            </button>
            {open && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-line p-4 z-40 text-left">
                    <div className="pb-3 border-b border-line">
                        <div className="font-semibold text-primary-dark">{displayName}</div>
                        {info?.role && (
                            <span className="inline-block mt-1 text-xs bg-mist text-primary-dark px-2 py-0.5 rounded-full">
                                {roleLabels[info.role] || info.role}
                            </span>
                        )}
                    </div>
                    <dl className="py-3 text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                        <dt className="text-muted">ชื่อผู้ใช้</dt>
                        <dd className="text-ink break-all">{info?.username || '-'}</dd>
                        {info?.tenant && (
                            <>
                                <dt className="text-muted">ห้องพัก</dt>
                                <dd className="text-ink">{info.tenant.room}</dd>
                                <dt className="text-muted">เบอร์โทร</dt>
                                <dd className="text-ink">{info.tenant.phone}</dd>
                            </>
                        )}
                    </dl>
                    <div className="flex flex-col gap-2">
                        <Link
                            to="/account"
                            onClick={() => setOpen(false)}
                            className="text-center bg-mist text-primary-dark hover:bg-secondary/40 transition-colors py-2 rounded-xl text-sm font-medium"
                        >
                            จัดการบัญชี
                        </Link>
                        <button
                            onClick={handleLogout}
                            disabled={loggingOut}
                            className="w-full border border-line text-red-600 hover:bg-red-50 disabled:opacity-60 py-2 rounded-xl text-sm font-medium cursor-pointer"
                        >
                            {loggingOut ? 'กำลังออกจากระบบ...' : 'ออกจากระบบ'}
                        </button>
                    </div>
                </div>
            )}
            </div>
        </div>
    )
}

export default AvatarMenu
