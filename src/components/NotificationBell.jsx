import NotificationDropdown from './NotificationDropdown'

// กระดิ่งแจ้งเตือนของแอดมิน: แจ้งซ่อมใหม่ สลิปรอตรวจสอบ ฯลฯ (ข้อมูลจริงจากตาราง notifications)
function NotificationBell() {
    return <NotificationDropdown emptyText="ยังไม่มีการแจ้งเตือน เมื่อมีแจ้งซ่อมหรือสลิปใหม่จากผู้เช่า จะแสดงที่นี่" />
}

export default NotificationBell
