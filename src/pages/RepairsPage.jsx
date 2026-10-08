import AdminRepairs from '../components/AdminRepairs'
import UserRepairsPage from './UserRepairsPage'
import { useCurrentUser } from '../lib/useCurrentUser'

// แอดมินจัดการรายการแจ้งซ่อมทั้งหมด ผู้เช่าแจ้งซ่อมและติดตามสถานะของห้องตัวเอง
function RepairsPage() {
    const me = useCurrentUser()

    if (!me) return <p className="p-6 text-muted">กำลังโหลด...</p>
    return me.role === 'admin' ? <AdminRepairs adminId={me.id} /> : <UserRepairsPage />
}

export default RepairsPage
