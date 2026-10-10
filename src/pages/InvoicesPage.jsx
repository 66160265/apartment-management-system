import AdminInvoices from '../components/AdminInvoices'
import TenantInvoices from '../components/TenantInvoices'
import { useCurrentUser } from '../lib/useCurrentUser'

// แอดมินสร้าง/ตรวจสอบใบแจ้งหนี้ ผู้เช่าดูใบแจ้งหนี้ของตัวเองและแนบสลิป
function InvoicesPage() {
    const me = useCurrentUser()

    if (!me) return <p className="p-6 text-muted">กำลังโหลด...</p>
    return me.role === 'admin' ? <AdminInvoices /> : <TenantInvoices userId={me.id} />
}

export default InvoicesPage
