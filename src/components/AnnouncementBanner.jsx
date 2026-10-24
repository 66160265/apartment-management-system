import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { formatDateTime } from '../lib/billing'
import { isRecent, loadAnnouncements } from '../lib/announcements'
import { useRealtimeReload } from '../lib/realtime'

// แถบประกาศล่าสุดบนหน้าแรกของผู้เช่า: แสดงประกาศที่ลงภายใน RECENT_DAYS วัน (ไม่มี/โหลดไม่ได้ = ไม่แสดงอะไร) กดไปอ่านทั้งหมดที่หน้าประกาศ
const RECENT_DAYS = 14

function AnnouncementBanner() {
    const [latest, setLatest] = useState(null)

    const reload = useCallback(async () => {
        const list = await loadAnnouncements(5)
        const recent = (list ?? []).filter((a) => isRecent(a.created_at, RECENT_DAYS))
        // ประกาศสำคัญล่าสุดขึ้นก่อน ไม่มีก็ใช้ล่าสุด
        setLatest(recent.find((a) => a.important) ?? recent[0] ?? null)
    }, [])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        reload()
    }, [reload])

    useRealtimeReload(['announcements'], reload)

    if (!latest) return null
    const tone = latest.important ? 'bg-rose-100 ring-rose-300 text-rose-950' : 'bg-sky-100 ring-sky-300 text-sky-950'
    return (
        <Link to="/announcements" className={`rounded-2xl ring-1 p-4 flex items-start gap-3 hover:shadow-md transition ${tone}`}>
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-white shadow-sm shrink-0"><Icon name="megaphone" className={`w-5 h-5 ${latest.important ? 'text-rose-700' : 'text-sky-700'}`} /></span>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{latest.important ? 'ประกาศสำคัญ' : 'ประกาศจากหอพัก'} · {formatDateTime(latest.created_at)}</p>
                <p className="font-semibold break-words">{latest.title}</p>
                {latest.body && <p className="text-sm opacity-80 line-clamp-2 break-words">{latest.body}</p>}
            </div>
            <span className="text-xs font-semibold self-center shrink-0 inline-flex items-center gap-1">อ่านทั้งหมด <Icon name="arrowRight" className="w-3.5 h-3.5" /></span>
        </Link>
    )
}

export default AnnouncementBanner
