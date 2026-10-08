// icon = ชื่อไอคอนใน components/Icon.jsx
export const menuItems = [
    { label: 'ภาพรวม', path: '/admin/dashboard', icon: 'dashboard' },
    { label: 'ห้องพัก', path: '/rooms', icon: 'door', adminOnly: true },
    { label: 'ผู้เช่า', path: '/tenants', icon: 'users', adminOnly: true },
    { label: 'ใบแจ้งหนี้', path: '/invoices', icon: 'receipt' },
    { label: 'แจ้งซ่อม', path: '/repairs', icon: 'wrench' },
    { label: 'บัญชีผู้ใช้', path: '/admin/users', icon: 'key', adminOnly: true },
    { label: 'แจ้งเตือน', path: '/notifications', icon: 'bell' },
]
