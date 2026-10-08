import AvatarMenu from './AvatarMenu'

// หัวหน้าเดียวกันทุกหน้า: ชื่อหน้า + คำอธิบาย ด้านขวาเป็นปุ่มของหน้านั้น (actions) กระดิ่งแจ้งเตือน และเมนูบัญชี
// flush = ไม่ใส่ระยะขอบรอบตัวเอง (ใช้เมื่อหน้านั้นมีตัวห่อที่ใส่ระยะขอบอยู่แล้ว)
function PageHeader({ title, subtitle, actions, flush = false }) {
    return (
        <header className={`flex flex-wrap items-start justify-between gap-4 ${flush ? '' : 'px-6 pt-6 pb-5'}`}>
            <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-primary-dark">{title}</h1>
                {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-3">
                {actions}
                <AvatarMenu />
            </div>
        </header>
    )
}

export default PageHeader
