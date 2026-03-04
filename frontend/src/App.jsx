import React, { useState, useEffect } from "react";

// --- BACKGROUND ---
import DarkVielBackground from "./Background/DarkVielBackground";

// --- LAYOUT COMPONENTS ---
import CustomTitlebar from "./components/layout/CustomTitlebar";
import Navbar from "./components/layout/Navbar";
import ProfileSelector from "./pages/ProfileSelector"; // 🌟 NEW: The Gatekeeper

// --- PAGE VIEWS ---
import LiveDashboard from "./pages/LiveDashboard";
import InsightsView from "./pages/InsightsView";
import SettingsView from "./pages/SettingsView";

const App = () => {
  // --- AUTH / PROFILE STATE ---
  const [activeProfile, setActiveProfile] = useState(null);
  const [isChecking, setIsChecking] = useState(true);

  // --- NAVIGATION STATE ---
  const [activePage, setActivePage] = useState("live");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 1. Check if the backend already has an active profile on boot
  useEffect(() => {
    const checkProfile = async () => {
      if (window.fobitAPI) {
        const profile = await window.fobitAPI.getActiveProfile();
        setActiveProfile(profile);
      }
      setIsChecking(false);
    };
    checkProfile();
  }, []);

  // 2. Show a tiny loader while checking the backend (prevents UI flashing)
  if (isChecking) {
    return (
      <div className="h-screen w-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
      </div>
    );
  }

  // 3. THE GATEKEEPER: render full UI always, with selector overlaid if no profile
  return (
    <>
      <CustomTitlebar />
      <Navbar
        activePage={activePage}
        setActivePage={setActivePage}
        activeProfile={activeProfile}
        onLogout={async () => {
          if (window.fobitAPI) await window.fobitAPI.logoutProfile();
          setActiveProfile(null);
        }}
        onSidebarToggle={setIsSidebarOpen}
      />
      <DarkVielBackground>
        <div
          className="min-h-screen font-sans text-slate-100 selection:bg-indigo-500/30 transition-[margin-left] duration-300 ease-out overflow-x-hidden will-change-[margin-left]"
          style={{
            marginLeft: isSidebarOpen ? "260px" : "80px",
            marginTop: "3px",
          }}
        >
          {/* MAIN CONTENT AREA */}
          <main className="w-full min-h-screen relative z-10">
            {activeProfile ? (
              <>
                {activePage === "live" && (
                  <LiveDashboard
                    key={`live-${activeProfile.id}`}
                    setActivePage={setActivePage}
                  />
                )}

                {(activePage === "insights" ||
                  activePage === "forecast" ||
                  activePage === "analytics") && (
                  <InsightsView key={`insights-${activeProfile.id}`} />
                )}

                {activePage === "settings" && (
                  <SettingsView key={`settings-${activeProfile.id}`} />
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-[80vh]">
                <p className="text-white/30 text-lg">
                  Select a profile to begin
                </p>
              </div>
            )}
          </main>
        </div>
      </DarkVielBackground>

      {/* overlay profile selector when no profile is chosen */}
      {!activeProfile && (
        <div className="absolute inset-0 z-50 flex items-center justify-center">
          <ProfileSelector onProfileSelected={setActiveProfile} />
        </div>
      )}
    </>
  );
};

export default App;
