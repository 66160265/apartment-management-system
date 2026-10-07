export const menuItems = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: '📊'},
    { label: 'ห้องพัก', path: '/rooms', icon: '🚪', adminOnly: true},
    { label: 'ผู้เช่า', path: '/tenants', icon: '👥', adminOnly: true},
    { label: 'ใบแจ้งหนี้', path: '/invoices', icon: '🧾'},
    { label: 'แจ้งซ่อม', path: '/repairs', icon: '🔧'},
    { label: 'บัญชีผู้ใช้', path: '/admin/users', icon: '🔑', adminOnly: true },
    { label: 'แจ้งเตือน', path: '/notifications', icon: '🔔'}
]