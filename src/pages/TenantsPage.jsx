import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import AddTenantModal from '../components/AddTenantModal'
import Icon from '../components/Icon'
import TenantDetail from '../components/TenantDetail'
import { TenantCards, TenantRows } from '../components/TenantTable'
import { useRealtimeReload } from '../lib/realtime'
import { supabase } from '../lib/supabaseClient'
import { createTenantAccount } from '../lib/tenantAccount'
import { byRoom, countRequiredDocs, fetchTenantsData, filterTenants, fromRow, tabCounts, tenantTabs } from '../lib/tenantList'
import { SkeletonTable } from '../components/Skeleton.jsx'

// หน้าจัดการผู้เช่าของแอดมิน: สรุปจำนวน กรองตามสถานะสัญญา ค้นหา เพิ่มผู้เช่า และดูรายละเอียด
// หน้านี้ถือข้อมูลและตัวกรอง ส่วนที่แสดงผลแยกอยู่ใน AddTenantModal และ TenantTable ตรรกะกรองอยู่ใน lib/tenantList.js
function TenantsPage() {
    // รายชื่อผู้เช่า และรายการห้องทั้งหมด
    const [tenants, setTenants] = useState([])
    const [rooms, setRooms] = useState([])
    // จำนวนเอกสารหลักที่อัปโหลดแล้วต่อห้อง
    const [docCounts, setDocCounts] = useState({})
    // สถานะโหลด, error, คำค้นหา และแท็บที่เลือก
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [search, setSearch] = useState('')
    const [tab, setTab] = useState('all')
    // null = ปิด, 'new' = เพิ่มผู้เช่า, ออบเจ็กต์ผู้เช่า = หน้ารายละเอียด
    const [modal, setModal] = useState(null)
    // ข้อความแจ้งเตือนหลังเพิ่มผู้เช่า (เช่น ตั้งเงินประกันไม่สำเร็จ)
    const [notice, setNotice] = useState('')

    // นำผลการโหลดไปตั้งค่า state: เรียงผู้เช่าตามห้อง และนับเอกสารหลักของแต่ละห้อง
    const applyResult = useCallback(([tenantsRes, roomsRes, docsRes]) => {
        const err = tenantsRes.error || roomsRes.error
        if (err) {
            setLoadError(`โหลดข้อมูลไม่สำเร็จ: ${err.message}`)
        } else {
            setTenants(tenantsRes.data.map(fromRow).sort(byRoom))
            setRooms(roomsRes.data)
            // ถ้ายังไม่ได้สร้างตารางเอกสาร (docsRes.error) ถือว่าไม่มีเอกสาร ไม่ทำให้หน้าพัง
            setDocCounts(countRequiredDocs(docsRes.data))
            setLoadError('')
        }
        setLoading(false)
    }, [])

    // โหลดข้อมูลผู้เช่าใหม่ (ใช้หลังเพิ่ม/แก้ไข/ลบ)
    const load = async () => applyResult(await fetchTenantsData())

    // อัปเดตเองเมื่อผู้เช่าหรือห้องเปลี่ยน
    useRealtimeReload(['tenants', 'rooms'], load)

    // โหลดข้อมูลผู้เช่าครั้งแรกเมื่อเปิดหน้า
    useEffect(() => {
        let active = true
        fetchTenantsData().then((result) => {
            if (active) applyResult(result)
        })
        return () => {
            active = false
        }
    }, [applyResult])

    // เพิ่มผู้เช่าผ่าน Edge Function create-tenant แล้วโหลดรายการใหม่
    const handleCreate = async ({ deposit, ...data }) => {
        const err = await createTenantAccount(data)
        if (err) return err
        // เงินประกัน: Edge Function create-tenant ไม่รู้จักช่องนี้ จึงตั้งค่าตามหลังด้วยการอัปเดตแถวผู้เช่า (ไม่ต้อง deploy ฟังก์ชันใหม่)
        // ถ้าตั้งไม่สำเร็จ ผู้เช่าถูกสร้างแล้ว จึงแจ้งเตือนให้ไปแก้ในหน้ารายละเอียดแทนการแจ้งว่าล้มเหลว
        if (deposit > 0) {
            const { error } = await supabase.from('tenants').update({ deposit }).eq('room', data.room)
            if (error) setNotice(`เพิ่มผู้เช่าห้อง ${data.room} แล้ว แต่ตั้งเงินประกันไม่สำเร็จ (${error.message}) กรุณาแก้ในหน้ารายละเอียดผู้เช่า`)
        }
        await load()
        return null
    }

    // แผนที่ เลขห้อง -> ชั้น และห้องที่ว่างให้เพิ่มผู้เช่าได้ (ไม่มีผู้เช่า และไม่ได้ปรับปรุงอยู่)
    const floors = Object.fromEntries(rooms.map((r) => [r.number, r.floor]))
    const freeRooms = rooms
        .filter((r) => r.status !== 'maintenance' && !tenants.some((t) => t.room === r.number))
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))

    // กดเลือกผู้เช่าแล้ว: แสดงหน้ารายละเอียดแทนหน้ารายการ
    const detail = modal && modal !== 'new' ? tenants.find((t) => t.room === modal.room) : null
    if (detail) {
        return <TenantDetail key={detail.room} tenant={detail} floor={floors[detail.room]} onBack={() => setModal(null)} onChanged={load} />
    }

    // จำนวนผู้เช่าในแต่ละแท็บ และรายการที่ผ่านตัวกรอง
    const counts = tabCounts(tenants, docCounts)
    const visible = filterTenants(tenants, { tab, search, docCounts })

    // การ์ดสรุปด้านบน (การ์ดที่มี tab กดเพื่อกรองได้)
    const summary = [
        { label: 'ผู้เช่าทั้งหมด', short: 'ทั้งหมด', value: tenants.length, unit: 'ราย', icon: 'users', tone: 'bg-slate-100 text-slate-600', tab: 'all' },
        { label: 'ใกล้หมดสัญญา', short: 'ใกล้หมด', value: counts.expiring, unit: 'ราย', icon: 'alert', tone: 'bg-amber-50 text-amber-700', tab: 'expiring' },
        { label: 'หมดสัญญาแล้ว', short: 'หมดแล้ว', value: counts.expired, unit: 'ราย', icon: 'calendar', tone: 'bg-red-50 text-red-700', tab: 'expired' },
        { label: 'ห้องว่างพร้อมเข้าอยู่', short: 'ห้องว่าง', value: freeRooms.length, unit: 'ห้อง', icon: 'door', tone: 'bg-sky-50 text-sky-700' },
    ]

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

            <div className="px-4 sm:px-6 pb-8 flex flex-col gap-4 sm:gap-6">
                {notice && (
                    <div role="status" className="rounded-xl bg-amber-50 ring-1 ring-amber-200 text-amber-900 text-sm px-4 py-3 flex items-start justify-between gap-3">
                        <span>{notice}</span>
                        <button type="button" onClick={() => setNotice('')} aria-label="ปิดข้อความ" className="shrink-0 text-amber-700">✕</button>
                    </div>
                )}
                {/* การ์ดสรุป: ผู้เช่าทั้งหมด ใกล้หมดสัญญา หมดสัญญา ห้องว่าง */}
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
                    {summary.map((c) => {
                        const body = (
                            <>
                                <div className="flex items-center justify-between gap-1 text-xs sm:text-sm leading-tight text-muted">
                                    <span><span className="sm:hidden">{c.short}</span><span className="hidden sm:inline">{c.label}</span></span>
                                    <span className={`hidden sm:grid place-items-center w-8 h-8 shrink-0 rounded-lg ${c.tone}`}><Icon name={c.icon} className="w-[18px] h-[18px]" /></span>
                                </div>
                                <div className="mt-1 sm:mt-2 flex items-baseline gap-2">
                                    <span className="text-xl sm:text-2xl font-semibold text-primary-dark">{c.value}</span>
                                    <span className="hidden sm:inline text-xs text-muted">{c.unit}</span>
                                </div>
                            </>
                        )
                        return c.tab ? (
                            <button
                                key={c.label}
                                onClick={() => setTab(c.tab)}
                                aria-pressed={tab === c.tab}
                                className={`text-left rounded-xl sm:rounded-2xl p-2.5 sm:p-4 bg-white shadow-card border-2 transition ${tab === c.tab ? 'border-primary' : 'border-transparent hover:border-mist'}`}
                            >
                                {body}
                            </button>
                        ) : (
                            <div key={c.label} className="rounded-xl sm:rounded-2xl p-2.5 sm:p-4 bg-white shadow-card border-2 border-transparent">{body}</div>
                        )
                    })}
                </div>

                <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5">
                    {/* หัวกล่อง: จำนวนผู้เช่า + ช่องค้นหา */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <h2 className="font-medium text-primary-dark">
                            รายชื่อผู้เช่า
                            <span className="ml-2 text-sm font-normal text-muted">({visible.length})</span>
                        </h2>
                        {/* จอเล็ก: ช่องค้นหาเต็มความกว้างกล่อง */}
                        <div className="flex items-center gap-2 border border-line bg-sand/50 rounded-xl px-3 py-1.5 w-full sm:w-72 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/15 focus-within:bg-white">
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

                    {/* แท็บกรองพร้อมจำนวน */}
                    <div role="tablist" aria-label="หมวดหมู่ผู้เช่า" className="flex sm:gap-1 overflow-x-auto overflow-y-hidden mb-4 border-b border-line">
                        {tenantTabs.map((x) => {
                            const active = tab === x.value
                            return (
                                <button
                                    key={x.value}
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setTab(x.value)}
                                    className={`flex-1 sm:flex-none min-w-0 flex items-center justify-center gap-0.5 sm:gap-2 px-0.5 sm:px-4 py-2.5 text-xs sm:text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                                        active ? 'border-primary text-primary-dark font-medium' : 'border-transparent text-muted hover:text-primary-dark hover:bg-sand/60'
                                    }`}
                                >
                                    {/* จอเล็ก: 4 แท็บเท่ากันในแถวเดียว ไม่ต้องเลื่อน (ใช้ชื่อสั้นถ้ามี) */}
                                    <span className="sm:hidden">{x.short ?? x.label}</span>
                                    <span className="hidden sm:inline">{x.label}</span>
                                    <span className={`min-w-5 sm:min-w-6 text-center text-xs rounded-full px-1 sm:px-1.5 py-0.5 ${active ? 'bg-primary text-white' : 'bg-sand text-muted'}`}>
                                        {counts[x.value]}
                                    </span>
                                </button>
                            )
                        })}
                    </div>

                    <div className="xl:overflow-auto xl:max-h-[34rem] xl:rounded-xl xl:border xl:border-line xl:shadow-sm">
                        <TenantRows rows={visible} docCounts={docCounts} onOpen={setModal} />
                        <TenantCards rows={visible} docCounts={docCounts} onOpen={setModal} />
                        {/* ข้อความกำลังโหลด / error / ไม่พบผู้เช่า */}
                        {(loading || loadError || visible.length === 0) && (
                            <div className={`py-12 text-center ${loadError ? 'text-red-600' : 'text-muted'}`}>
                                {loading ? (
                                    <SkeletonTable rows={6} cols={5} className="border-0 rounded-none text-left" />
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

            {/* หน้าต่างเพิ่มผู้เช่าใหม่ (เลือกได้เฉพาะห้องว่าง) */}
            {modal === 'new' && <AddTenantModal rooms={freeRooms} onSave={handleCreate} onClose={() => setModal(null)} />}
        </>
    )
}

export default TenantsPage
