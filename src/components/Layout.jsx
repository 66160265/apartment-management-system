import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
function Layout(){
return (
    <div className="flex min-h-screen bg-sand">
        <Sidebar />
        <main className="flex-1 min-w-0">
            <Outlet />
        </main>
    </div>
)
}

export default Layout;
