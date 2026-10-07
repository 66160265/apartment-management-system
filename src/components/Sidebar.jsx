import { NavLink } from "react-router-dom";
import { menuItems } from "../data/menu";

function Sidebar() {
  return (
    <aside className="w-64 h-screen sticky top-0 shrink-0 bg-linear-to-b from-primary-dark to-primary-deep text-white flex flex-col p-5 gap-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold pb-5 border-b border-white/15">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-white/10">🏢</span>
        ระบบจัดการหอพัก
      </h2>
      <nav className="flex flex-col gap-1.5">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
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
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
