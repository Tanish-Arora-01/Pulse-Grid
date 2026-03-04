import React, { useState } from "react";
import Sidebar from "./Sidebar";
import PulseFloatingButton from "./PulseFloatingButton";

// Placeholder Components
const LiveView = () => (
  <div className="p-10 text-2xl font-semibold text-white/80">
    Live Monitor View (Redis Stream)
  </div>
);

const AnalyticsView = () => (
  <div className="p-10 text-2xl font-semibold text-white/80">
    Analytics View (Cassandra History)
  </div>
);

const ForecastView = () => (
  <div className="p-10 text-2xl font-semibold text-white/80">
    Forecast View (Python ML)
  </div>
);

const AppLayout = () => {
  const [activePage, setActivePage] = useState("live");

  return (
    <div className="min-h-screen font-sans text-white">
      {/* SIDEBAR */}
      <Sidebar activePage={activePage} setActivePage={setActivePage} />

      {/* MAIN */}
      <main className="md:ml-72 min-h-screen transition-all">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-30 bg-neutral-950/80 border-b border-white/10 p-4">
          <span className="font-bold text-indigo-400">FoBit</span>
        </header>

        {/* PAGE CONTENT — no glass, no blur */}
        <div className="max-w-7xl mx-auto min-h-screen">
          {activePage === "live" && <LiveView />}
          {activePage === "analytics" && <AnalyticsView />}
          {activePage === "forecast" && <ForecastView />}
        </div>
      </main>

      {/* FLOATING */}
      <PulseFloatingButton />
    </div>
  );
};

export default AppLayout;
