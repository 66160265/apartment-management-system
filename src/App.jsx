import { RedirectIfAuthed, RequireAuth, RequireRole } from './components/AuthGuards.jsx'
import { Navigate, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import AdminDashboardPage from './pages/AdminDashboardPage.jsx'
import InvoicesPage from './pages/InvoicesPage.jsx'
import RepairsPage from './pages/RepairsPage.jsx'
import RoomsPage from './pages/RoomsPage.jsx'
import TenantsPage from './pages/TenantsPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import UserDashboardPage from './pages/UserDashboardPage.jsx'
import AccountPage from './pages/AccountPage.jsx'
import AdminUsersPage from './pages/AdminUsersPage.jsx'
import NotificationsPage from './pages/NotificationsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

function App() {
  return (
    <>
      <Routes>

        <Route path="/" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />

        {/* ต้อง login ก่อนจึงเข้าหน้าในกลุ่มนี้ได้ */}
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          {/* เฉพาะผู้ดูแลระบบ */}
          <Route path="/admin/dashboard" element={<RequireRole role="admin"><AdminDashboardPage /></RequireRole>} />
          <Route path="/rooms" element={<RequireRole role="admin"><RoomsPage /></RequireRole>} />
          <Route path="/tenants" element={<RequireRole role="admin"><TenantsPage /></RequireRole>} />
          <Route path="/settings" element={<RequireRole role="admin"><SettingsPage /></RequireRole>} />
          <Route path="/admin/users" element={<RequireRole role="admin"><AdminUsersPage /></RequireRole>} />

          {/* เฉพาะผู้เช่า */}
          <Route path="/user/dashboard" element={<RequireRole role="user"><UserDashboardPage /></RequireRole>} />

          {/* ทั้งสองสิทธิ์ใช้ร่วมกัน */}
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/repairs" element={<RepairsPage />} />
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
