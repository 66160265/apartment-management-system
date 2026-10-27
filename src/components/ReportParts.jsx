import Icon from './Icon'

// ชิ้นส่วนที่ทุกส่วนของหน้ารายงาน (pages/ReportsPage.jsx) ใช้ร่วมกัน

// แถบเทียบสัดส่วน (ใช้ในสถิติแจ้งซ่อม)
export function CountBar({ label, count, max }) {
    return (
        <li className="flex items-center gap-3 text-sm">
            <span className="w-40 shrink-0 truncate text-ink" title={label}>{label}</span>
            <span className="flex-1 h-2 rounded-full bg-sand overflow-hidden">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }} />
            </span>
            <span className="w-14 shrink-0 text-right tabular-nums text-muted">{count} งาน</span>
        </li>
    )
}

// การ์ดตัวเลขสรุป
// mobileHint: คำอธิบายแทนบนจอเล็ก (null = ซ่อนคำอธิบายบนจอเล็ก, ไม่ส่ง = ใช้ hint เดิม)
export function Stat({ label, value, hint, mobileHint, tone = 'text-primary-dark', className = '' }) {
    const hasMobile = mobileHint !== undefined
    return (
        <div className={`bg-white rounded-2xl shadow-card p-3 sm:p-4 ${className}`}>
            <div className="text-xs sm:text-sm leading-tight text-muted">{label}</div>
            <div className={`text-lg sm:text-2xl font-semibold mt-1 tabular-nums ${tone}`}>{value}</div>
            {hasMobile && mobileHint && <div className="sm:hidden text-xs text-muted mt-0.5">{mobileHint}</div>}
            {hint && <div className={`text-xs text-muted mt-0.5 ${hasMobile ? 'hidden sm:block' : ''}`}>{hint}</div>}
        </div>
    )
}

// การ์ดแทนแถวตารางบนจอเล็ก (ต่ำกว่า md): หัวการ์ด + คู่ ชื่อ/ค่า 2 คอลัมน์
// rows = [[ชื่อ, ค่า, className ของค่า]] ข้ามแถวที่ค่าเป็น null
export function MobileCard({ title, aside, rows, className = '' }) {
    return (
        <li className={`rounded-xl border border-line p-3 ${className}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm text-ink">{title}</div>
                {aside && <div className="shrink-0 text-sm text-right">{aside}</div>}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {rows.filter((r) => r[1] !== null).map(([k, v, cls = 'text-ink']) => (
                    <div key={k} className="flex items-baseline justify-between gap-2 min-w-0">
                        <dt className="text-muted truncate">{k}</dt>
                        <dd className={`tabular-nums whitespace-nowrap ${cls}`}>{v}</dd>
                    </div>
                ))}
            </dl>
        </li>
    )
}

// ปุ่มส่งออก CSV
// short: ชื่อปุ่มสั้นบนจอเล็ก
export function ExportButton({ onClick, children, short }) {
    return (
        <button type="button" onClick={onClick} className="flex items-center justify-center gap-1.5 border border-line bg-white text-primary-dark hover:bg-mist/40 px-3 sm:px-3.5 py-1.5 rounded-xl text-sm whitespace-nowrap">
            <Icon name="download" className="w-4 h-4 shrink-0" />
            {short ? <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{children}</span></> : children}
        </button>
    )
}
