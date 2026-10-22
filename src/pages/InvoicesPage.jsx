import { lazy } from 'react'

// โหลดเฉพาะฝั่งที่ใช้ (ผู้เช่าไม่ต้องโหลดโค้ดฝั่งแอดมิน)
const AdminInvoices = lazy(() => import('../components/AdminInvoices'))
const TenantInvoices = lazy(() => import('../components/TenantInvoices'))
import { useCurrentUser } from '../lib/useCurrentUser'
import { SkeletonPage } from '../components/Skeleton.jsx'

// แอดมินสร้าง/ตรวจสอบใบแจ้งหนี้ ผู้เช่าดูใบแจ้งหนี้ของตัวเองและแนบสลิป
function InvoicesPage() {
    const me = useCurrentUser()

    // รอข้อมูลผู้ใช้ก่อน แล้วเลือกหน้าตามสิทธิ์: แอดมิน = จัดการใบแจ้งหนี้, ผู้เช่า = ใบแจ้งหนี้ของตัวเอง
    if (!me) return <SkeletonPage />
    return me.role === 'admin' ? <AdminInvoices /> : <TenantInvoices userId={me.id} />
}

export default InvoicesPage
