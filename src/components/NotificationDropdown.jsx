import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatNotificationTime, readDotClass, typeLabels, unreadDotClass } from '../data/notifications'
import { markAllRead, markRead, useNotifications } from '../lib/useNotifications'

const PREVIEW_COUNT = 8

// กระดิ่งแจ้งเตือนภายในเว็บ: ตัวเลขที่ยังไม่อ่าน + รายการล่าสุดแบบป็อปอัป
// ใช้ร่วมกันระหว่าง NotificationBell (แอดมิน) และ UserNotificationBell (ผู้เช่า)
function NotificationDropdown({ emptyText }) {
    const navigate = useNavigate()
    const ref = useRef(null)
    const [open, setOpen] = useState(false)
    const { items, loading, error, unreadCount } = useNotifications()

    // ปิดป็อปอัปเมื่อคลิกข้างนอกหรือกด Escape
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

    const handleSelect = (item) => {
        markRead(item.id)
        setOpen(false)
        navigate(`/notifications?id=${item.id}`)
    }

    return (
        <div ref={ref} className="relative inline-block text-left">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-label={unreadCount > 0 ? `การแจ้งเตือน (ใหม่ ${unreadCount} รายการ)` : 'การแจ้งเตือน'}
                aria-expanded={open}
                className="w-10 h-10 rounded-full bg-white border border-line text-primary-dark hover:text-primary hover:bg-mist/30 transition flex items-center justify-center cursor-pointer relative shadow-xs"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[11px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center shadow-xs border-2 border-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-line z-50 overflow-hidden text-left">
                    <div className="px-4 py-3 bg-sand/30 border-b border-line flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-ink">การแจ้งเตือน</span>
                            {unreadCount > 0 && (
                                <span className="text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">ใหม่ {unreadCount} รายการ</span>
                            )}
                        </div>
                        {unreadCount > 0 && (
                            <button type="button" onClick={markAllRead} className="text-xs text-primary hover:text-primary-dark font-medium">
                                อ่านทั้งหมด
                            </button>
                        )}
                    </div>

                    <div className="max-h-84 overflow-y-auto divide-y divide-line">
                        {loading ? (
                            <p className="py-8 text-center text-sm text-muted">กำลังโหลด...</p>
                        ) : error ? (
                            <p className="py-8 px-4 text-center text-sm text-red-600">{error}</p>
                        ) : items.length === 0 ? (
                            <p className="py-8 px-6 text-center text-sm text-muted">{emptyText}</p>
                        ) : (
                            items.slice(0, PREVIEW_COUNT).map((item) => {
                                const unread = !item.read_at
                                return (
                                    <button
                                        type="button"
                                        key={item.id}
                                        onClick={() => handleSelect(item)}
                                        className={`group w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${unread ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-sand/40'}`}
                                    >
                                        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${unread ? unreadDotClass : readDotClass}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <h4 className={`text-sm text-ink truncate ${unread ? 'font-bold' : 'font-medium'}`}>{item.title}</h4>
                                                <span className="text-[11px] text-muted shrink-0">{formatNotificationTime(item.created_at)}</span>
                                            </div>
                                            <p className="text-xs text-muted mt-0.5 truncate">
                                                <span className="text-primary">{typeLabels[item.type]}</span>
                                                {item.subtitle && ` · ${item.subtitle}`}
                                            </p>
                                        </div>
                                    </button>
                                )
                            })
                        )}
                    </div>

                    <div className="p-2.5 bg-sand/20 border-t border-line text-center">
                        <button
                            type="button"
                            onClick={() => {
                                setOpen(false)
                                navigate('/notifications')
                            }}
                            className="w-full py-1.5 text-xs font-semibold text-primary hover:text-primary-dark"
                        >
                            ดูการแจ้งเตือนทั้งหมด →
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default NotificationDropdown
