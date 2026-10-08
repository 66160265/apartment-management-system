import { NavLink } from "react-router-dom";
import { menuItems } from "../data/menu";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useNotifications } from "../lib/useNotifications";

const USER_DASHBOARD = "/user/dashboard";

function Sidebar() {
  // ใช้ role จากข้อมูลผู้ใช้ที่แชร์กัน เพื่อให้เมนู Dashboard ไปหน้าที่ถูกต้อง
  const role = useCurrentUser()?.role;
  // จำนวนแจ้งเตือนที่ยังไม่อ่าน แสดงเป็นป้ายแดงที่เมนู "แจ้งเตือน"
  const { unreadCount } = useNotifications();

  const resolvePath = (item) =>
    item.label === "Dashboard" && role === "user" ? USER_DASHBOARD : item.path;

  return (
    <aside className="w-64 h-screen sticky top-0 shrink-0 bg-linear-to-b from-primary-dark to-primary-deep text-white flex flex-col p-5 gap-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold pb-5 border-b border-white/15">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-white/10">🏢</span>
        ระบบจัดการหอพัก
      </h2>
      <nav className="flex flex-col gap-1.5">
        {menuItems.filter((item) => !item.adminOnly || role === "admin").map((item) => (
          <NavLink
            key={item.label}
            to={resolvePath(item)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                isActive
                  ? "bg-secondary/30 text-white font-medium shadow-[inset_3px_0_0_var(--color-mist)]"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <span className="w-6 text-center">{item.icon}</span>
            {item.label}
            {item.path === "/notifications" && unreadCount > 0 && (
              <span className="ml-auto bg-red-500 text-white text-[11px] font-bold min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
