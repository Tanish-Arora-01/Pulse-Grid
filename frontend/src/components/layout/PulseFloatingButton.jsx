import React, { useState } from "react";
import { Activity, X, CheckCircle } from "lucide-react";
import SpotlightCard from "../ui/SpotlightCard";

const PulseFloatingButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleLogSignal = (intensity) => {
    setSubmitted(true);

    setTimeout(() => {
      setSubmitted(false);
      setIsOpen(false);
    }, 1500);
  };

  const levels = [
    {
      id: "flow",
      label: "Flow State",
      color: "from-emerald-500 to-emerald-400",
    },
    { id: "moderate", label: "Moderate", color: "from-blue-500 to-blue-400" },
    { id: "high", label: "High Load", color: "from-orange-500 to-orange-400" },
    { id: "burnout", label: "Overwhelmed", color: "from-rose-500 to-red-500" },
  ];

  return (
    <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-3">
      {/* EXPANDED MENU */}
      {isOpen && !submitted && (
        <SpotlightCard className="w-64 p-4 mb-2 animate-in slide-in-from-bottom-5 fade-in duration-200">
          <p className="text-sm font-medium text-white/70 mb-3 ml-1">
            How is your cognitive load?
          </p>

          <div className="space-y-2">
            {levels.map((level) => (
              <button
                key={level.id}
                onClick={() => handleLogSignal(level.id)}
                className={`w-full text-left px-4 py-3 rounded-xl text-white text-sm font-medium
                  bg-gradient-to-r ${level.color}
                  transition-all duration-200
                  hover:scale-[1.035] active:scale-[0.97]
                  shadow-lg hover:shadow-xl`}
              >
                {level.label}
              </button>
            ))}
          </div>
        </SpotlightCard>
      )}

      {/* SUCCESS */}
      {submitted && (
        <SpotlightCard className="px-6 py-3 rounded-full flex items-center gap-2 animate-in zoom-in fade-in">
          <CheckCircle size={18} className="text-emerald-400" />
          <span className="font-medium text-white">Signal Logged</span>
        </SpotlightCard>
      )}

      {/* MAIN FLOATING BUTTON */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          h-16 w-16 rounded-full flex items-center justify-center
          transition-all duration-300
          relative

          ${
            isOpen
              ? "bg-neutral-800 rotate-90"
              : "bg-gradient-to-tr from-indigo-600 to-violet-600 hover:scale-110"
          }

          shadow-[0_10px_30px_rgba(79,70,229,0.35)]
          hover:shadow-[0_20px_60px_rgba(79,70,229,0.55)]
        `}
      >
        {/* glow aura */}
        <div className="absolute inset-0 rounded-full blur-xl opacity-40 bg-indigo-600"></div>

        {isOpen ? (
          <X size={28} className="text-white/80 relative z-10" />
        ) : (
          <Activity size={28} className="text-white relative z-10" />
        )}
      </button>
    </div>
  );
};

export default PulseFloatingButton;
