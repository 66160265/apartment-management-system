import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import Icon from '../components/Icon'
import PageHeader from '../components/PageHeader'
import { ConfirmDialog } from '../components/RepairParts'
import { formatNotificationTime, typeLabels } from '../data/notifications'
import { clearRead, markAllRead, markRead, removeNotification, useNotifications } from '../lib/useNotifications'

// ไอคอนและสีของแจ้งเตือนแต่ละประเภท
const typeStyle = {
    invoice: { icon: 'receipt', tone: 'bg-sky-50 text-sky-700' },
    repair: { icon: 'wrench', tone: 'bg-amber-50 text-amber-700' },
    system: { icon: 'bell', tone: 'bg-violet-50 text-violet-700' },
}

const tabs = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'unread', label: 'ยังไม่อ่าน' },
]

function NotificationsPage() {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
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
        <div className="p-6 flex flex-col gap-5">
            <PageHeader flush title="แจ้งเตือน" subtitle="ติดตามความเคลื่อนไหวของใบแจ้งหนี้และงานแจ้งซ่อม" />

            <div className="bg-white rounded-2xl shadow-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line mb-2">
                    <div role="tablist" aria-label="กรองการแจ้งเตือน" className="flex gap-1">
                        {tabs.map((t) => {
                            const active = activeTab === t.key
                            const n = t.key === 'all' ? items.length : unreadCount
                            return (
                                <button
                                    key={t.key}
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setActiveTab(t.key)}
                                    className={`flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                                        active ? 'border-primary text-primary-dark font-medium' : 'border-transparent text-muted hover:text-primary-dark hover:bg-sand/60'
                                    }`}
                                >
                                    {t.label}
                                    <span className={`min-w-6 text-center text-xs rounded-full px-1.5 py-0.5 ${active ? 'bg-primary text-white' : 'bg-sand text-muted'}`}>{n}</span>
                                </button>
                            )
                        })}
                    </div>
                    <div className="flex items-center gap-2 pb-2 text-sm">
                        <button
                            onClick={markAllRead}
                            disabled={unreadCount === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-primary-dark hover:bg-mist/50 disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                            <Icon name="checkCircle" className="w-4 h-4" />
                            อ่านทั้งหมด
                        </button>
                        <button
                            onClick={() => setConfirmClear(true)}
                            disabled={readCount === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                            <Icon name="trash" className="w-4 h-4" />
                            ล้างที่อ่านแล้ว
                        </button>
                    </div>
                </div>

                {loading || error ? (
                    <p className={`py-14 text-center text-sm ${error ? 'text-red-600' : 'text-muted'}`}>{loading ? 'กำลังโหลด...' : error}</p>
                ) : visible.length === 0 ? (
                    <div className="py-14 text-center text-muted text-sm">
                        <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-full bg-sand text-muted"><Icon name="bell" className="w-6 h-6" /></span>
                        {items.length === 0 ? 'ยังไม่มีรายการแจ้งเตือน' : 'ไม่มีการแจ้งเตือนที่ยังไม่อ่าน'}
                    </div>
                ) : (
                    <ul className="flex flex-col">
                        {visible.map((item) => {
                            const unread = !item.read_at
                            const t = typeStyle[item.type] ?? typeStyle.system
                            return (
                                <li key={item.id} className="border-b border-line last:border-b-0">
                                    <button
                                        onClick={() => openDetail(item)}
                                        title="คลิกเพื่อดูรายละเอียดเพิ่มเติม"
                                        className={`group w-full text-left py-3.5 px-3 sm:px-4 flex items-center justify-between gap-4 rounded-xl hover:bg-sand/60 ${unread ? 'bg-mist/15' : ''}`}
                                    >
                                        <div className="flex items-center gap-4 min-w-0 flex-1">
                                            <span className={`grid place-items-center w-10 h-10 rounded-xl shrink-0 ${unread ? t.tone : 'bg-sand text-muted'}`}>
                                                <Icon name={t.icon} className="w-5 h-5" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <h2 className={`text-sm sm:text-base text-ink ${unread ? 'font-semibold' : 'font-normal'}`}>{item.title}</h2>
                                                <p className="text-xs sm:text-sm text-muted mt-0.5 truncate">{item.subtitle}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className="text-xs sm:text-sm text-muted">{formatNotificationTime(item.created_at)}</span>
                                            {unread && <span className="w-2.5 h-2.5 rounded-full bg-red-500" aria-label="ยังไม่อ่าน" />}
                                        </div>
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
                                <span className={`grid place-items-center w-9 h-9 rounded-xl shrink-0 ${(typeStyle[selected.type] ?? typeStyle.system).tone}`}><Icon name={(typeStyle[selected.type] ?? typeStyle.system).icon} className="w-[18px] h-[18px]" /></span>
                                <h2 className="text-lg font-bold text-ink wrap-break-word">{selected.title}</h2>
                            </div>
                            <button type="button" onClick={closeModal} aria-label="ปิด" className="text-muted hover:text-ink w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white text-lg">
                                <Icon name="close" className="w-5 h-5" />
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
                                        <Icon name="arrowRight" className="w-4 h-4" />
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
