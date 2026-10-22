// ตัวโหลดหน้าแบบ lazy: แต่ละหน้าถูกแยกเป็นไฟล์ JS ของตัวเอง โหลดเมื่อเข้าหน้านั้นครั้งแรก (App.jsx ใช้กับ React.lazy)
// เปิดเว็บจึงโหลดเฉพาะโค้ดที่จำเป็น (ผู้เช่าไม่ต้องโหลดโค้ดหน้าแอดมิน) แล้ว prefetchPages() ดึงหน้าที่น่าจะเปิดต่อมาไว้ล่วงหน้าตอนเครื่องว่าง
// ใช้ตัวโหลดเดียวกันทั้งสองที่ ไฟล์ที่ prefetch ไว้จึงถูกใช้ซ้ำทันที ไม่โหลดสองรอบ

export const pageLoaders = {
    adminDashboard: () => import('../pages/AdminDashboardPage.jsx'),
    rooms: () => import('../pages/RoomsPage.jsx'),
    tenants: () => import('../pages/TenantsPage.jsx'),
    settings: () => import('../pages/SettingsPage.jsx'),
    adminUsers: () => import('../pages/AdminUsersPage.jsx'),
    audit: () => import('../pages/AuditLogPage.jsx'),
    reports: () => import('../pages/ReportsPage.jsx'),
    userDashboard: () => import('../pages/UserDashboardPage.jsx'),
    invoices: () => import('../pages/InvoicesPage.jsx'),
    repairs: () => import('../pages/RepairsPage.jsx'),
    chat: () => import('../pages/ChatPage.jsx'),
    account: () => import('../pages/AccountPage.jsx'),
    notifications: () => import('../pages/NotificationsPage.jsx'),
}

// หน้าที่ prefetch ต่อสิทธิ์ (เรียงตามที่น่าจะเปิดบ่อย)
export const prefetchOrder = {
    admin: ['invoices', 'repairs', 'tenants', 'rooms', 'reports', 'notifications', 'chat', 'settings', 'audit', 'adminUsers', 'account'],
    user: ['invoices', 'repairs', 'notifications', 'chat', 'account'],
}

// ดึงหน้าไว้ล่วงหน้าตอนเบราว์เซอร์ว่าง ทีละหน้า (ไม่แย่งแบนด์วิดท์กับหน้าที่กำลังใช้งาน) ข้ามถ้าผู้ใช้เปิดโหมดประหยัดข้อมูล
// คืนฟังก์ชันยกเลิก
export function prefetchPages(role, { idle = defaultIdle, loaders = pageLoaders, connection = globalThis.navigator?.connection } = {}) {
    if (connection?.saveData) return () => {}
    const queue = [...(prefetchOrder[role] ?? [])]
    let cancelled = false
    let cancelIdle = () => {}

    const next = () => {
        if (cancelled || queue.length === 0) return
        const key = queue.shift()
        Promise.resolve(loaders[key]?.()).catch(() => {}).finally(() => {
            cancelIdle = idle(next)
        })
    }
    cancelIdle = idle(next)

    return () => {
        cancelled = true
        cancelIdle()
    }
}

// requestIdleCallback (ไม่มีในบางเบราว์เซอร์ ใช้ setTimeout แทน)
function defaultIdle(callback) {
    if (typeof requestIdleCallback === 'function') {
        const id = requestIdleCallback(callback, { timeout: 4000 })
        return () => cancelIdleCallback(id)
    }
    const id = setTimeout(callback, 1500)
    return () => clearTimeout(id)
}
