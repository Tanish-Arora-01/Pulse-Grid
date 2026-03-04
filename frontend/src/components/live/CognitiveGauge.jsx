import React from "react";
import { Zap, Loader2, Power, PauseCircle } from "lucide-react";

const CognitiveGauge = ({ score, sessionStatus = "idle" }) => {
  // --- LOGICAL STATES ---
  const isIdle = sessionStatus === "idle";
  const isPaused = sessionStatus === "paused";
  const hasScore = score !== null && score !== undefined;

  // It is ONLY calculating if the session is ACTIVE but we don't have a score yet
  const isCalculating = sessionStatus === "active" && !hasScore;

  // If idle or calculating, default to 0. Otherwise keep the score.
  const displayScore =
    isIdle || isCalculating || (isPaused && !hasScore)
      ? 0
      : Math.min(100, Math.max(0, score || 0));

  // --- DYNAMIC COLORS ---
  const getStatusColor = () => {
    if (isIdle) return "text-white/20 stroke-white/10";
    if (isCalculating) return "text-indigo-400 stroke-indigo-400";
    if (isPaused && !hasScore) return "text-amber-400/50 stroke-amber-400/30";

    // Active or Paused WITH a score
    if (displayScore < 40) return "text-emerald-400 stroke-emerald-400";
    if (displayScore < 75) return "text-amber-400 stroke-amber-400";
    return "text-rose-400 stroke-rose-400";
  };

  const colorClass = getStatusColor();
  const textColor = colorClass.split(" ")[0];
  const strokeColor = colorClass.split(" ")[1];

  // --- SVG MATH ---
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (circumference * displayScore) / 100;

  return (
    <div className="relative h-full flex flex-col justify-between">
      {/* Ambient icon */}
      <div className="absolute top-0 right-0 p-6 opacity-[0.05] pointer-events-none">
        <Zap size={120} className="text-indigo-400" />
      </div>

      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">
          Burnout Risk Forecast
        </h3>
        <p className="text-sm text-white/60">Updates every 60 seconds</p>
      </div>

      {/* Gauge */}
      <div className="flex flex-col items-center justify-center py-6">
        <div className="relative w-64 h-64">
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full transform -rotate-90"
          >
            {/* Track */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="currentColor"
              className="text-white/10"
              strokeWidth="8"
            />

            {/* Progress Ring */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className={`transition-all duration-1000 ease-out ${strokeColor} ${isPaused ? "opacity-50" : "opacity-100"}`}
            />
          </svg>

          {/* Center Display Logic */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {isIdle ? (
              <div className="flex flex-col items-center animate-in zoom-in-95 duration-300">
                <Power size={32} className="text-white/20 mb-2" />
                <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">
                  Standby
                </span>
              </div>
            ) : isCalculating ? (
              <div className="flex flex-col items-center gap-3 animate-in fade-in duration-500">
                <Loader2 size={36} className={`animate-spin ${textColor}`} />
                <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest mt-1 animate-pulse">
                  Calculating
                </span>
              </div>
            ) : isPaused && !hasScore ? (
              <div className="flex flex-col items-center animate-in zoom-in-95 duration-300">
                <PauseCircle size={32} className="text-amber-400/50 mb-2" />
                <span className="text-[10px] text-amber-400/50 font-bold uppercase tracking-widest mt-1">
                  Paused
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center animate-in zoom-in-95 duration-300">
                <span
                  className={`text-6xl font-bold tracking-tight ${textColor} ${isPaused ? "opacity-50" : ""}`}
                >
                  {displayScore}
                </span>
                <span
                  className={`text-xs font-bold uppercase tracking-widest mt-2 ${isPaused ? "text-amber-400/80" : "text-white/50"}`}
                >
                  {isPaused ? "Paused" : "Risk Level"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Status Text */}
      <div className="text-center">
        <p
          className={`text-lg font-semibold ${textColor} ${isPaused ? "opacity-70" : ""}`}
        >
          {isIdle
            ? "System Ready"
            : isCalculating
              ? "Analyzing Telemetry..."
              : isPaused
                ? "Focus Engine Paused"
                : displayScore < 40
                  ? "Healthy Flow State"
                  : displayScore < 75
                    ? "Elevated Fatigue Risk"
                    : "Critical Burnout Imminent"}
        </p>
      </div>
    </div>
  );
};

export default CognitiveGauge;
