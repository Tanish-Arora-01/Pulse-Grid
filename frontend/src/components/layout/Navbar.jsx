import React, { useRef, useEffect, useState } from "react";
import {
  LayoutDashboard,
  BrainCircuit,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import avatar1 from "../../assets/avatar1.jpg";
import avatar2 from "../../assets/avatar2.jpg";

// Map avatar paths to imported images
const avatarMap = {
  "/avatar1.jpg": avatar1,
  "/avatar2.jpg": avatar2,
};

const getAvatarImage = (avatarPath) => {
  return avatarMap[avatarPath] || avatar1; // Fallback to avatar1
};

const Navbar = ({
  activePage,
  setActivePage,
  activeProfile,
  onLogout,
  onSidebarToggle,
}) => {
  const navItems = [
    {
      id: "live",
      label: "Live Dashboard",
      icon: <LayoutDashboard size={20} />,
    },
    { id: "insights", label: "ML Insights", icon: <BrainCircuit size={20} /> },
    { id: "settings", label: "Settings", icon: <Settings size={20} /> },
  ];

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [indicatorStyle, setIndicatorStyle] = useState({ top: 0, height: 0 });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // show labels only after sidebar expansion animation finishes
  const [showLabels, setShowLabels] = useState(false);
  const [showProfileInfo, setShowProfileInfo] = useState(false);

  useEffect(() => {
    let timer;
    if (isSidebarOpen) {
      // wait for width transition (300ms) before showing text
      timer = setTimeout(() => setShowLabels(true), 300);
      // also show profile info after same delay
      setShowProfileInfo(true);
    } else {
      // hide immediately when collapsing
      setShowLabels(false);
      setShowProfileInfo(false);
    }
    return () => clearTimeout(timer);
  }, [isSidebarOpen]);

  // Notify parent when sidebar opens/closes
  useEffect(() => {
    onSidebarToggle?.(isSidebarOpen);
  }, [isSidebarOpen, onSidebarToggle]);

  // Handle window resize for responsive behavior
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setIsSidebarOpen(false); // Auto-collapse on mobile
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Smooth Sliding Tab Indicator
  useEffect(() => {
    let activeIndex = navItems.findIndex((item) => item.id === activePage);

    if (
      activeIndex === -1 &&
      (activePage === "analytics" || activePage === "forecast")
    ) {
      activeIndex = navItems.findIndex((item) => item.id === "insights");
    }

    const activeButton = document.querySelector(
      `button[data-nav-id="${navItems[activeIndex]?.id}"]`,
    );
    if (activeButton) {
      setIndicatorStyle({
        top: activeButton.offsetTop,
        height: activeButton.offsetHeight,
      });
    }
  }, [activePage]);

  return (
    <>
      {/* --- SIDEBAR NAVIGATION --- */}
      <aside
        className={`
          fixed left-0 top-12 bottom-0 z-40
          bg-[#09090b]/80 backdrop-blur-xl border-r border-white/5
          will-change-[width] transition-[width] duration-300 ease-out
          ${isSidebarOpen ? "w-64" : "w-20"}
        `}
      >
        {/* Navigation Items */}
        <nav className="relative flex flex-col gap-2 p-3 h-full">
          {/* Animated Background Indicator */}
          <div
            className="absolute left-3 rounded-lg bg-white/10 border border-white/5 transition-[top,height] duration-300 ease-out will-change-auto"
            style={{
              top: indicatorStyle.top,
              height: indicatorStyle.height,
              width: isSidebarOpen ? "calc(100% - 24px)" : "calc(100% - 24px)",
            }}
          />

          {navItems.map((item) => {
            const isActive =
              activePage === item.id ||
              (item.id === "insights" &&
                (activePage === "analytics" || activePage === "forecast"));

            return (
              <button
                key={item.id}
                data-nav-id={item.id}
                onClick={() => setActivePage(item.id)}
                className={`
                  relative flex items-center gap-4 px-4 py-3 rounded-lg
                  transition-[color] duration-200 flex-shrink-0
                  ${isActive ? "text-white" : "text-white/50 hover:text-white/80"}
                `}
                title={item.label}
              >
                <span
                  className={`flex-shrink-0 transition-[color] duration-200 ${
                    isActive ? "text-indigo-400" : ""
                  }`}
                >
                  {item.icon}
                </span>
                {showLabels && (
                  <span className="text-sm font-medium tracking-wide animate-in fade-in duration-200">
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Profile Section */}
        <div
          className={`
            absolute bottom-20 left-3 right-3 flex items-center rounded-lg
            transition-[gap,padding] duration-300 ease-out
            will-change-auto
            ${
              isSidebarOpen
                ? "gap-3 px-3 py-2 bg-white/5 border border-white/10"
                : "gap-0 px-0 py-0 justify-center bg-transparent border-0"
            }
          `}
        >
          {/* Profile Avatar */}
          <button
            onClick={onLogout}
            title="Switch Profile"
            className="relative w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-300 hover:bg-indigo-500/20 transition-[background-color,border-color] duration-200 flex-shrink-0 overflow-hidden group"
          >
            {activeProfile &&
            activeProfile.avatar_color &&
            (activeProfile.avatar_color.includes(".jpg") ||
              activeProfile.avatar_color.includes(".png")) ? (
              <img
                src={getAvatarImage(activeProfile.avatar_color)}
                alt="Profile"
                className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
              />
            ) : (
              <span className="font-bold text-sm bg-gradient-to-br from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                {activeProfile
                  ? activeProfile.name.charAt(0).toUpperCase()
                  : "G"}
              </span>
            )}
          </button>

          {/* Profile Info */}
          {showProfileInfo && (
            <div className="flex-1 min-w-0 animate-in fade-in duration-200">
              <p className="text-xs font-semibold text-white truncate">
                {activeProfile ? activeProfile.name : "Guest"}
              </p>
              <button
                onClick={onLogout}
                className="text-xs text-indigo-400/80 hover:text-indigo-300 transition-[color] duration-200 flex items-center gap-1"
                title="Switch Profile"
              >
                <LogOut size={12} />
                Switch
              </button>
            </div>
          )}
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="
            absolute bottom-6 left-1/2 -translate-x-1/2
            flex items-center justify-center w-10 h-10 rounded-lg
            text-white/50 hover:text-white hover:bg-white/10
            transition-[color,background-color] duration-200
          "
          title={isSidebarOpen ? "Collapse" : "Expand"}
        >
          {isSidebarOpen ? (
            <ChevronLeft size={20} />
          ) : (
            <ChevronRight size={20} />
          )}
        </button>
      </aside>
    </>
  );
};

export default Navbar;
