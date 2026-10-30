import Icon from './Icon'
import { InvoiceCards, InvoiceTable } from './InvoiceRows'
import { SkeletonTable } from './Skeleton.jsx'
import { invoiceStatuses } from '../data/billing'
import { formatMonth } from '../lib/billing'
import { summaryCards } from '../lib/adminInvoices'

// กล่องรายการใบแจ้งหนี้ของแอดมิน: หัวกล่อง (ตัวกรองเดือน ค้นหา) แท็บสถานะ ตารางหรือการ์ด และข้อความโหลด/ว่าง
// visible = รายการที่กรองแล้ว, months = เดือนที่มีใบ (ใหม่สุดก่อน), stats = ผลของ invoiceStats(), totals = ผลของ invoiceTotals()
function InvoiceList({
    visible, months, stats, totals, filter, setFilter, monthFilter, setMonthFilter, search, setSearch,
    loading, loadError, onOpen, onEdit, onDelete,
}) {
    return (
        <div className="bg-white rounded-2xl shadow-card p-4 sm:p-5">
            {/* หัวกล่องรายการ: จำนวน + ตัวกรองเดือน + ช่องค้นหา */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="font-medium text-primary-dark">
                    รายการใบแจ้งหนี้
                    <span className="ml-2 text-sm font-normal text-muted">
                        {filter === 'all' ? 'ทั้งหมด' : invoiceStatuses[filter].label} ({visible.length})
                    </span>
                </h2>
                <div className="w-full sm:w-auto flex items-center gap-2">
                    <select
                        value={monthFilter}
                        onChange={(e) => setMonthFilter(e.target.value)}
                        aria-label="กรองตามเดือน"
                        className="border border-line bg-sand/50 rounded-xl px-3 py-1.5 text-sm outline-none focus:border-secondary"
                    >
                        <option value="all">ทุกเดือน</option>
                        {months.map((m) => (
                            <option key={m} value={m}>{formatMonth(m)}</option>
                        ))}
                    </select>
                    <div className="flex items-center gap-2 border border-line bg-sand/50 rounded-xl px-3 py-1.5 flex-1 min-w-0 sm:flex-none sm:w-64 focus-within:border-secondary focus-within:ring-4 focus-within:ring-secondary/15 focus-within:bg-white">
                        <Icon name="search" className="w-4 h-4 text-muted" />
                        <input
                            type="text"
                            placeholder="ค้นหาห้อง/ชื่อผู้เช่า"
                            className="outline-none w-full bg-transparent text-sm"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>
            {/* แท็บสถานะพร้อมจำนวน */}
            <div role="tablist" aria-label="หมวดหมู่ใบแจ้งหนี้" className="flex sm:gap-1 overflow-x-auto overflow-y-hidden mb-4 border-b border-line">
                {summaryCards.map((c) => {
                    const active = filter === c.value
                    return (
                        <button
                            key={c.value}
                            role="tab"
                            aria-selected={active}
                            onClick={() => setFilter(c.value)}
                            className={`flex-1 sm:flex-none min-w-0 flex items-center justify-center gap-0.5 sm:gap-2 px-0.5 sm:px-4 py-2.5 text-xs sm:text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                                active ? 'border-primary text-primary-dark font-medium' : 'border-transparent text-muted hover:text-primary-dark hover:bg-sand/60'
                            }`}
                        >
                            {/* จอเล็ก: 4 แท็บเท่ากันในแถวเดียว ไม่ต้องเลื่อน (ใช้ชื่อสั้นถ้ามี) */}
                            <span className="sm:hidden">{c.short ?? c.label}</span>
                            <span className="hidden sm:inline">{c.label}</span>
                            <span className={`min-w-5 sm:min-w-6 text-center text-xs rounded-full px-1 sm:px-1.5 py-0.5 ${active ? 'bg-primary text-white' : 'bg-sand text-muted'}`}>
                                {stats[c.value].count}
                            </span>
                        </button>
                    )
                })}
            </div>
            <div className="xl:overflow-auto xl:max-h-[32rem] xl:rounded-xl xl:border xl:border-line xl:shadow-sm">
                <InvoiceTable rows={visible} totals={totals} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />
                <InvoiceCards rows={visible} totals={totals} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />
                {/* ข้อความกำลังโหลด / error / ไม่พบรายการ */}
                {(loading || loadError || visible.length === 0) && (
                    <div className={`py-10 text-center ${loadError ? 'text-red-600' : 'text-muted'}`}>
                        {loading ? (
                            <SkeletonTable rows={5} cols={5} className="border-0 rounded-none text-left" />
                        ) : loadError ? (
                            loadError
                        ) : (
                            <>
                                <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-full bg-sand text-muted"><Icon name="receipt" className="w-6 h-6" /></span>
                                {search || filter !== 'all' || monthFilter !== 'all' ? 'ไม่พบใบแจ้งหนี้ที่ตรงกับเงื่อนไข' : 'ยังไม่มีใบแจ้งหนี้ เริ่มสร้างใบแรกได้จากฟอร์มด้านบน'}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default InvoiceList
