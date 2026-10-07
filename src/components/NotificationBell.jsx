import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { initialNotifications, dotColorClasses, formatNotificationTime } from '../data/notifications'

function NotificationBell() {
    const navigate = useNavigate()
    const ref = useRef(null)
    const [open, setOpen] = useState(false)
    const [readIds, setReadIds] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('apartment_read_notifications') || '[]')
        } catch {
            return []
        }
    })

    // ปิดป็อปอัปเมื่อคลิกข้างนอกหรือกด Escape
    useEffect(() => {
        if (!open) return
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false)
            }
        }
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setOpen(false)
        }

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [open])

    // ซิงค์รายการที่อ่านแล้วกับ localStorage และ CustomEvent
    useEffect(() => {
        const syncRead = () => {
            try {
                setReadIds(JSON.parse(localStorage.getItem('apartment_read_notifications') || '[]'))
            } catch {
                setReadIds([])
            }
        }
        window.addEventListener('apartment_notifications_updated', syncRead)
        window.addEventListener('storage', syncRead)
        return () => {
            window.removeEventListener('apartment_notifications_updated', syncRead)
            window.removeEventListener('storage', syncRead)
        }
    }, [])

    // คำนวณจำนวนแจ้งเตือนที่ยังไม่ได้อ่าน
    const unreadCount = initialNotifications.filter(
        (n) => n.dotColor !== 'gray' && !readIds.includes(n.id)
    ).length

    // ทำเครื่องหมายว่าอ่านแล้ว
    const markIdAsRead = (id) => {
        if (!readIds.includes(id)) {
            const next = [...readIds, id]
            setReadIds(next)
            try {
                localStorage.setItem('apartment_read_notifications', JSON.stringify(next))
                window.dispatchEvent(new Event('apartment_notifications_updated'))
            } catch (err) {
                console.error(err)
            }
        }
    }

    // เมื่อกดเลือกหัวข้อแจ้งเตือน
    const handleSelect = (item) => {
        markIdAsRead(item.id)
        setOpen(false)
        navigate(`/notifications?id=${item.id}`)
    }

    const handleMarkAllRead = () => {
        const allIds = initialNotifications.map((n) => n.id)
        setReadIds(allIds)
        try {
            localStorage.setItem('apartment_read_notifications', JSON.stringify(allIds))
            window.dispatchEvent(new Event('apartment_notifications_updated'))
        } catch (err) {
            console.error(err)
        }
    }

    return (
        <div ref={ref} className="relative inline-block text-left">
            {/* ปุ่มไอคอนกระดิ่ง */}
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-label="การแจ้งเตือน"
                aria-expanded={open}
                className="w-10 h-10 rounded-full bg-white border border-line text-primary-dark hover:text-primary hover:bg-mist/30 transition flex items-center justify-center cursor-pointer relative shadow-xs"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5"
                >
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>

                {/* Badge ตัวเลขแจ้งเตือนใหม่ */}
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[11px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center shadow-xs border-2 border-white">
                        {unreadCount}
                    </span>
                )}
            </button>

            {/* ป็อปอัปแสดงหัวข้อการแจ้งเตือน */}
            {open && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-line z-50 overflow-hidden text-left animate-in fade-in zoom-in-95">
                    {/* Header ของป็อปอัป */}
                    <div className="px-4 py-3 bg-sand/30 border-b border-line flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-gray-900">การแจ้งเตือน</span>
                            {unreadCount > 0 && (
                                <span className="text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">
                                    ใหม่ {unreadCount} รายการ
                                </span>
                            )}
                        </div>
                        {unreadCount > 0 && (
                            <button
                                type="button"
                                onClick={handleMarkAllRead}
                                className="text-xs text-primary hover:text-primary-dark font-medium transition cursor-pointer"
                            >
                                อ่านทั้งหมด
                            </button>
                        )}
                    </div>

                    {/* รายการหัวข้อการแจ้งเตือน */}
                    <div className="max-h-84 overflow-y-auto divide-y divide-gray-100">
                        {initialNotifications.map((item) => {
                            const isUnread = item.dotColor !== 'gray' && !readIds.includes(item.id)
                            const dotClass = isUnread
                                ? (dotColorClasses[item.dotColor] || dotColorClasses.gray)
                                : dotColorClasses.gray

                            return (
                                <div
                                    key={item.id}
                                    onClick={() => handleSelect(item)}
                                    className={`group px-4 py-3 flex items-start gap-3 cursor-pointer transition-colors ${
                                        isUnread ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-sand/40'
                                    }`}
                                >
                                    <span
                                        className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 transition-transform group-hover:scale-125 ${dotClass}`}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <h4 className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors truncate">
                                                {item.title}
                                            </h4>
                                            <span className="text-[11px] text-gray-400 shrink-0">
                                                {formatNotificationTime(item.createdAt || item.time)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                                            {item.subtitle}
                                        </p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Footer ของป็อปอัป */}
                    <div className="p-2.5 bg-sand/20 border-t border-line text-center">
                        <button
                            type="button"
                            onClick={() => {
                                setOpen(false)
                                navigate('/notifications')
                            }}
                            className="w-full py-1.5 text-xs font-semibold text-primary hover:text-primary-dark transition cursor-pointer text-center"
                        >
                            ดูการแจ้งเตือนทั้งหมด →
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default NotificationBell
