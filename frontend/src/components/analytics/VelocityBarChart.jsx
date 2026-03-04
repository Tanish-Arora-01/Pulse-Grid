import React from "react";

const VelocityBarChart = () => {
  const data = [45, 60, 75, 30, 85, 90, 40, 50, 65, 70, 80, 55, 95, 60];
  const max = Math.max(...data);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Workload Velocity
          </h3>
          <p className="text-sm text-white/60">
            Keystrokes & Activity (Last 14 Days)
          </p>
        </div>

        <select
          className="bg-white/5
          text-xs font-semibold
          text-white/70
          rounded-lg px-3 py-2
          border border-white/10
          outline-none transition"
        >
          <option>Last 14 Days</option>
          <option>Last 30 Days</option>
        </select>
      </div>

      {/* Chart */}
      <div className="flex items-end justify-between gap-2 h-48 w-full">
        {data.map((value, i) => (
          <div key={i} className="group relative flex-1 h-full flex items-end">
            {/* Tooltip */}
            <div
              className="absolute -top-10 left-1/2 -translate-x-1/2
              bg-neutral-900/90
              text-white text-xs py-1 px-2 rounded
              opacity-0 group-hover:opacity-100 transition
              whitespace-nowrap z-10"
            >
              Velocity: {value}
            </div>

            {/* Bar */}
            <div
              className={`w-full rounded-t-xl transition-all duration-300
                hover:scale-y-105
                ${
                  value > 80
                    ? "bg-gradient-to-t from-rose-500 to-rose-400"
                    : "bg-gradient-to-t from-indigo-500 to-indigo-400"
                }`}
              style={{ height: `${(value / max) * 100}%` }}
            />
          </div>
        ))}
      </div>

      {/* Axis */}
      <div className="flex justify-between mt-4 text-xs text-white/50 font-medium uppercase pt-4">
        <span>2 Weeks Ago</span>
        <span>Today</span>
      </div>
    </div>
  );
};

export default VelocityBarChart;
