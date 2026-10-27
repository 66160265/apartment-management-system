import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { auditActionOf, auditActorName, auditDetailRows, auditGroups, matchesAudit } from '../lib/audit'
import { formatDateTime } from '../lib/billing'
import { useRealtimeReload } from '../lib/realtime'
import { supabase } from '../lib/supabaseClient'
import { SkeletonTable } from '../components/Skeleton.jsx'

// ประวัติการแก้ไขข้อมูลสำคัญ (เฉพาะแอดมิน): ใครทำอะไรเมื่อไหร่ เรื่องเงิน ค่าซ่อม ผู้เช่า และการตั้งค่า
// ฐานข้อมูลบันทึกเองด้วย trigger (supabase/migrations/20261022000000_initial_schema.sql (ส่วน audit)) แก้หรือลบจากหน้าเว็บไม่ได้
const PAGE_SIZE = 100

function AuditLogPage() {
    const [group, setGroup] = useState('all')
    const [search, setSearch] = useState('')
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [hasMore, setHasMore] = useState(false)
    const [openId, setOpenId] = useState(null)

    // โหลดหน้าถัดไป (reset = เริ่มใหม่ตามตัวกรอง) เรียงจากใหม่ไปเก่า
    const load = useCallback(async (reset, from = 0) => {
        setLoading(true)
        const entities = auditGroups.find((g) => g.value === group)?.entities
        let query = supabase.from('audit_log').select('*').order('at', { ascending: false }).order('id', { ascending: false }).range(from, from + PAGE_SIZE - 1)
        if (entities) query = query.in('entity', entities)
        const { data, error: err } = await query
        setLoading(false)
        if (err) {
            setError(/audit_log/.test(err.message) ? 'ยังไม่มีประวัติการแก้ไข เพราะยังไม่ได้ติดตั้งระบบบันทึกประวัติในระบบหลังบ้าน (ผู้พัฒนารันไฟล์ supabase/migrations/20261022000000_initial_schema.sql ส่วน audit)' : `โหลดไม่สำเร็จ: ${err.message}`)
            return
        }
        setError('')
        setRows((prev) => (reset ? data : [...prev, ...data]))
        setHasMore(data.length === PAGE_SIZE)
    }, [group])

    useEffect(() => {
        let active = true
        // เปลี่ยนตัวกรองแล้วโหลดใหม่ตั้งแต่ต้น (setState เกิดหลังได้ข้อมูล ไม่ได้เรียกตรง ๆ ใน effect)
        Promise.resolve().then(() => active && load(true))
        return () => {
            active = false
        }
    }, [load])

    // รายการใหม่ขึ้นเอง ถ้าผู้ใช้โหลดรายการเก่าเพิ่มไว้แล้ว (เกินหนึ่งหน้า) ไม่รีเซ็ตให้ เพราะรายการที่ดูอยู่จะหาย
    useRealtimeReload(['audit_log'], () => (rows.length <= PAGE_SIZE ? load(true) : undefined))

    const visible = rows.filter((r) => matchesAudit(r, search))

    return (
        <>
            <PageHeader title="ประวัติการแก้ไข" subtitle="บันทึกอัตโนมัติทุกครั้งที่มีการเปลี่ยนเรื่องเงิน ค่าซ่อม ผู้เช่า และการตั้งค่า (แก้ไขหรือลบไม่ได้)" />

            <div className="px-4 sm:px-6 pb-8 flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap gap-2">
                        {auditGroups.map((g) => (
                            <button
                                key={g.value}
                                onClick={() => setGroup(g.value)}
                                aria-pressed={group === g.value}
                                className={`px-3.5 py-1.5 rounded-full text-sm border transition ${group === g.value ? 'bg-primary text-white border-primary' : 'bg-white text-primary-dark border-line hover:bg-mist/40'}`}
                            >
                                {g.label}
                            </button>
                        ))}
                    </div>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="ค้นหา ห้อง / ผู้ทำรายการ / ข้อความ"
                        className="ml-auto w-full sm:w-72 border border-line bg-white rounded-xl px-3 py-2 text-sm outline-none focus:border-secondary"
                    />
                </div>

                {error ? (
                    <p className="text-center py-10 text-red-600">{error}</p>
                ) : loading && rows.length === 0 ? (
                    <SkeletonTable rows={8} cols={4} className="border-0 rounded-none" />
                ) : visible.length === 0 ? (
                    <p className="text-center py-10 text-muted">{rows.length === 0 ? 'ยังไม่มีประวัติ' : 'ไม่พบรายการที่ตรงกับคำค้นหา'}</p>
                ) : (
                    <ul className="bg-white rounded-2xl shadow-card divide-y divide-line overflow-hidden">
                        {visible.map((r) => {
                            const meta = auditActionOf(r.action)
                            const open = openId === r.id
                            const detailRows = open ? auditDetailRows(r) : []
                            return (
                                <li key={r.id}>
                                    <button type="button" onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open} className="w-full text-left px-4 py-3 hover:bg-mist/30 flex flex-col gap-1.5">
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ring-1 ${meta.tone}`}>{meta.label}</span>
                                            {r.room && <span className="text-xs text-muted">ห้อง {r.room}</span>}
                                            <span className="ml-auto text-xs text-muted tabular-nums">{formatDateTime(r.at)}</span>
                                        </div>
                                        <div className="text-sm text-ink">{r.summary}</div>
                                        <div className="text-xs text-muted">โดย {auditActorName(r)}</div>
                                    </button>
                                    {open && (
                                        <dl className="px-4 pb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs bg-sand/40">
                                            {detailRows.length === 0 && <dd className="col-span-2 text-muted py-2">ไม่มีรายละเอียดเพิ่มเติม</dd>}
                                            {detailRows.map(([k, v]) => (
                                                <div key={k} className="contents"><dt className="text-muted py-0.5">{k}</dt><dd className="tabular-nums break-all py-0.5">{v}</dd></div>
                                            ))}
                                        </dl>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                )}

                {hasMore && !error && (
                    <button onClick={() => load(false, rows.length)} disabled={loading} className="self-center border border-line bg-white text-primary-dark hover:bg-mist/40 disabled:opacity-60 px-5 py-2 rounded-xl text-sm">
                        {loading ? 'กำลังโหลด...' : 'โหลดรายการที่เก่ากว่า'}
                    </button>
                )}
            </div>
        </>
    )
}

export default AuditLogPage
