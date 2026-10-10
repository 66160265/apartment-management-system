import { contractStatus, contractStyles } from '../lib/tenants'

// ป้ายสถานะสัญญา (ปกติ / ใกล้หมด / หมดสัญญา)
export function ContractBadge({ endDate, showHint = false }) {
    const s = contractStatus(endDate)
    const style = contractStyles[s.key]
    return (
        <span className="inline-flex flex-col items-start">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${style.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                {s.label}
            </span>
            {showHint && <span className="text-xs text-muted mt-1">{s.hint}</span>}
        </span>
    )
}

// วงกลมตัวอักษรแรกของชื่อ
export function Avatar({ name, className = 'w-9 h-9 text-sm' }) {
    return (
        <span className={`grid place-items-center rounded-full bg-mist text-primary-dark font-semibold shrink-0 ${className}`}>
            {name.trim().charAt(0)}
        </span>
    )
}
