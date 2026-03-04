import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  MoreHorizontal,
  Activity,
  Server,
  Zap,
  Play,
  Pause,
  Square,
  ShieldCheck,
} from "lucide-react";
import SpotlightCard from "../components/ui/SpotlightCard";

import CognitiveGauge from "../components/live/CognitiveGauge";
import SystemEventsFeed from "../components/live/SystemEventsFeed";
import FatigueReportButton from "../components/feedback/FatigueReportButton";

// --- Sub-Components ---
const StatusBadge = ({ sessionStatus }) => (
  <div className="flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-white/5 w-fit border border-white/10">
    <span className="relative flex h-2.5 w-2.5">
      {sessionStatus === "active" && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
      )}
      <span
        className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
          sessionStatus === "active"
            ? "bg-emerald-500"
            : sessionStatus === "paused"
              ? "bg-amber-500"
              : "bg-white/20"
        }`}
      ></span>
    </span>
    <p className="text-xs text-white/70 font-medium tracking-wide uppercase">
      {sessionStatus === "active"
        ? "Recording Telemetry"
        : sessionStatus === "paused"
          ? "Session Paused"
          : "System Standby"}
    </p>
  </div>
);

const MetricCard = ({
  label,
  value,
  subtext,
  icon: Icon,
  colorClass = "text-white",
}) => (
  <SpotlightCard className="p-6 flex flex-col justify-between group hover:border-white/20 transition-colors">
    <div className="flex justify-between items-start">
      <p className="text-sm text-white/50 font-medium uppercase tracking-wider">
        {label}
      </p>
      {Icon && (
        <Icon
          size={18}
          className="text-white/20 group-hover:text-white/40 transition-colors"
        />
      )}
    </div>
    <div>
      <p className={`text-2xl font-bold mt-2 font-mono truncate ${colorClass}`}>
        {value}
      </p>
      {subtext && (
        <p className="text-xs text-white/40 mt-1 truncate">{subtext}</p>
      )}
    </div>
  </SpotlightCard>
);

// --- ELECTRON LIVE IPC HOOK ---
const useLiveTelemetry = (sessionStatus) => {
  const [activeApp, setActiveApp] = useState("Idle");
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [liveWPM, setLiveWPM] = useState(0);

  useEffect(() => {
    if (sessionStatus !== "active") return;
    const timerInterval = setInterval(
      () => setSessionSeconds((prev) => prev + 1),
      1000,
    );
    return () => clearInterval(timerInterval);
  }, [sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "active") {
      setActiveApp(sessionStatus === "paused" ? "Paused" : "Idle");
      setLiveWPM(0);
      return;
    }
    if (!window.fobitAPI) return;

    const pollInterval = setInterval(async () => {
      try {
        const metrics = await window.fobitAPI.getLiveMetrics();
        setActiveApp(metrics.currentApp);
        setLiveWPM(metrics.currentWPM);
      } catch (err) {}
    }, 1000);
    return () => clearInterval(pollInterval);
  }, [sessionStatus]);

  const formattedTime = useMemo(() => {
    const h = Math.floor(sessionSeconds / 3600)
      .toString()
      .padStart(2, "0");
    const m = Math.floor((sessionSeconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const s = (sessionSeconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  }, [sessionSeconds]);

  return {
    activeApp,
    formattedTime,
    liveWPM,
    sessionSeconds,
    setSessionSeconds,
  };
};

// --- Main Component ---
const LiveDashboard = () => {
  const [sessionStatus, setSessionStatus] = useState("idle");
  const [burnoutData, setBurnoutData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [events, setEvents] = useState([
    {
      id: Date.now(),
      time: new Date().toLocaleTimeString("en-US", { hour12: false }),
      type: "info",
      message: "HCI Sensors Online. Awaiting focus session.",
      metric: "System",
    },
  ]);

  const {
    activeApp,
    formattedTime,
    liveWPM,
    sessionSeconds,
    setSessionSeconds,
  } = useLiveTelemetry(sessionStatus);

  const addEvent = (msg, type = "info", metric = null) => {
    setEvents((prev) =>
      [
        {
          id: Date.now(),
          time: new Date().toLocaleTimeString("en-US", { hour12: false }),
          type,
          message: msg,
          metric,
        },
        ...prev,
      ].slice(0, 20),
    );
  };

  useEffect(() => {
    const syncSession = async () => {
      if (!window.fobitAPI) return;
      const status = await window.fobitAPI.getSessionStatus();
      if (status.isActive) {
        setSessionStatus("active");
        setSessionSeconds(Math.floor((Date.now() - status.startTime) / 1000));
        addEvent("Resumed active tracking from backend", "info");
      }
    };
    syncSession();
  }, []);

  useEffect(() => {
    if (!window.fobitAPI?.onSystemIdle) return;
    const handleIdle = () => {
      setSessionStatus((prevStatus) => {
        if (prevStatus === "active") {
          window.fobitAPI.pauseSession();
          setTimeout(
            () =>
              addEvent(
                "System idle detected. Auto-pausing session.",
                "warning",
                "AFK",
              ),
            0,
          );
          return "paused";
        }
        return prevStatus;
      });
    };
    window.fobitAPI.onSystemIdle(handleIdle);
    return () => window.fobitAPI.removeSystemIdle();
  }, []);

  useEffect(() => {
    if (sessionStatus !== "active") return;

    // 🚨 CRITICAL: Use AbortController to cancel fetch on unmount/cleanup
    const abortController = new AbortController();

    const runAnalytics = async () => {
      if (!window.fobitAPI) {
        return;
      }

      setIsAnalyzing(true);
      const startTime = Date.now();

      try {
        // Add explicit timeout protection (10s max)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Prediction fetch timeout (10s)")),
            10000,
          ),
        );

        // Race between actual fetch and timeout
        const result = await Promise.race([
          window.fobitAPI.runAnalytics(),
          timeoutPromise,
        ]);

        // ✅ SUCCESS: Update burnout data
        setBurnoutData(result.error ? { error: result.error } : result);
      } catch (err) {
        // Set error state so UI knows prediction failed
        setBurnoutData({
          error: err.message || "Failed to fetch prediction",
          fallback: true, // Indicates we should show fallback UI
        });
      } finally {
        // 🚨 CRITICAL: Always set isAnalyzing=false, even on error/timeout
        setIsAnalyzing(false);
      }
    };

    // Run immediately on start
    runAnalytics();

    // Set up periodic refresh (every 60 seconds)
    const intervalId = setInterval(runAnalytics, 60000);

    // Cleanup: cancel interval and abort any in-flight requests
    return () => {
      clearInterval(intervalId);
      abortController.abort(); // Prevent state updates after unmount
    };
  }, [sessionStatus]);

  const appSwitchesRef = useRef([]);
  const flowStateRef = useRef(false);
  const trendRef = useRef("stable");
  const peakWpmRef = useRef(0);

  useEffect(() => {
    if (
      sessionStatus !== "active" ||
      activeApp === "Idle" ||
      activeApp === "Paused"
    )
      return;
    const now = Date.now();
    appSwitchesRef.current = appSwitchesRef.current.filter(
      (t) => now - t < 60000,
    );
    appSwitchesRef.current.push(now);

    if (appSwitchesRef.current.length >= 4) {
      addEvent("High context switching detected.", "warning", "Focus Lost");
      appSwitchesRef.current = [];
    }
  }, [activeApp, sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "active") return;
    if (liveWPM > 50 && !flowStateRef.current) {
      flowStateRef.current = true;
      addEvent(
        "High velocity typing detected. Entering Flow State.",
        "flow",
        "Flow",
      );
    } else if (liveWPM < 20 && flowStateRef.current) {
      flowStateRef.current = false;
    }
    if (liveWPM > 40 && liveWPM >= peakWpmRef.current + 5) {
      peakWpmRef.current = liveWPM;
      addEvent(
        "New session productivity peak reached!",
        "success",
        `${liveWPM} WPM`,
      );
    }
  }, [liveWPM, sessionStatus]);

  useEffect(() => {
    if (
      burnoutData &&
      burnoutData.trend &&
      burnoutData.trend !== trendRef.current
    ) {
      if (burnoutData.trend === "increasing") {
        addEvent(
          "Fatigue trajectory rising. Fine motor sluggishness detected.",
          "critical",
          "Trend: Up",
        );
      } else if (burnoutData.trend === "decreasing") {
        addEvent(
          "Recovery detected. Cognitive load is stabilizing.",
          "success",
          "Trend: Down",
        );
      }
      trendRef.current = burnoutData.trend;
    }
  }, [burnoutData]);

  const handleToggleSession = async () => {
    if (sessionStatus === "idle") {
      if (window.fobitAPI) await window.fobitAPI.startSession();
      setSessionStatus("active");
      setSessionSeconds(0);
      appSwitchesRef.current = [];
      flowStateRef.current = false;
      trendRef.current = "stable";
      peakWpmRef.current = 0;
      setEvents([
        {
          id: Date.now(),
          time: new Date().toLocaleTimeString("en-US", { hour12: false }),
          type: "success",
          message: "Focus Engine Engaged. Telemetry recording.",
          metric: "Start",
        },
      ]);
    } else {
      if (window.fobitAPI) await window.fobitAPI.endSession();
      addEvent(
        `Session Saved to Database. Final Time: ${formattedTime}`,
        "milestone",
        "Saved",
      );
      setSessionStatus("idle");
      setBurnoutData(null);
    }
  };

  const handlePauseSession = async () => {
    if (sessionStatus === "active") {
      if (window.fobitAPI) await window.fobitAPI.pauseSession();
      setSessionStatus("paused");
      addEvent(`Break Started. Time to recover.`, "info", "Paused");
    } else {
      setSessionStatus("active");
      addEvent("Resuming Focus Engine", "success", "Resume");
    }
  };

  // 🚨 NEW LOGIC: Check if we have valid burnout data to pass to the gauge
  const hasValidBurnoutData =
    burnoutData &&
    !burnoutData.error &&
    burnoutData.burnout_probability !== undefined;

  return (
    <div className="px-6 md:px-10 pt-25 pb-10 space-y-8 max-w-7xl mx-auto">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            Focus Dashboard
            {/* <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-normal tracking-normal border border-indigo-500/30">
              Zero-Cloud
            </span> */}
          </h2>
          <StatusBadge sessionStatus={sessionStatus} />
        </div>
        <div className="flex items-center gap-3">
          {sessionStatus !== "idle" && (
            <button
              onClick={handlePauseSession}
              className={`flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border transition-all ${sessionStatus === "paused" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"}`}
            >
              {sessionStatus === "paused" ? (
                <Play size={16} fill="currentColor" />
              ) : (
                <Pause size={16} fill="currentColor" />
              )}
              {sessionStatus === "paused" ? "Resume" : "Take Break"}
            </button>
          )}
          <button
            onClick={handleToggleSession}
            className={`flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg transition-all border ${sessionStatus !== "idle" ? "bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20" : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]"}`}
          >
            {sessionStatus !== "idle" ? (
              <>
                <Square size={16} fill="currentColor" /> End Session
              </>
            ) : (
              <>
                <Play size={16} fill="currentColor" /> Start Focus
              </>
            )}
          </button>
        </div>
      </div>

      <hr className="border-white/10" />

      {/* MAIN VISUALIZATION GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SpotlightCard className="lg:col-span-2 p-8 h-[400px] flex flex-col justify-center relative overflow-hidden">
          <CognitiveGauge
            score={hasValidBurnoutData ? burnoutData.burnout_probability : null}
            sessionStatus={sessionStatus}
          />
        </SpotlightCard>

        {/* FEED CARD */}
        <SpotlightCard className="p-0 h-[400px] flex flex-col overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-white/[0.02] shrink-0">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Server
                size={16}
                className={
                  sessionStatus === "active"
                    ? "text-emerald-400"
                    : "text-white/40"
                }
              />
              System Events
            </h3>
          </div>

          <div className="flex-1 min-h-0">
            <SystemEventsFeed events={events} />
          </div>
        </SpotlightCard>
      </div>

      {/* METRICS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          label="Session Time"
          value={formattedTime}
          colorClass={
            sessionStatus === "active" ? "text-white" : "text-white/40"
          }
          subtext="Time since start"
        />
        <MetricCard
          label="Current App"
          value={activeApp}
          icon={Activity}
          colorClass={
            sessionStatus === "active"
              ? "text-emerald-400"
              : "text-amber-400/50"
          }
          subtext="Active focus target"
        />
        <MetricCard
          label="Typing Velocity"
          value={`${liveWPM} WPM`}
          icon={Zap}
          colorClass={
            liveWPM > 60
              ? "text-amber-400"
              : sessionStatus === "active"
                ? "text-emerald-400"
                : "text-white/40"
          }
          subtext={`${activeApp} inputs`}
        />

        <SpotlightCard className="p-6 flex flex-col justify-between group hover:border-indigo-500/30 transition-colors border-indigo-500/10 bg-indigo-500/[0.02]">
          <div className="flex justify-between items-start">
            <p className="text-sm text-indigo-300/70 font-medium uppercase tracking-wider">
              Burnout Forecast
            </p>
            <ShieldCheck
              size={18}
              className={
                isAnalyzing
                  ? "text-indigo-400 animate-pulse"
                  : "text-indigo-400/50"
              }
            />
          </div>
          <div>
            <p
              className={`text-2xl font-bold mt-2 font-mono ${sessionStatus === "active" ? "text-indigo-400" : "text-indigo-400/40"}`}
            >
              {sessionStatus === "idle"
                ? "Standby"
                : sessionStatus === "paused"
                  ? "Paused"
                  : burnoutData
                    ? burnoutData.error
                      ? "Need more data"
                      : `${burnoutData.burnout_probability}%`
                    : "Awaiting Data"}
            </p>
            <p className="text-xs text-indigo-300/50 mt-1 capitalize truncate">
              {sessionStatus === "idle"
                ? "Start session to track"
                : burnoutData && !burnoutData.error
                  ? `Trend: ${burnoutData.trend}`
                  : "Continuous Analysis"}
            </p>
          </div>
        </SpotlightCard>
      </div>

      {/* Floating Fatigue Report Button - Only visible when session is active */}
      <FatigueReportButton
        isVisible={sessionStatus === "active"}
        onSuccess={async () => {
          addEvent(
            "Refreshing predictions with updated model...",
            "info",
            "Syncing",
          );

          try {
            // Refresh analytics after ML training completes
            const result = await window.fobitAPI.runAnalytics();

            console.log("✅ Analytics refresh complete:", result);

            // Update state with fresh data
            const formattedData = result.error
              ? { error: result.error }
              : result;
            setBurnoutData(formattedData);

            addEvent(
              result.error
                ? "ML training completed, but prediction still needs more data"
                : "✨ Fresh prediction generated from updated model!",
              result.error ? "warning" : "success",
              "ML Synced",
            );
          } catch (err) {
            addEvent(
              "Failed to refresh predictions: " + err.message,
              "critical",
              "Sync Failed",
            );
          }
        }}
      />
    </div>
  );
};

export default LiveDashboard;
