import AvatarMenu from './AvatarMenu'
import Icon from './Icon'

// หัวหน้าเดียวกันทุกหน้า: การ์ดสีขาวมีแถบสีด้านซ้าย (ไม่ลอยบนพื้นหลังเดียวกับเนื้อหา) ชื่อหน้า + คำอธิบาย
// ด้านขวาเป็นปุ่มของหน้านั้น (actions) กระดิ่งแจ้งเตือน และเมนูบัญชี
// จอเล็ก: ชื่อหน้าอยู่แถวเดียวกับกระดิ่ง/เมนูบัญชี ส่วนปุ่มของหน้าลงมาอยู่แถวถัดไปเต็มความกว้าง
// flush = ไม่ใส่ระยะขอบรอบตัวเอง (ใช้เมื่อหน้านั้นมีตัวห่อที่ใส่ระยะขอบอยู่แล้ว)
// onBack = หน้ารายละเอียด/หน้าย่อย: แสดงปุ่มย้อนกลับหน้าชื่อหน้า (backLabel ใช้เป็นคำอธิบายปุ่ม)
// relative z-10: เมนูบัญชีที่กางลงมาต้องอยู่เหนือการ์ดที่ตามหลัง
function PageHeader({ title, subtitle, actions, flush = false, onBack, backLabel = 'ย้อนกลับ' }) {
    return (
        <header className={`relative z-10 ${flush ? '' : 'px-4 sm:px-6 pt-4 sm:pt-6 pb-4 sm:pb-5'}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-3 sm:gap-x-4 bg-white rounded-2xl border border-line border-l-4 border-l-primary shadow-card px-4 sm:px-6 py-4">
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label={backLabel}
                        title={backLabel}
                        className="grid place-items-center w-9 h-9 shrink-0 rounded-xl border border-line bg-sand/50 text-primary-dark hover:bg-mist/50"
                    >
                        <Icon name="arrowLeft" className="w-5 h-5" />
                    </button>
                )}
                {/* ชื่อหน้าและคำอธิบาย */}
                <div className="min-w-0 flex-1 basis-0 sm:basis-auto">
                    <h1 className="text-xl sm:text-2xl font-semibold text-primary-dark">{title}</h1>
                    {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
                </div>
                {/* ปุ่ม/ตัวควบคุมเพิ่มเติมของแต่ละหน้า (บนจอเล็กขึ้นบรรทัดใหม่) */}
                {actions && <div className="order-3 w-full flex flex-wrap items-center gap-3 sm:order-2 sm:w-auto">{actions}</div>}
                {/* เมนูบัญชีผู้ใช้มุมขวา */}
                <div className="order-2 sm:order-3 shrink-0">
                    <AvatarMenu />
                </div>
            </div>
        </header>
    )
}

export default PageHeader
