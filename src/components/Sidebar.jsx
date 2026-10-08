import { Fragment, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { menuItems, systemGroupLabel } from "../data/menu";
import { supabase } from "../lib/supabaseClient";
import { roleLabels, useCurrentUser } from "../lib/useCurrentUser";
import { useNotifications } from "../lib/useNotifications";

const ADMIN_DASHBOARD = "/admin/dashboard";
const USER_DASHBOARD = "/user/dashboard";

function Sidebar({ open = false, onClose = () => {} }) {
  const navigate = useNavigate();
  const me = useCurrentUser();
  const role = me?.role;
  // จำนวนแจ้งเตือนที่ยังไม่อ่าน แสดงเป็นป้ายแดงที่เมนู "แจ้งเตือน"
  const { unreadCount } = useNotifications();
  const [loggingOut, setLoggingOut] = useState(false);

  // เมนูภาพรวมพาไปหน้าที่ตรงกับสิทธิ์
  const resolvePath = (item) =>
    item.path === ADMIN_DASHBOARD && role === "user" ? USER_DASHBOARD : item.path;

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    navigate("/");
  };

  const visibleItems = menuItems.filter((item) => !item.adminOnly || role === "admin");

  const displayName = me?.tenant?.name || roleLabels[role] || "";
  const initial = role === "user" && me?.tenant?.name ? me.tenant.name.trim().charAt(0) : "AD";

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-64 h-screen shrink-0 bg-linear-to-b from-primary-dark to-primary-deep text-white flex flex-col transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-3 px-5 pt-6 pb-5">
        <span className="grid place-items-center w-11 h-11 rounded-2xl bg-white/12 ring-1 ring-white/15">
          <Icon name="building" className="w-6 h-6" />
        </span>
        <div className="leading-tight min-w-0">
          <div className="font-semibold whitespace-nowrap">ระบบจัดการหอพัก</div>
          <div className="text-[11px] text-white/60 truncate">Apartment Management</div>
        </div>
        <button
          onClick={onClose}
          aria-label="ปิดเมนู"
          className="ml-auto p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 lg:hidden"
        >
          <Icon name="close" className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1" aria-label="เมนูหลัก">
        {visibleItems.map((item, index) => (
          <Fragment key={item.path}>
            {item.group === "system" && visibleItems[index - 1]?.group !== "system" && (
              <div className="mt-4 mb-1 px-3.5 pt-3 border-t border-white/10 text-[11px] font-medium tracking-wide text-white/45">
                {systemGroupLabel}
              </div>
            )}
            <NavLink
              to={resolvePath(item)}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[15px] transition-colors ${
                  isActive
                    ? "bg-white/14 text-white font-medium"
                    : "text-white/70 hover:bg-white/8 hover:text-white"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-mist" />}
                  <Icon name={item.icon} className="w-5 h-5" />
                  {item.label}
                  {item.path === "/notifications" && unreadCount > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-[11px] font-bold min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          </Fragment>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 rounded-xl bg-white/8 px-3 py-2.5">
          <span className="grid place-items-center w-9 h-9 rounded-full bg-mist text-primary-dark text-sm font-semibold shrink-0">
            {initial}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-sm font-medium truncate">{displayName || "กำลังโหลด..."}</div>
            <div className="text-[11px] text-white/60 truncate">{me?.tenant ? `ห้อง ${me.tenant.room}` : me?.username || ""}</div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="ออกจากระบบ"
            aria-label="ออกจากระบบ"
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-50"
          >
            <Icon name="logout" className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
