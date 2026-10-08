import NotificationDropdown from './NotificationDropdown'

// กระดิ่งแจ้งเตือนของผู้เช่า: ใบแจ้งหนี้ใหม่ ผลตรวจสลิป ความคืบหน้างานซ่อม (ข้อมูลจริงจากตาราง notifications)
function UserNotificationBell() {
    return <NotificationDropdown emptyText="ยังไม่มีการแจ้งเตือน เมื่อมีใบแจ้งหนี้ใหม่หรืองานซ่อมมีความคืบหน้า จะแสดงที่นี่" />
}

export default UserNotificationBell
