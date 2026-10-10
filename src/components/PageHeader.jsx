import AvatarMenu from './AvatarMenu'

// หัวหน้าเดียวกันทุกหน้า: ชื่อหน้า + คำอธิบาย ด้านขวาเป็นปุ่มของหน้านั้น (actions) กระดิ่งแจ้งเตือน และเมนูบัญชี
// จอเล็ก: ชื่อหน้าอยู่แถวเดียวกับกระดิ่ง/เมนูบัญชี ส่วนปุ่มของหน้าลงมาอยู่แถวถัดไปเต็มความกว้าง
// flush = ไม่ใส่ระยะขอบรอบตัวเอง (ใช้เมื่อหน้านั้นมีตัวห่อที่ใส่ระยะขอบอยู่แล้ว)
function PageHeader({ title, subtitle, actions, flush = false }) {
    return (
        <header className={`flex flex-wrap items-start gap-x-3 gap-y-3 sm:gap-x-4 ${flush ? '' : 'px-4 sm:px-6 pt-5 sm:pt-6 pb-4 sm:pb-5'}`}>
            <div className="min-w-0 flex-1 basis-0 sm:basis-auto">
                <h1 className="text-xl sm:text-2xl font-semibold text-primary-dark">{title}</h1>
                {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="order-3 w-full flex flex-wrap items-center gap-3 sm:order-2 sm:w-auto">{actions}</div>}
            <div className="order-2 sm:order-3 shrink-0">
                <AvatarMenu />
            </div>
        </header>
    )
}

export default PageHeader
