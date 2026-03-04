import React from "react";

const WorkPatternHeatmap = () => {
  const days = Array.from({ length: 28 }, () => Math.floor(Math.random() * 5));

  const getColor = (level) => {
    switch (level) {
      case 1:
        return "bg-emerald-400/70";
      case 2:
        return "bg-indigo-400/70";
      case 3:
        return "bg-amber-400/80";
      case 4:
        return "bg-rose-500 shadow-lg shadow-rose-500/20";
      default:
        return "bg-white/10";
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white">
          Cognitive Load Heatmap
        </h3>
        <p className="text-sm text-white/60 font-medium">
          Visualizing stress consistency
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-3">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div
            key={day}
            className="text-center text-xs font-semibold text-white/50 uppercase mb-2"
          >
            {day}
          </div>
        ))}

        {days.map((level, i) => (
          <div
            key={i}
            className={`aspect-square rounded-xl ${getColor(level)}
              transition-all duration-200
              hover:scale-110
              cursor-pointer`}
            title={`Day ${i + 1}: Level ${level}`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-4 mt-6 text-xs text-white/50 font-medium">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-400/70" />
          Low
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          High
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500" />
          Critical
        </div>
      </div>
    </div>
  );
};

export default WorkPatternHeatmap;
