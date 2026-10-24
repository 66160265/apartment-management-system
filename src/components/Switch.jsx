// สวิตช์เปิด-ปิดพร้อมป้ายข้อความ (แทนช่องติ๊กของเบราว์เซอร์ในตัวกรอง/ตัวเลือกที่สลับแสดงผล)
// กดได้ทั้งสวิตช์และข้อความ อ่านค่าด้วย aria-checked ให้โปรแกรมอ่านหน้าจอรู้สถานะ
// badge = ตัวเลขเล็ก ๆ ท้ายป้าย (เช่น จำนวนรายการที่จะแสดงเพิ่ม)
function Switch({ checked, onChange, children, badge, disabled = false }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`inline-flex items-center gap-2.5 rounded-xl border bg-white px-3 py-1.5 text-sm text-ink disabled:opacity-60 disabled:cursor-not-allowed ${
                checked ? 'border-primary/40' : 'border-line'
            }`}
        >
            <span className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-line'}`}>
                <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : ''}`} />
            </span>
            <span>{children}</span>
            {badge !== undefined && (
                <span className="min-w-5 rounded-full bg-sand px-1.5 text-center text-xs font-medium text-muted tabular-nums">{badge}</span>
            )}
        </button>
    )
}

export default Switch
