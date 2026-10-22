import { lazy } from 'react'

// โหลดเฉพาะฝั่งที่ใช้ (ผู้เช่าไม่ต้องโหลดโค้ดฝั่งแอดมิน)
const AdminRepairs = lazy(() => import('../components/AdminRepairs'))
const UserRepairsPage = lazy(() => import('./UserRepairsPage'))
import { useCurrentUser } from '../lib/useCurrentUser'
import { SkeletonPage } from '../components/Skeleton.jsx'

// แอดมินจัดการรายการแจ้งซ่อมทั้งหมด ผู้เช่าแจ้งซ่อมและติดตามสถานะของห้องตัวเอง
function RepairsPage() {
    const me = useCurrentUser()

    // รอข้อมูลผู้ใช้ก่อน แล้วเลือกหน้าตามสิทธิ์: แอดมิน = จัดการแจ้งซ่อม, ผู้เช่า = แจ้งซ่อมของตัวเอง
    if (!me) return <SkeletonPage />
    return me.role === 'admin' ? <AdminRepairs adminId={me.id} /> : <UserRepairsPage />
}

export default RepairsPage
