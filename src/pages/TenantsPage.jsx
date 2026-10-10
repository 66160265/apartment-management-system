import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import DatePicker from '../components/DatePicker'
import Icon from '../components/Icon'
import { CopyButton } from '../components/InvoiceParts'
import TenantDetail from '../components/TenantDetail'
import { Avatar, ContractBadge } from '../components/TenantParts'
import { supabase } from '../lib/supabaseClient'
import { createTenantAccount, makeDefaultPassword, makeUsername } from '../lib/tenantAccount'
import { REQUIRED_DOCS, contractStatus, formatDate } from '../lib/tenants'

const byRoom = (a, b) => a.room.localeCompare(b.room, undefined, { numeric: true })

const fromRow = (r) => ({
    room: r.room,
    name: r.name,
    phone: r.phone,
    username: r.username,
    startDate: r.start_date,
    endDate: r.end_date,
    userId: r.user_id,
})

const inputClass = 'w-full border border-line bg-sand/50 rounded-xl px-3 py-2 mt-1 outline-none focus:border-secondary focus:bg-white'

// วันที่ในเครื่อง -> YYYY-MM-DD
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ค่าเริ่มต้นของสัญญา: เริ่มวันนี้ สิ้นสุดอีก 1 ปี
function newForm() {
    const start = new Date()
    const end = new Date(start)
    end.setFullYear(end.getFullYear() + 1)
    end.setDate(end.getDate() - 1)
    return { name: '', phone: '', room: '', startDate: isoDate(start), endDate: isoDate(end) }
}

const tabs = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'expiring', label: 'ใกล้หมดสัญญา' },
    { value: 'expired', label: 'หมดสัญญา' },
    { value: 'docs', label: 'เอกสารไม่ครบ' },
]

function AddTenantModal({ rooms, onSave, onClose }) {
    const [form, setForm] = useState(newForm)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const [created, setCreated] = useState(null)

    const set = (key) => (e) => {
        setForm({ ...form, [key]: e.target.value })
        setError('')
    }

    const digits = form.phone.replace(/\D/g, '')
    const canPreview = form.room && digits.length >= 4
    const username = makeUsername(form.room)
    const password = canPreview ? makeDefaultPassword(form.room, form.phone) : ''

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.name.trim() || !form.phone.trim() || !form.room || !form.startDate || !form.endDate) {
            setError('กรุณากรอกข้อมูลให้ครบ')
            return
        }
        if (digits.length < 4) {
            setError('เบอร์โทรต้องมีตัวเลขอย่างน้อย 4 หลัก (ใช้สร้างรหัสผ่านเริ่มต้น)')
            return
        }
        if (form.endDate < form.startDate) {
            setError('วันสิ้นสุดสัญญาต้องไม่ก่อนวันเริ่มสัญญา')
            return
        }
        setSaving(true)
        const err = await onSave({
            name: form.name.trim(),
            phone: form.phone.trim(),
            room: form.room,
            startDate: form.startDate,
            endDate: form.endDate,
        })
        setSaving(false)
        if (err) setError(err)
        else setCreated({ name: form.name.trim(), room: form.room, username, password })
    }

    return (
        <div className="fixed inset-0 bg-primary-deep/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-[480px] max-w-full max-h-[95vh] overflow-y-auto">
                {created ? (
                    <div className="p-6 flex flex-col gap-4 items-stretch">
                        <div className="flex flex-col items-center text-center gap-2">
                            <span className="grid place-items-center w-14 h-14 rounded-full bg-emerald-50 text-emerald-600">
                                <Icon name="checkCircle" className="w-8 h-8" />
                            </span>
                            <h2 className="text-lg font-semibold text-primary-dark">เพิ่มผู้เช่าเรียบร้อย</h2>
                            <p className="text-sm text-muted">{created.name} · ห้อง {created.room}<br />แจ้งข้อมูลเข้าสู่ระบบนี้ให้ผู้เช่า และแนะนำให้เปลี่ยนรหัสผ่านหลังเข้าใช้งาน</p>
                        </div>
                        <div className="rounded-xl bg-sand/70 border border-line divide-y divide-line text-sm">
                            <div className="flex items-center justify-between gap-3 px-4 py-3">
                                <div><div className="text-xs text-muted">ชื่อผู้ใช้</div><div className="font-medium text-ink">{created.username}</div></div>
                                <CopyButton text={created.username} />
                            </div>
                            <div className="flex items-center justify-between gap-3 px-4 py-3">
                                <div><div className="text-xs text-muted">รหัสผ่านเริ่มต้น</div><div className="font-medium text-ink">{created.password}</div></div>
                                <CopyButton text={created.password} />
                            </div>
                        </div>
                        <button onClick={onClose} className="bg-primary hover:bg-primary-dark text-white py-2.5 rounded-xl font-medium shadow-card">เสร็จสิ้น</button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                        <div>
                            <h2 className="text-lg font-semibold text-primary-dark">เพิ่มผู้เช่าใหม่</h2>
                            <p className="text-sm text-muted mt-0.5">ระบบจะสร้างบัญชีเข้าสู่ระบบให้ผู้เช่าอัตโนมัติ</p>
                        </div>
                        <label className="text-sm text-muted">
                            ชื่อ-นามสกุล
                            <input className={inputClass} value={form.name} onChange={set('name')} autoFocus />
                        </label>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <label className="text-sm text-muted">
                                เบอร์โทร
                                <input className={inputClass} value={form.phone} onChange={set('phone')} inputMode="tel" />
                            </label>
                            <label className="text-sm text-muted">
                                ห้องพัก
                                <select className={inputClass} value={form.room} onChange={set('room')}>
                                    <option value="">{rooms.length ? 'เลือกห้อง...' : 'ไม่มีห้องว่าง'}</option>
                                    {rooms.map((r) => (
                                        <option key={r.number} value={r.number}>{r.number} (ชั้น {r.floor})</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="text-sm text-muted">
                                เริ่มสัญญา
                                <DatePicker value={form.startDate} onChange={(v) => set('startDate')({ target: { value: v } })} />
                            </div>
                            <div className="text-sm text-muted">
                                สิ้นสุดสัญญา
                                <DatePicker value={form.endDate} onChange={(v) => set('endDate')({ target: { value: v } })} min={form.startDate} align="right" />
                            </div>
                        </div>

                        <div className="rounded-xl bg-mist/40 border border-mist px-4 py-3 text-sm flex items-start gap-3">
                            <Icon name="key" className="w-5 h-5 mt-0.5 text-primary" />
                            <div>
                                <div className="font-medium text-primary-dark">บัญชีเข้าสู่ระบบของผู้เช่า</div>
                                {canPreview ? (
                                    <div className="text-muted mt-0.5">ชื่อผู้ใช้ <b className="text-ink">{username}</b> · รหัสผ่านเริ่มต้น <b className="text-ink">{password}</b></div>
                                ) : (
                                    <div className="text-muted mt-0.5">เลือกห้องและกรอกเบอร์โทร ระบบจะแสดงชื่อผู้ใช้และรหัสผ่านที่นี่</div>
                                )}
                            </div>
                        </div>

                        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={onClose} className="border border-line text-muted hover:bg-sand px-5 py-2 rounded-xl">ยกเลิก</button>
                            <button type="submit" disabled={saving} className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-6 py-2 rounded-xl shadow-card">
                                {saving ? 'กำลังเพิ่ม...' : 'เพิ่มผู้เช่า'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    )
}

const fetchTenantsData = () =>
    Promise.all([
        supabase.from('tenants').select('*'),
        supabase.from('rooms').select('number, status, floor'),
        supabase.from('tenant_documents').select('room, type'),
    ])

function TenantsPage() {
    const [tenants, setTenants] = useState([])
    const [rooms, setRooms] = useState([])
    // จำนวนเอกสารหลักที่อัปโหลดแล้วต่อห้อง
    const [docCounts, setDocCounts] = useState({})
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [search, setSearch] = useState('')
    const [tab, setTab] = useState('all')
    // null = ปิด, 'new' = เพิ่มผู้เช่า, ออบเจ็กต์ผู้เช่า = หน้ารายละเอียด
    const [modal, setModal] = useState(null)

    const applyResult = useCallback(([tenantsRes, roomsRes, docsRes]) => {
        const err = tenantsRes.error || roomsRes.error
        if (err) {
            setLoadError(`โหลดข้อมูลไม่สำเร็จ: ${err.message}`)
        } else {
            setTenants(tenantsRes.data.map(fromRow).sort(byRoom))
            setRooms(roomsRes.data)
            // ถ้ายังไม่ได้สร้างตารางเอกสาร (docsRes.error) ถือว่าไม่มีเอกสาร ไม่ทำให้หน้าพัง
            const counts = {}
            const required = REQUIRED_DOCS.map((d) => d.type)
            for (const d of docsRes.data ?? []) {
                if (required.includes(d.type)) counts[d.room] = (counts[d.room] ?? 0) + 1
            }
            setDocCounts(counts)
            setLoadError('')
        }
        setLoading(false)
    }, [])

    const load = async () => applyResult(await fetchTenantsData())

    useEffect(() => {
        let active = true
        fetchTenantsData().then((result) => {
            if (active) applyResult(result)
        })
        return () => {
            active = false
        }
    }, [applyResult])

    const handleCreate = async (data) => {
        const err = await createTenantAccount(data)
        if (err) return err
        await load()
        return null
    }

    const floors = Object.fromEntries(rooms.map((r) => [r.number, r.floor]))
    const freeRooms = rooms
        .filter((r) => r.status !== 'maintenance' && !tenants.some((t) => t.room === r.number))
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))

    const detail = modal && modal !== 'new' ? tenants.find((t) => t.room === modal.room) : null
    if (detail) {
        return <TenantDetail key={detail.room} tenant={detail} floor={floors[detail.room]} onBack={() => setModal(null)} onChanged={load} />
    }

    const docsComplete = (t) => (docCounts[t.room] ?? 0) >= REQUIRED_DOCS.length
    const matchesTab = {
        all: () => true,
        expiring: (t) => contractStatus(t.endDate).key === 'expiring',
        expired: (t) => contractStatus(t.endDate).key === 'expired',
        docs: (t) => !docsComplete(t),
    }
    const counts = Object.fromEntries(tabs.map((x) => [x.value, tenants.filter(matchesTab[x.value]).length]))

    const keyword = search.trim().toLowerCase()
    const keywordDigits = keyword.replace(/\D/g, '')
    const visible = tenants
        .filter(matchesTab[tab])
        .filter((t) =>
            !keyword ||
            t.name.toLowerCase().includes(keyword) ||
            t.room.includes(keyword) ||
            (keywordDigits && t.phone.replace(/\D/g, '').includes(keywordDigits)))

    const summary = [
        { label: 'ผู้เช่าทั้งหมด', value: tenants.length, unit: 'ราย', icon: 'users', tone: 'bg-slate-100 text-slate-600', tab: 'all' },
        { label: 'ใกล้หมดสัญญา', value: counts.expiring, unit: 'ราย', icon: 'alert', tone: 'bg-amber-50 text-amber-700', tab: 'expiring' },
        { label: 'หมดสัญญาแล้ว', value: counts.expired, unit: 'ราย', icon: 'calendar', tone: 'bg-red-50 text-red-700', tab: 'expired' },
        { label: 'ห้องว่างพร้อมเข้าอยู่', value: freeRooms.length, unit: 'ห้อง', icon: 'door', tone: 'bg-sky-50 text-sky-700' },
    ]

    const cell = 'px-3 py-3 border-x border-line/60'
    const head = 'px-3 py-3 font-semibold text-xs tracking-wide border-x border-white/10'

    return (
        <>
            <PageHeader title="จัดการผู้เช่า" subtitle="ดูข้อมูลผู้เช่า สถานะสัญญา และเอกสารของแต่ละห้อง" actions={
                    <>
                        <button
                        onClick={() => setModal('new')}
                        className="flex items-center gap-2 bg-primary hover:bg-primary-dark transition-colors text-white px-5 py-2.5 rounded-xl shadow-card"
                    >
                        <Icon name="plus" className="w-4 h-4" />
                        เพิ่มผู้เช่า
                    </button>
                    </>
                } />

            <div className="px-4 sm:px-6 pb-8 flex flex-col gap-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {summary.map((c) => {
                        const body = (
                            <>
                                <div className="flex items-center justify-between text-sm text-muted">
                                    <span>{c.label}</span>
                                    <span className={`grid place-items-center w-8 h-8 rounded-lg ${c.tone}`}><Icon name={c.icon} className="w-[18px] h-[18px]" /></span>
                                </div>
                                <div className="mt-2 flex items-baseline gap-2">
                                    <span className="text-2xl font-semibold text-primary-dark">{c.value}</span>
                                    <span className="text-xs text-muted">{c.unit}</span>
                                </div>
                            </>
                        )
                        return c.tab ? (
                            <button
                                key={c.label}
                                onClick={() => setTab(c.tab)}
                                aria-pressed={tab === c.tab}
                                className={`text-left rounded-2xl p-4 bg-white shadow-card border-2 transition ${tab === c.tab ? 'border-primary' : 'border-transparent hover:border-mist'}`}
                            >
                                {body}
                            </button>
                        ) : (
                            <div key={c.label} className="rounded-2xl p-4 bg-white shadow-card border-2 border-transparent">{body}</div>
                        )
                    })}
                </div>

                <div className="bg-white rounded-2xl shadow-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <h2 className="font-medium text-primary-dark">
                            รายชื่อผู้เช่า
                            <span className="ml-2 text-sm font-normal text-muted">({visible.length})</span>
                        </h2>
                        <div className="flex items-center gap-2 border border-line bg-sand/50 rounded-xl px-3 py-1.5 w-72 max-w-full focus-within:border-secondary focus-within:bg-white">
                            <Icon name="search" className="w-4 h-4 text-muted" />
                            <input
                                type="text"
                                placeholder="ค้นหาชื่อ ห้อง หรือเบอร์โทร"
                                className="outline-none w-full bg-transparent text-sm"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div role="tablist" aria-label="หมวดหมู่ผู้เช่า" className="flex gap-1 overflow-x-auto overflow-y-hidden mb-4 border-b border-line">
                        {tabs.map((x) => {
                            const active = tab === x.value
                            return (
                                <button
                                    key={x.value}
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setTab(x.value)}
                                    className={`flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                                        active ? 'border-primary text-primary-dark font-medium' : 'border-transparent text-muted hover:text-primary-dark hover:bg-sand/60'
                                    }`}
                                >
                                    {x.label}
                                    <span className={`min-w-6 text-center text-xs rounded-full px-1.5 py-0.5 ${active ? 'bg-primary text-white' : 'bg-sand text-muted'}`}>
                                        {counts[x.value]}
                                    </span>
                                </button>
                            )
                        })}
                    </div>

                    <div className="xl:overflow-auto xl:max-h-[34rem] xl:rounded-xl xl:border xl:border-line xl:shadow-sm">
                        <table className="hidden xl:table w-full min-w-[56rem] border-collapse text-sm">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-primary-dark text-white">
                                    <th className={`${head} text-center w-12`}>#</th>
                                    <th className={`${head} text-left`}>ผู้เช่า</th>
                                    <th className={`${head} text-center`}>ห้อง</th>
                                    <th className={`${head} text-left`}>เบอร์โทร</th>
                                    <th className={`${head} text-center`}>ระยะสัญญา</th>
                                    <th className={`${head} text-center`}>สถานะสัญญา</th>
                                    <th className={`${head} text-center`}>เอกสาร</th>
                                    <th className={`${head} text-center`}>จัดการ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((t, index) => {
                                    const docs = docCounts[t.room] ?? 0
                                    const complete = docs >= REQUIRED_DOCS.length
                                    return (
                                        <tr
                                            key={t.room}
                                            onClick={() => setModal(t)}
                                            className={`cursor-pointer border-b border-line transition-colors hover:bg-mist/30 ${index % 2 ? 'bg-sand/40' : 'bg-white'}`}
                                        >
                                            <td className={`${cell} text-center text-xs text-muted tabular-nums`}>{index + 1}</td>
                                            <td className={cell}>
                                                <div className="flex items-center gap-3">
                                                    <Avatar name={t.name} />
                                                    <div>
                                                        <div className="font-medium text-ink">{t.name}</div>
                                                        {t.username && <div className="text-xs text-muted">@{t.username.toLowerCase()}</div>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={`${cell} text-center`}>
                                                <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold">{t.room}</span>
                                            </td>
                                            <td className={`${cell} tabular-nums`}>{t.phone}</td>
                                            <td className={`${cell} text-center text-muted whitespace-nowrap`}>{formatDate(t.startDate)} – {formatDate(t.endDate)}</td>
                                            <td className={`${cell} text-center`}><ContractBadge endDate={t.endDate} showHint /></td>
                                            <td className={`${cell} text-center`}>
                                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                                    complete ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                                                }`}>
                                                    {complete ? 'ครบ' : `${docs}/${REQUIRED_DOCS.length}`}
                                                </span>
                                            </td>
                                            <td className="border-x border-line/60 px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button onClick={() => setModal(t)} className="px-4 py-1 rounded-lg text-sm bg-mist/60 text-primary-dark hover:bg-mist">รายละเอียด</button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                        <div className="xl:hidden grid gap-3 md:grid-cols-2">
                            {visible.map((t) => {
                                const docs = docCounts[t.room] ?? 0
                                const complete = docs >= REQUIRED_DOCS.length
                                return (
                                    <button
                                        key={t.room}
                                        type="button"
                                        onClick={() => setModal(t)}
                                        className="text-left rounded-2xl border border-line bg-white p-4 flex flex-col gap-3 hover:border-secondary transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Avatar name={t.name} />
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium text-ink truncate">{t.name}</div>
                                                {t.username && <div className="text-xs text-muted">@{t.username.toLowerCase()}</div>}
                                            </div>
                                            <span className="inline-block min-w-12 px-2.5 py-1 rounded-lg bg-mist/60 text-primary-dark font-semibold text-center">{t.room}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div>
                                                <div className="text-xs text-muted">เบอร์โทร</div>
                                                <div className="tabular-nums">{t.phone}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-muted">ระยะสัญญา</div>
                                                <div>{formatDate(t.startDate)} – {formatDate(t.endDate)}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <ContractBadge endDate={t.endDate} showHint />
                                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                                complete ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                                            }`}>
                                                เอกสาร {complete ? 'ครบ' : `${docs}/${REQUIRED_DOCS.length}`}
                                            </span>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                        {(loading || loadError || visible.length === 0) && (
                            <div className={`py-12 text-center ${loadError ? 'text-red-600' : 'text-muted'}`}>
                                {loading ? (
                                    'กำลังโหลด...'
                                ) : loadError ? (
                                    loadError
                                ) : (
                                    <>
                                        <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-full bg-sand text-muted"><Icon name="users" className="w-6 h-6" /></span>
                                        {search || tab !== 'all' ? 'ไม่พบผู้เช่าที่ตรงกับเงื่อนไข' : 'ยังไม่มีผู้เช่า กด "เพิ่มผู้เช่า" เพื่อเริ่มต้น'}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {modal === 'new' && <AddTenantModal rooms={freeRooms} onSave={handleCreate} onClose={() => setModal(null)} />}
        </>
    )
}

export default TenantsPage
