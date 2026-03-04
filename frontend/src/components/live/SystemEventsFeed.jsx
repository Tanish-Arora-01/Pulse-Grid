import React from "react";
import {
  Zap,
  AlertTriangle,
  Info,
  Brain,
  Target,
  CheckCircle2,
} from "lucide-react";

const getEventConfig = (type) => {
  switch (type) {
    case "flow":
      return {
        icon: Zap,
        color: "text-emerald-400",
        bg: "bg-emerald-400/10",
        border: "border-emerald-400/20",
      };
    case "warning":
      return {
        icon: AlertTriangle,
        color: "text-amber-400",
        bg: "bg-amber-400/10",
        border: "border-amber-400/20",
      };
    case "critical":
      return {
        icon: Brain,
        color: "text-rose-400",
        bg: "bg-rose-400/10",
        border: "border-rose-400/20",
      };
    case "milestone":
      return {
        icon: Target,
        color: "text-indigo-400",
        bg: "bg-indigo-400/10",
        border: "border-indigo-400/20",
      };
    case "success":
      return {
        icon: CheckCircle2,
        color: "text-emerald-400",
        bg: "bg-emerald-400/10",
        border: "border-emerald-400/20",
      };
    default:
      return {
        icon: Info,
        color: "text-blue-400",
        bg: "bg-blue-400/10",
        border: "border-blue-400/20",
      };
  }
};

const SystemEventsFeed = ({ events }) => {
  return (
    <div className="h-full w-full overflow-y-auto p-4 space-y-3 minimal-scrollbar">
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] rounded-xl border-2 border-dashed border-white/5 bg-white/[0.01]">
          <div className="p-4 rounded-full bg-indigo-500/5 mb-4 animate-pulse">
            <Brain size={28} className="text-indigo-400/30" />
          </div>
          <p className="text-sm font-semibold text-white/40">
            Awaiting Telemetry
          </p>
        </div>
      ) : (
        events.map((event) => {
          const config = getEventConfig(event.type);
          const Icon = config.icon;

          return (
            <div
              key={event.id}
              className={`flex gap-3 items-start p-3 rounded-xl border ${config.border} bg-white/[0.02] hover:bg-white/[0.04] transition`}
            >
              <div
                className={`mt-0.5 p-1.5 rounded-lg ${config.bg} ${config.color} shrink-0`}
              >
                <Icon size={14} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/90 leading-snug">
                  {event.message}
                </p>

                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[10px] text-white/40 font-mono">
                    {event.time}
                  </p>

                  {event.metric && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm ${config.bg} ${config.color}`}
                    >
                      {event.metric}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export default SystemEventsFeed;
