// ชุด skeleton สำหรับหน้าจอระหว่างโหลดข้อมูล (แทนข้อความ "กำลังโหลด...") ทุกชิ้นหน้าตาใกล้กับของจริง ข้อมูลมาแล้วเนื้อหาไม่กระโดด
// - SkeletonRegion: กรอบนอกสุดของแต่ละส่วน บอกโปรแกรมอ่านหน้าจอว่ากำลังโหลด (aria-busy + ข้อความซ่อน) ชิ้นย่อยซ่อนจากโปรแกรมอ่านหน้าจอ
// - ทุกชิ้นกระพริบเฉพาะเมื่อผู้ใช้ไม่ได้ตั้งค่าลดการเคลื่อนไหว (motion-safe)

const bar = 'rounded-lg bg-line/70 motion-safe:animate-pulse'

// กรอบนอก: ใส่ข้อความ "กำลังโหลด..." ที่มองไม่เห็นไว้ให้โปรแกรมอ่านหน้าจอ
export function SkeletonRegion({ children, label = 'กำลังโหลด...', className = '' }) {
    return (
        <div role="status" aria-busy="true" className={className}>
            <span className="sr-only">{label}</span>
            {children}
        </div>
    )
}

// บล็อกสี่เหลี่ยมพื้นฐาน กำหนดขนาดด้วย className (เช่น "h-4 w-32")
export function Skeleton({ className = '' }) {
    return <div aria-hidden="true" className={`${bar} ${className}`} />
}

// ข้อความหลายบรรทัด บรรทัดสุดท้ายสั้นกว่า
export function SkeletonText({ lines = 3, className = '' }) {
    return (
        <div aria-hidden="true" className={`flex flex-col gap-2 ${className}`}>
            {Array.from({ length: lines }, (_, i) => (
                <div key={i} className={`${bar} h-3.5 ${i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full'}`} />
            ))}
        </div>
    )
}

// รายการแถวละหนึ่งรายการ: วงกลมซ้าย ข้อความสองบรรทัด และป้ายขวา (ใช้กับแจ้งเตือน เอกสาร)
export function SkeletonList({ rows = 5, avatar = true, className = '' }) {
    return (
        <SkeletonRegion className={`flex flex-col divide-y divide-line/60 ${className}`}>
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} aria-hidden="true" className="flex items-center gap-3 px-4 py-3.5">
                    {avatar && <div className={`${bar} h-10 w-10 shrink-0 rounded-full!`} />}
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                        <div className={`${bar} h-3.5 ${i % 2 ? 'w-2/5' : 'w-3/5'}`} />
                        <div className={`${bar} h-3 ${i % 3 === 0 ? 'w-4/5' : 'w-1/2'}`} />
                    </div>
                    <div className={`${bar} h-6 w-16 shrink-0 rounded-full!`} />
                </div>
            ))}
        </SkeletonRegion>
    )
}

// ตาราง: แถบหัวตาราง + แถวข้อมูล (จอเล็กไม่ซ่อน ใช้เป็นแถวบล็อกได้เหมือนกัน)
export function SkeletonTable({ rows = 6, cols = 5, className = '' }) {
    return (
        <SkeletonRegion className={`rounded-xl border border-line overflow-hidden ${className}`}>
            <div aria-hidden="true" className="bg-sand/70 border-b border-line px-4 py-3 flex gap-4">
                {Array.from({ length: cols }, (_, c) => (
                    <div key={c} className={`${bar} h-3.5 ${c === 0 ? 'w-24' : 'flex-1'}`} />
                ))}
            </div>
            <div aria-hidden="true" className="divide-y divide-line/60">
                {Array.from({ length: rows }, (_, r) => (
                    <div key={r} className="px-4 py-3.5 flex items-center gap-4">
                        {Array.from({ length: cols }, (_, c) => (
                            <div key={c} className={`${bar} h-4 ${c === 0 ? 'w-24' : 'flex-1'} ${(r + c) % 3 === 0 ? 'max-w-[60%]' : ''}`} />
                        ))}
                    </div>
                ))}
            </div>
        </SkeletonRegion>
    )
}

// การ์ดเดี่ยว: หัวข้อ + ข้อความ
export function SkeletonCard({ lines = 3, className = '' }) {
    return (
        <div aria-hidden="true" className={`bg-white rounded-2xl shadow-card border border-line p-5 flex flex-col gap-3 ${className}`}>
            <div className={`${bar} h-5 w-1/3`} />
            <SkeletonText lines={lines} />
        </div>
    )
}

// กริดการ์ด (ตัวเลขสรุป ห้องพัก)
export function SkeletonCardGrid({ count = 4, className = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4', cardClassName = '' }) {
    return (
        <SkeletonRegion className={className}>
            {Array.from({ length: count }, (_, i) => (
                <div key={i} aria-hidden="true" className={`bg-white rounded-2xl shadow-card border border-line p-4 flex flex-col gap-3 ${cardClassName}`}>
                    <div className={`${bar} h-3.5 w-1/2`} />
                    <div className={`${bar} h-8 w-2/3`} />
                    <div className={`${bar} h-3 w-4/5`} />
                </div>
            ))}
        </SkeletonRegion>
    )
}

// หลายการ์ดเรียงลง (ประกาศ รายการใบแจ้งหนี้ของผู้เช่า)
export function SkeletonCards({ count = 3, lines = 3, className = '' }) {
    return (
        <SkeletonRegion className={`flex flex-col gap-4 ${className}`}>
            {Array.from({ length: count }, (_, i) => (
                <SkeletonCard key={i} lines={lines} />
            ))}
        </SkeletonRegion>
    )
}

// ฟอร์มหลายส่วน (หน้าตั้งค่า): การ์ดละหลายช่องกรอก
export function SkeletonForm({ sections = 3, fields = 4, className = '' }) {
    return (
        <SkeletonRegion className={`flex flex-col gap-6 ${className}`}>
            {Array.from({ length: sections }, (_, s) => (
                <div key={s} aria-hidden="true" className="bg-white rounded-2xl shadow-card p-5">
                    <div className="flex items-center gap-3 mb-5">
                        <div className={`${bar} h-10 w-10 rounded-xl!`} />
                        <div className="flex flex-col gap-2 flex-1">
                            <div className={`${bar} h-4 w-40`} />
                            <div className={`${bar} h-3 w-64 max-w-full`} />
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                        {Array.from({ length: fields }, (_, f) => (
                            <div key={f} className="flex flex-col gap-2">
                                <div className={`${bar} h-3 w-24`} />
                                <div className={`${bar} h-10 w-full rounded-xl!`} />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </SkeletonRegion>
    )
}

// หัวหน้าหน้า (การ์ดชื่อหน้า) ขณะรอโค้ดหรือข้อมูลของหน้าโหลด
export function SkeletonHeader() {
    return (
        <div aria-hidden="true" className="bg-white rounded-2xl border border-line border-l-4 border-l-primary shadow-card px-6 py-4 flex items-center gap-4">
            <div className="flex-1 flex flex-col gap-2">
                <div className={`${bar} h-6 w-48`} />
                <div className={`${bar} h-3.5 w-72 max-w-full`} />
            </div>
            <div className={`${bar} h-10 w-10 rounded-full!`} />
            <div className={`${bar} h-10 w-10 rounded-full!`} />
        </div>
    )
}

// ทั้งหน้า: หัวหน้า + การ์ดสรุป + ตาราง/รายการ ใช้ตอนรอโค้ดของหน้า (Suspense) และตอนรอข้อมูลผู้ใช้
export function SkeletonPage({ className = '' }) {
    return (
        <SkeletonRegion className={`p-4 sm:p-6 flex flex-col gap-6 ${className}`}>
            <SkeletonHeader />
            <SkeletonCardGrid count={3} className="grid gap-5 md:grid-cols-3" />
            <SkeletonTable rows={5} cols={5} />
        </SkeletonRegion>
    )
}

// ทั้งแอป: เมนูข้างเป็นแถบเปล่า + หน้า ใช้ตอนตรวจการเข้าสู่ระบบ (ก่อนรู้ว่าใครล็อกอิน)
export function SkeletonApp() {
    return (
        <div className="flex min-h-screen bg-sand">
            <div aria-hidden="true" className="hidden lg:flex w-64 shrink-0 bg-primary-deep/90 flex-col gap-3 p-4">
                <div className="h-12 rounded-xl bg-white/15 motion-safe:animate-pulse" />
                {Array.from({ length: 7 }, (_, i) => (
                    <div key={i} className="h-9 rounded-lg bg-white/10 motion-safe:animate-pulse" />
                ))}
            </div>
            <main className="flex-1 min-w-0">
                <SkeletonPage />
            </main>
        </div>
    )
}
