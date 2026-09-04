import './App.css'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import InvoicesPage from './pages/InvoicesPage.jsx'
import RepairsPage from './pages/RepairsPage.jsx'
import RoomsPage from './pages/RoomsPage.jsx'
import TenantsPage from './pages/TenantsPage.jsx'

function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/tenants" element={<TenantsPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/repairs" element={<RepairsPage />} />
        </Route>
      </Routes>
    </>
  )
}

export default App
