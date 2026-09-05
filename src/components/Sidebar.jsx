import { NavLink } from "react-router-dom";
import { menuItems } from "../data/menu";

function Sidebar() {
  return (
    <div className="w-64 h-screen bg-[#2b2440] text-white flex flex-col p-4 gap-4">
      <h2>🏢 ระบบจัดการหอพัก</h2>
      <nav className="flex flex-col gap-2">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg ${
                isActive ? "bg-[#4a3f6b]" : ""
              }`
            }
          >
            {item.icon} {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default Sidebar;
