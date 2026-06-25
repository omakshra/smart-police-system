import { NavLink } from "react-router-dom";
import { useState } from "react";
import { FaBars } from "react-icons/fa";

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(true);
  const toggleSidebar = () => setIsOpen(!isOpen);

  const linkClass = "block py-2 px-4 rounded hover:bg-gray-700 transition-colors";
  const activeClass = "bg-gray-700";

  return (
    <div className="flex">
      {/* Sidebar */}
      <aside
        className={`bg-gray-800 text-white flex flex-col p-4 min-h-screen transition-width duration-300 ${
          isOpen ? "w-64" : "w-16"
        }`}
      >
        <div className="flex items-center justify-between mb-6">
          {isOpen && <h2 className="text-2xl text-white font-bold">Crime Dashboard</h2>}
          <button onClick={toggleSidebar} className="text-white">
            <FaBars />
          </button>
        </div>
        <nav className="flex flex-col gap-2">
          <NavLink
            to="/"
            className={({ isActive }) => `${linkClass} ${isActive ? activeClass : ""}`}
          >
            {isOpen ? "Dashboard" : "D"}
          </NavLink>
          <NavLink
            to="/hotspot"
            className={({ isActive }) => `${linkClass} ${isActive ? activeClass : ""}`}
          >
            {isOpen ? "Hotspot" : "H"}
          </NavLink>
          <NavLink
            to="/trends"
            className={({ isActive }) => `${linkClass} ${isActive ? activeClass : ""}`}
          >
            {isOpen ? "Trends" : "T"}
          </NavLink>
          <NavLink
            to="/heatmap"
            className={({ isActive }) => `${linkClass} ${isActive ? activeClass : ""}`}
          >
            {isOpen ? "Heatmap" : "M"}
          </NavLink>
        </nav>
      </aside>
    </div>
  );
};

export default Sidebar;
