import { RedirectIfAuthed, RequireAuth, RequireRole } from './components/AuthGuards.jsx'
import { Navigate, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { lazy } from 'react'
import LoginPage from './pages/LoginPage.jsx'
import { pageLoaders } from './lib/pages.js'

// หน้าที่เหลือโหลดแบบ lazy (แยกไฟล์ต่อหน้า โหลดเมื่อเข้าหน้านั้น) หน้า login โหลดทันทีเพราะเป็นหน้าแรก ดู lib/pages.js
const AdminDashboardPage = lazy(pageLoaders.adminDashboard)
const InvoicesPage = lazy(pageLoaders.invoices)
const RepairsPage = lazy(pageLoaders.repairs)
const RoomsPage = lazy(pageLoaders.rooms)
const TenantsPage = lazy(pageLoaders.tenants)
const UserDashboardPage = lazy(pageLoaders.userDashboard)
const AccountPage = lazy(pageLoaders.account)
const AdminUsersPage = lazy(pageLoaders.adminUsers)
const AuditLogPage = lazy(pageLoaders.audit)
const ReportsPage = lazy(pageLoaders.reports)
const NotificationsPage = lazy(pageLoaders.notifications)
const SettingsPage = lazy(pageLoaders.settings)
const ChatPage = lazy(pageLoaders.chat)

// กำหนดเส้นทาง (route) ทั้งหมดของแอป: หน้า login, หน้าของแอดมิน, หน้าของผู้เช่า และหน้าที่ใช้ร่วมกัน
function App() {
  return (
    <>
      <Routes>

        {/* หน้า login (ถ้า login อยู่แล้วจะพาไปหน้าแรกของสิทธิ์นั้น) */}
        <Route path="/" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />

        {/* ต้อง login ก่อนจึงเข้าหน้าในกลุ่มนี้ได้ */}
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          {/* เฉพาะผู้ดูแลระบบ */}
          <Route path="/admin/dashboard" element={<RequireRole role="admin"><AdminDashboardPage /></RequireRole>} />
          <Route path="/rooms" element={<RequireRole role="admin"><RoomsPage /></RequireRole>} />
          <Route path="/tenants" element={<RequireRole role="admin"><TenantsPage /></RequireRole>} />
          <Route path="/settings" element={<RequireRole role="admin"><SettingsPage /></RequireRole>} />
          <Route path="/admin/users" element={<RequireRole role="admin"><AdminUsersPage /></RequireRole>} />
          <Route path="/admin/audit" element={<RequireRole role="admin"><AuditLogPage /></RequireRole>} />
          <Route path="/admin/reports" element={<RequireRole role="admin"><ReportsPage /></RequireRole>} />

          {/* เฉพาะผู้เช่า */}
          <Route path="/user/dashboard" element={<RequireRole role="user"><UserDashboardPage /></RequireRole>} />

          {/* ทั้งสองสิทธิ์ใช้ร่วมกัน */}
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/repairs" element={<RepairsPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>

        {/* ที่อยู่ที่ไม่มีในระบบ กลับไปหน้า login (ถ้า login อยู่จะถูกส่งต่อไปหน้าแรกของสิทธิ์) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
