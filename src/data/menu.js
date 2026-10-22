// icon = ชื่อไอคอนใน components/Icon.jsx
// เรียงตามความสำคัญ: เงิน (ใบแจ้งหนี้) > เรื่องที่ต้องตอบสนองเร็ว (แจ้งซ่อม แชท แจ้งเตือน ประกาศ) > ข้อมูลหลัก (ผู้เช่า ห้อง รายงาน) > ตั้งค่าระบบ
// group: 'main' = งานประจำวัน, 'system' = จัดการระบบ (เฉพาะแอดมิน แยกเป็นหมวดด้านล่างของเมนู)
export const menuItems = [
    { label: 'ภาพรวม', path: '/admin/dashboard', icon: 'dashboard', group: 'main' },
    { label: 'ใบแจ้งหนี้', path: '/invoices', icon: 'receipt', group: 'main' },
    { label: 'แจ้งซ่อม', path: '/repairs', icon: 'wrench', group: 'main' },
    { label: 'แชท', path: '/chat', icon: 'chat', group: 'main' },
    { label: 'แจ้งเตือน', path: '/notifications', icon: 'bell', group: 'main' },
    { label: 'ประกาศ', path: '/announcements', icon: 'megaphone', group: 'main' },
    { label: 'ผู้เช่า', path: '/tenants', icon: 'users', group: 'main', adminOnly: true },
    { label: 'ห้องพัก', path: '/rooms', icon: 'door', group: 'main', adminOnly: true },
    { label: 'รายงาน', path: '/admin/reports', icon: 'fileText', group: 'main', adminOnly: true },
    { label: 'ตั้งค่า', path: '/settings', icon: 'settings', group: 'system', adminOnly: true },
    { label: 'บัญชีผู้ใช้', path: '/admin/users', icon: 'key', group: 'system', adminOnly: true },
    { label: 'ประวัติการแก้ไข', path: '/admin/audit', icon: 'clock', group: 'system', adminOnly: true },
]

// หัวข้อของกลุ่มเมนู system ใน Sidebar
export const systemGroupLabel = 'จัดการระบบ'
