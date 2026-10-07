import './App.css'
import { Routes, Route } from 'react-router-dom'
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

function App() {
  return (
    <>
      <Routes>

        <Route path="/" element={<LoginPage />} />

        <Route element={<Layout />}>
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/user/dashboard" element={<UserDashboardPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/tenants" element={<TenantsPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/repairs" element={<RepairsPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
        </Route>
      </Routes>
    </>
  )
}

export default App
