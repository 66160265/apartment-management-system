// icon = ชื่อไอคอนใน components/Icon.jsx
// group: 'main' = งานประจำวัน, 'system' = จัดการระบบ (เฉพาะแอดมิน แยกเป็นหมวดด้านล่างของเมนู)
export const menuItems = [
    { label: 'ภาพรวม', path: '/admin/dashboard', icon: 'dashboard', group: 'main' },
    { label: 'ห้องพัก', path: '/rooms', icon: 'door', group: 'main', adminOnly: true },
    { label: 'ผู้เช่า', path: '/tenants', icon: 'users', group: 'main', adminOnly: true },
    { label: 'ใบแจ้งหนี้', path: '/invoices', icon: 'receipt', group: 'main' },
    { label: 'แจ้งซ่อม', path: '/repairs', icon: 'wrench', group: 'main' },
    { label: 'แจ้งเตือน', path: '/notifications', icon: 'bell', group: 'main' },
    { label: 'บัญชีผู้ใช้', path: '/admin/users', icon: 'key', group: 'system', adminOnly: true },
    { label: 'ตั้งค่า', path: '/settings', icon: 'settings', group: 'system', adminOnly: true },
]

export const systemGroupLabel = 'จัดการระบบ'
