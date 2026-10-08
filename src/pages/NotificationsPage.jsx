import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import AvatarMenu from '../components/AvatarMenu'
import NotificationBell from '../components/NotificationBell'
import UserNotificationBell from '../components/UserNotificationBell'
import { ConfirmDialog } from '../components/RepairParts'
import { formatNotificationTime, readDotClass, typeLabels, unreadDotClass } from '../data/notifications'
import { clearRead, markAllRead, markRead, removeNotification, useNotifications } from '../lib/useNotifications'
import { useCurrentUser } from '../lib/useCurrentUser'

const tabs = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'unread', label: 'ยังไม่อ่าน' },
]

function NotificationsPage() {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const me = useCurrentUser()
    const { items, loading, error, unreadCount } = useNotifications()

    const [activeTab, setActiveTab] = useState('all')
    const [confirmClear, setConfirmClear] = useState(false)

    const rawId = searchParams.get('id')
    const selected = rawId ? items.find((n) => n.id === rawId) : null
    const readCount = items.length - unreadCount
    const visible = activeTab === 'unread' ? items.filter((n) => !n.read_at) : items

    // เปิดรายละเอียดจากลิงก์ (เช่น กดจากกระดิ่ง) ให้ทำเครื่องหมายว่าอ่านแล้ว
    useEffect(() => {
        if (selected && !selected.read_at) markRead(selected.id)
    }, [selected])

    const closeModal = () => {
        if (searchParams.get('id')) setSearchParams({}, { replace: true })
    }

    // ปิดรายละเอียดด้วยปุ่ม Esc
    useEffect(() => {
        if (!rawId) return
        const onKey = (e) => e.key === 'Escape' && setSearchParams({}, { replace: true })
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [rawId, setSearchParams])

    const openDetail = (item) => {
        markRead(item.id)
        setSearchParams({ id: item.id })
    }

    const handleDelete = () => {
        removeNotification(selected.id)
        closeModal()
    }

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-ink">แจ้งเตือน</h1>
                <div className="flex items-center gap-3">
                    {me?.role === 'admin' ? <NotificationBell /> : <UserNotificationBell />}
                    <AvatarMenu />
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium border ${
                                activeTab === t.key ? 'bg-primary text-white border-primary' : 'bg-white text-muted border-line hover:bg-sand'
                            }`}
                        >
                            {t.label} ({t.key === 'all' ? items.length : unreadCount})
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-4 text-sm">
                    <button onClick={markAllRead} disabled={unreadCount === 0} className="text-primary hover:text-primary-dark font-medium">
                        อ่านทั้งหมด
                    </button>
                    <button onClick={() => setConfirmClear(true)} disabled={readCount === 0} className="text-red-600 hover:text-red-700 font-medium">
                        ล้างที่อ่านแล้ว
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-card p-4 md:p-6 border border-line">
                {loading || error ? (
                    <p className={`py-12 text-center text-sm ${error ? 'text-red-600' : 'text-muted'}`}>{loading ? 'กำลังโหลด...' : error}</p>
                ) : visible.length === 0 ? (
                    <p className="py-12 text-center text-muted text-sm">
                        {items.length === 0 ? 'ยังไม่มีรายการแจ้งเตือน' : 'ไม่มีการแจ้งเตือนที่ยังไม่อ่าน'}
                    </p>
                ) : (
                    <ul className="flex flex-col">
                        {visible.map((item) => {
                            const unread = !item.read_at
                            return (
                                <li key={item.id} className="border-b border-line last:border-b-0">
                                    <button
                                        onClick={() => openDetail(item)}
                                        title="คลิกเพื่อดูรายละเอียดเพิ่มเติม"
                                        className="group w-full text-left py-4 px-3 sm:px-4 flex items-center justify-between gap-4 hover:bg-sand/40 rounded-xl"
                                    >
                                        <div className="flex items-center gap-4 min-w-0 flex-1">
                                            <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${unread ? unreadDotClass : readDotClass}`} />
                                            <div className="min-w-0 flex-1">
                                                <h2 className={`text-sm sm:text-base text-ink ${unread ? 'font-bold' : 'font-medium'}`}>{item.title}</h2>
                                                <p className="text-xs sm:text-sm text-muted mt-0.5 truncate">{item.subtitle}</p>
                                            </div>
                                        </div>
                                        <span className="text-xs sm:text-sm text-muted shrink-0">{formatNotificationTime(item.created_at)}</span>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>

            {selected && (
                <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={closeModal}>
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="bg-white rounded-2xl shadow-xl w-[560px] max-w-full overflow-hidden border border-line flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-sand/30">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${unreadDotClass}`} />
                                <h2 className="text-lg font-bold text-ink wrap-break-word">{selected.title}</h2>
                            </div>
                            <button type="button" onClick={closeModal} aria-label="ปิด" className="text-muted hover:text-ink w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white text-lg">
                                ✕
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-4">
                            <div className="flex items-center justify-between gap-2 text-xs text-muted">
                                <span className="px-3 py-1 rounded-full font-semibold bg-mist text-primary-dark">{typeLabels[selected.type] || 'ระบบ'}</span>
                                <span>เวลาที่ส่ง: {formatNotificationTime(selected.created_at, true)}</span>
                            </div>

                            {selected.subtitle && <div className="text-base text-ink font-bold">{selected.subtitle}</div>}

                            {selected.details && (
                                <div>
                                    <h3 className="text-xs font-semibold text-muted mb-1.5">รายละเอียดการแจ้งเตือน</h3>
                                    <div className="text-sm text-ink leading-relaxed bg-white border border-line rounded-xl p-4 whitespace-pre-line wrap-break-word">
                                        {selected.details}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 bg-sand/20 border-t border-line flex justify-between items-center gap-3">
                            <button type="button" onClick={handleDelete} className="text-red-600 hover:text-red-700 text-sm font-medium">
                                ลบการแจ้งเตือนนี้
                            </button>
                            <div className="flex items-center gap-3">
                                <button type="button" onClick={closeModal} className="border border-line text-muted hover:bg-sand px-4 py-2 rounded-xl text-sm font-medium">
                                    ปิด
                                </button>
                                {selected.action_link && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            closeModal()
                                            navigate(selected.action_link)
                                        }}
                                        className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl text-sm font-medium shadow-xs flex items-center gap-1.5"
                                    >
                                        {selected.action_label || 'เปิดดู'}
                                        <span>→</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {confirmClear && (
                <ConfirmDialog
                    title="ล้างการแจ้งเตือนที่อ่านแล้ว"
                    confirmLabel="ล้างรายการ"
                    onCancel={() => setConfirmClear(false)}
                    onConfirm={() => {
                        clearRead()
                        setConfirmClear(false)
                    }}
                >
                    ต้องการลบการแจ้งเตือน {readCount} รายการที่อ่านแล้วใช่หรือไม่? การลบไม่สามารถย้อนกลับได้
                </ConfirmDialog>
            )}
        </div>
    )
}

export default NotificationsPage
