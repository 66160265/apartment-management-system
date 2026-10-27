import Icon from './Icon'
import { RepairCards, RepairTable } from './AdminRepairRows'
import { SkeletonTable } from './Skeleton.jsx'
import { repairCategories } from '../data/repairs'
import { formatSlot, todayIso } from '../lib/repairs'

// ไอคอนและสีของการ์ดสรุปแต่ละสถานะ
const summaryMeta = {
    all: { icon: 'wrench', tone: 'bg-slate-100 text-slate-600' },
    pending: { icon: 'clock', tone: 'bg-sky-50 text-sky-700' },
    in_progress: { icon: 'review', tone: 'bg-amber-50 text-amber-700' },
    done: { icon: 'checkCircle', tone: 'bg-emerald-50 text-emerald-700' },
    cancelled: { icon: 'ban', tone: 'bg-slate-100 text-slate-600' },
}

// นัดซ่อมที่จะถึง (ตารางงานช่าง) แสดง 8 นัดแรก กดเพื่อเปิดจัดการเรื่องนั้น
function UpcomingAppointments({ upcoming, onOpen }) {
    if (upcoming.length === 0) return null
    return (
        <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5">
            <h2 className="font-medium text-primary-dark mb-3 flex items-center gap-2">
                <Icon name="calendar" className="w-5 h-5" />
                นัดซ่อมที่จะถึง
                <span className="text-sm font-normal text-muted">({upcoming.length})</span>
            </h2>
            <div className="flex flex-col divide-y divide-line">
                {upcoming.slice(0, 8).map((r) => {
                    const isToday = r.appointment_date === todayIso()
                    return (
                        <button key={r.id} onClick={() => onOpen(r)} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left hover:bg-sand/50 rounded-lg px-2">
                            <span className={`text-sm font-medium whitespace-nowrap ${isToday ? 'text-red-600' : 'text-ink'}`}>
                                {isToday && 'วันนี้ · '}
                                {formatSlot(r.appointment_date, r.appointment_period)}
                            </span>
                            <span className="inline-block px-2 py-0.5 rounded-lg bg-mist/60 text-primary-dark text-sm font-semibold">{r.room}</span>
                            <span className="text-sm text-ink flex-1 min-w-32">{r.problem}</span>
                            {r.technician && <span className="text-xs text-muted">ช่าง{r.technician}{r.technician_phone && ` ${r.technician_phone}`}</span>}
                            {r.allow_entry && <span className="text-xs text-emerald-700">เข้าห้องได้</span>}
                            {r.appointment_state === 'proposed' && <span className="text-xs font-medium text-amber-700">รอผู้เช่ายืนยัน</span>}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// การ์ดสรุปจำนวนตามสถานะ กดเพื่อกรองรายการ (ทำหน้าที่เป็นแท็บ)
function StatusTabs({ tabs, counts, activeTab, onChange }) {
    return (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
            {tabs.map((t) => {
                const active = activeTab === t.key
                const meta = summaryMeta[t.key]
                return (
                    <button
                        key={t.key}
                        onClick={() => onChange(t.key)}
                        aria-pressed={active}
                        className={`text-left rounded-xl sm:rounded-2xl p-2.5 sm:p-4 bg-white shadow-card border-2 transition ${active ? 'border-primary' : 'border-transparent hover:border-mist'}`}
                    >
                        <div className="flex items-center justify-between gap-1 text-xs sm:text-sm leading-tight text-muted">
                            <span><span className="sm:hidden">{t.short ?? t.label}</span><span className="hidden sm:inline">{t.label}</span></span>
                            <span className={`hidden sm:grid place-items-center w-8 h-8 shrink-0 rounded-lg ${meta.tone}`}><Icon name={meta.icon} className="w-[18px] h-[18px]" /></span>
                        </div>
                        <div className="mt-1 sm:mt-2 flex items-baseline gap-2">
                            <span className="text-xl sm:text-2xl font-semibold text-primary-dark">{counts[t.key] ?? 0}</span>
                            <span className="hidden sm:inline text-xs text-muted">รายการ</span>
                        </div>
                    </button>
                )
            })}
        </div>
    )
}

// ตัวกรองประเภท ปุ่มเรียงตามวันที่ และช่องค้นหาห้อง
// จอเล็กประเภทกับปุ่มเรียงอยู่แถวเดียวกันกว้างเท่ากัน ช่องค้นหาเต็มแถวล่าง (ทุกกล่องสูงเท่ากัน)
function Filters({ categoryFilter, setCategoryFilter, oldestFirst, setOldestFirst, search, setSearch }) {
    return (
        <div className="w-full sm:w-auto grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="กรองตามประเภท"
                className="h-9 min-w-0 w-full sm:w-auto border border-line bg-sand/50 rounded-xl px-3 text-sm outline-none focus:border-secondary focus:bg-white"
            >
                <option value="all">ทุกประเภท</option>
                {Object.entries(repairCategories).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                ))}
            </select>
            <button
                type="button"
                onClick={() => setOldestFirst((v) => !v)}
                className="h-9 min-w-0 flex items-center justify-center gap-1.5 whitespace-nowrap border border-line bg-sand/50 rounded-xl px-3 text-[16px] sm:text-sm text-ink hover:bg-white"
            >
                <Icon name="calendar" className="w-4 h-4 text-muted" />
                {oldestFirst ? 'เก่าสุด → ใหม่สุด' : 'ใหม่สุด → เก่าสุด'}
            </button>
            <div className="col-span-2 h-9 sm:w-48 flex items-center gap-2 border border-line bg-sand/50 rounded-xl px-3 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/15 focus-within:bg-white">
                <Icon name="search" className="w-4 h-4 text-muted" />
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ค้นหาห้อง"
                    className="outline-none w-full bg-transparent text-sm"
                />
            </div>
        </div>
    )
}

// หน้ารายการแจ้งซ่อมของแอดมิน: นัดที่จะถึง การ์ดสรุปตามสถานะ ตัวกรอง และตาราง/การ์ดรายการ
// visible = รายการที่ผ่านตัวกรอง (ใช้นับ), sorted = รายการเดียวกันเรียงแล้ว (ใช้แสดง), total = จำนวนรายการทั้งหมด
function AdminRepairList({
    upcoming, tabs, counts, activeTab, setActiveTab,
    categoryFilter, setCategoryFilter, oldestFirst, setOldestFirst, search, setSearch,
    loading, loadError, pinError, visible, sorted, total,
    payState, onOpen, onTogglePin,
}) {
    return (
        <>
            <UpcomingAppointments upcoming={upcoming} onOpen={onOpen} />
            <StatusTabs tabs={tabs} counts={counts} activeTab={activeTab} onChange={setActiveTab} />

            {/* กล่องรายการ */}
            <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5">
                {/* หัวกล่อง: จำนวนรายการที่แสดง + ตัวกรอง */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="font-medium text-primary-dark">
                        รายการแจ้งซ่อม
                        <span className="ml-2 text-sm font-normal text-muted">({visible.length})</span>
                    </h2>
                    {pinError && <p className="w-full text-sm text-red-600 order-last">{pinError}</p>}
                    <Filters
                        categoryFilter={categoryFilter}
                        setCategoryFilter={setCategoryFilter}
                        oldestFirst={oldestFirst}
                        setOldestFirst={setOldestFirst}
                        search={search}
                        setSearch={setSearch}
                    />
                </div>

                {/* กำลังโหลด/โหลดไม่สำเร็จ แสดงข้อความ ไม่งั้นแสดงรายการ */}
                {loading || loadError ? (
                    loading ? <SkeletonTable rows={6} cols={5} /> : <p className="text-center py-12 text-red-600">{loadError}</p>
                ) : (
                    <div className="xl:overflow-auto xl:max-h-[36rem] xl:rounded-xl xl:border xl:border-line xl:shadow-sm">
                        <RepairTable rows={sorted} payState={payState} onOpen={onOpen} onTogglePin={onTogglePin} />
                        <RepairCards rows={sorted} payState={payState} onOpen={onOpen} onTogglePin={onTogglePin} />
                        {/* ไม่มีรายการ: แยกข้อความระหว่าง "ยังไม่มีเลย" กับ "ค้นหา/กรองแล้วไม่เจอ" */}
                        {visible.length === 0 && (
                            <div className="py-12 text-center text-muted">
                                <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-full bg-sand text-muted"><Icon name="wrench" className="w-6 h-6" /></span>
                                {total === 0 ? 'ยังไม่มีรายการแจ้งซ่อม' : 'ไม่พบรายการที่ตรงกับเงื่อนไข'}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    )
}

export default AdminRepairList
