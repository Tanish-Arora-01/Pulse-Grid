import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    // 1. Strictly filter out any null/undefined values Recharts tries to pass
    const validData = payload.filter((p) => typeof p.value === "number");

    if (validData.length === 0) return null;

    // 2. If we are exactly on the stitch point (both exist), prioritize "Recorded"
    const activeItem =
      validData.find((p) => p.dataKey === "recorded") || validData[0];
    const isPrediction = activeItem.dataKey === "prediction";

    return (
      <div className="bg-[#09090b]/90 backdrop-blur-md border border-white/10 p-4 rounded-xl shadow-2xl">
        <p className="text-white/60 text-xs font-medium mb-1">{label}</p>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full animate-pulse ${isPrediction ? "bg-violet-500" : "bg-emerald-500"}`}
          />
          <p className="text-white font-bold text-lg">
            {activeItem.value}
            <span className="text-xs text-white/40 ml-2 font-normal uppercase tracking-wider">
              {isPrediction ? "Predicted Risk" : "Recorded Risk"}
            </span>
          </p>
        </div>
      </div>
    );
  }
  return null;
};

const RiskTrendChart = ({ data }) => {
  // Safe default if data is missing
  if (!data || data.length === 0)
    return <div className="text-white/20">No data available</div>;

  return (
    <div className="w-full h-full min-h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{
            top: 20,
            right: 0,
            left: -20, // Hides the Y-axis gap
            bottom: 0,
          }}
        >
          <defs>
            {/* Gradients for both Recorded and Prediction Areas */}
            <linearGradient id="colorRecorded" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorPrediction" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Subtle Horizontal Grid Lines */}
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="rgba(255,255,255,0.05)"
          />

          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 12 }}
            tickMargin={10}
            // Optional: If 'day' is already formatted (like "Mon", "Tue"), you might not need the "Day " prefix.
            // tickFormatter={(value) => `Day ${value}`}
          />

          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 12 }}
            domain={[0, 100]} // Fix scale 0-100
          />

          {/* Attach our smart custom tooltip */}
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 2 }}
          />

          {/* 🚨 FIX: Split into two separate Areas for Recorded and Prediction */}
          <Area
            type="monotone"
            dataKey="recorded"
            stroke="#10b981" // Emerald
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorRecorded)"
            activeDot={{ r: 6, strokeWidth: 0, fill: "white" }}
          />

          <Area
            type="monotone"
            dataKey="prediction"
            stroke="#8b5cf6" // Violet
            strokeWidth={3}
            strokeDasharray="5 5" // Makes the prediction line dotted/dashed
            fillOpacity={1}
            fill="url(#colorPrediction)"
            activeDot={{ r: 6, strokeWidth: 0, fill: "white" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RiskTrendChart;
