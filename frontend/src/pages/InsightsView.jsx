import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  ArrowRight,
  Zap,
  TrendingUp,
  BarChart2,
  Download,
  Activity,
  CheckCircle2,
  AlertTriangle,
  History,
  Clock,
  PauseCircle,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import SpotlightCard from "../components/ui/SpotlightCard";

// --- SMART TOOLTIP LOGIC ---
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    // 1. Explicitly grab the exact data points we care about
    const recorded = payload.find(
      (p) => p.dataKey === "recorded" && p.value !== null,
    );
    const prediction = payload.find(
      (p) => p.dataKey === "prediction" && p.value !== null,
    );
    const ciData = payload.find((p) => p.dataKey === "ci_range");

    // 2. Prioritize Recorded. If we are at the stitch point, 'recorded' wins.
    const activeItem = recorded || prediction;
    if (!activeItem) return null;

    // 3. It is ONLY a prediction if there is no recorded data
    const isPrediction = !recorded && prediction;

    // 🚨 FIX: Extract CI range properly (check existence and array structure)
    let ciRange = null;
    if (
      isPrediction &&
      ciData &&
      ciData.value &&
      Array.isArray(ciData.value) &&
      ciData.value.length === 2
    ) {
      ciRange = ciData.value;
    }

    return (
      <div className="bg-[#09090b]/90 backdrop-blur-md border border-white/10 p-4 rounded-xl shadow-2xl">
        <p className="text-white/60 text-xs font-medium mb-1">{label}</p>
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`w-2 h-2 rounded-full animate-pulse ${
              isPrediction ? "bg-violet-500" : "bg-emerald-500"
            }`}
          />
          <p className="text-white font-bold text-lg">
            {activeItem.value}
            <span className="text-xs text-white/40 ml-2 font-normal uppercase tracking-wider">
              {isPrediction ? "Predicted Risk" : "Recorded Risk"}
            </span>
          </p>
        </div>

        {/* 🚨 FIX: Safely render CI bounds with proper number formatting */}
        {ciRange && (
          <p className="text-xs text-white/50 font-mono">
            90% CI: {ciRange[0].toFixed(1)}% – {ciRange[1].toFixed(1)}%
          </p>
        )}
      </div>
    );
  }
  return null;
};

// --- SUB-COMPONENTS ---
const LoadingOverlay = () => (
  <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#09090b]/60 backdrop-blur-md rounded-xl animate-in fade-in duration-200">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
      <p className="text-xs text-indigo-300/70 uppercase tracking-widest font-semibold animate-pulse">
        Fetching Telemetry
      </p>
    </div>
  </div>
);

const EmptyDataState = () => (
  <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-xl bg-white/[0.01]">
    <div className="p-4 rounded-full bg-indigo-500/10 mb-4">
      <BrainCircuit size={32} className="text-indigo-400/50" />
    </div>
    <h3 className="text-lg font-bold text-white mb-1">No Telemetry Found</h3>
    <p className="text-sm text-white/40 text-center max-w-[250px]">
      Start a focus session to generate analytics and burnout forecasts for this
      period.
    </p>
  </div>
);

const StatCard = ({ label, value, subtext, icon: Icon, color }) => (
  <SpotlightCard className="p-6 flex flex-col justify-between h-full group hover:border-white/20 transition-colors">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl ${color.bg} ${color.text}`}>
        <Icon size={22} />
      </div>
      {subtext && (
        <span className="px-2 py-1 rounded-md bg-white/5 border border-white/5 text-[10px] text-white/40 font-mono uppercase">
          {subtext}
        </span>
      )}
    </div>
    <div>
      <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
      <p className="text-sm text-white/50 font-medium uppercase tracking-wider mt-1">
        {label}
      </p>
    </div>
  </SpotlightCard>
);

const FactorRow = ({ label, impact, type = "negative" }) => (
  <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
    <span className="text-sm text-white/60">{label}</span>
    <span
      className={`text-xs font-mono font-medium px-2 py-0.5 rounded ${
        type === "negative"
          ? "bg-red-500/10 text-red-400 border border-red-500/20"
          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
      }`}
    >
      {impact}
    </span>
  </div>
);

// --- MAIN MERGED COMPONENT ---
const InsightsView = () => {
  const [historyData, setHistoryData] = useState([]);
  const [mlData, setMlData] = useState(null);
  const [pastSessions, setPastSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Toggle State for the Chart ('week' or 'day')
  const [timeRange, setTimeRange] = useState("week");

  // --- 1. DATA FETCHING & STITCHING ---
  useEffect(() => {
    const fetchInsights = async () => {
      if (!window.fobitAPI) return;
      setIsLoading(true);

      try {
        let formattedGraphData = [];

        // 1. Fetch History
        if (timeRange === "week") {
          const history = await window.fobitAPI.getHistory();
          formattedGraphData = history.map((row) => {
            const dateObj = new Date(row.date_id);
            const val = row.avg_cognitive_load || row.total_active_minutes || 0;
            return {
              day: dateObj.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              }),
              recorded: Number(parseFloat(val).toFixed(2)),
              prediction: null,
              minutes: row.total_active_minutes || 0,
              app: row.primary_focus_app,
            };
          });
        } else {
          const todayHistory = await window.fobitAPI.getTodayHistory();
          formattedGraphData = todayHistory.map((row) => ({
            day: row.time_label,
            recorded: Number(parseFloat(row.past || 0).toFixed(2)),
            prediction: null,
            minutes: row.minutes || 0,
            app: row.app || "N/A",
          }));
        }

        // 2. Fetch ML Data
        const ml = await window.fobitAPI.runAnalytics();
        setMlData(ml);

        // 3. THE STITCH: Connect Recorded to Prediction with Confidence Intervals
        if (ml && ml.forecast && formattedGraphData.length > 0) {
          const lastIndex = formattedGraphData.length - 1;
          const lastRecorded = formattedGraphData[lastIndex].recorded;

          // 🚨 FIX: Clamp the anchor point values to 0-100
          const clampedRecorded = Math.max(0, Math.min(100, lastRecorded));

          // Anchor the prediction line to the last known recorded point (clamped)
          // Set CI range to a point (no uncertainty at anchor) (clamped)
          formattedGraphData[lastIndex].prediction = clampedRecorded;
          formattedGraphData[lastIndex].ci_range = [
            clampedRecorded,
            clampedRecorded,
          ];

          // Add the 3 predicted future points
          ml.forecast.forEach((predObj, idx) => {
            let nextLabel = "";
            const now = new Date();

            if (timeRange === "week") {
              now.setDate(now.getDate() + idx + 1);
              nextLabel = now.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
            } else {
              now.setMinutes(now.getMinutes() + (idx + 1) * 30);
              nextLabel = now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
            }

            formattedGraphData.push({
              day: nextLabel,
              recorded: null,
              // 🚨 FIX: Clamp predictions and CIs between 0 and 100
              prediction: Math.max(
                0,
                Math.min(100, Number(predObj.forecast.toFixed(2))),
              ),
              ci_range: [
                Math.max(0, Math.min(100, Number(predObj.ci_lower.toFixed(2)))),
                Math.max(0, Math.min(100, Number(predObj.ci_upper.toFixed(2)))),
              ],
            });
          });
        }

        setHistoryData(formattedGraphData);

        // Fetch Recent Sessions
        if (pastSessions.length === 0) {
          const sessions = await window.fobitAPI.getSessions();
          setPastSessions(sessions);
        }
      } catch (err) {
        // Error handled silently
      } finally {
        setIsLoading(false);
      }
    };

    fetchInsights();
  }, [timeRange, pastSessions.length]);

  // --- 2. CALENDAR INTEGRATION ---
  const handleAddToCalendar = () => {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const endTime = new Date(now);
    endTime.setMinutes(endTime.getMinutes() + 45);

    const formatTime = (date) =>
      date.toISOString().replace(/-|:|\.\d\d\d/g, "");
    const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Cognitive+Recovery+Block&details=Automated+break+scheduled+by+FoBit+Insights+Engine+to+mitigate+burnout+risk.&dates=${formatTime(now)}/${formatTime(endTime)}`;

    window.open(gCalUrl, "_blank");
  };

  // --- 3. DYNAMIC METRICS & EMPTY STATE LOGIC ---
  const hasData = historyData.length > 0;

  const avgMins =
    hasData && timeRange === "week"
      ? Math.round(
          historyData.reduce((acc, curr) => acc + (curr.minutes || 0), 0) /
            historyData.filter((d) => d.minutes !== undefined).length,
        ) || 0
      : 0;

  const totalMinsToday =
    hasData && timeRange === "day"
      ? historyData.reduce((acc, curr) => acc + (curr.minutes || 0), 0)
      : 0;

  const validHistory = historyData.filter((d) => d.app && d.app !== "N/A");

  const activeTimeValue = isLoading
    ? "..."
    : !hasData
      ? "--"
      : timeRange === "week"
        ? `${avgMins}m`
        : `${totalMinsToday}m`;
  const primaryFocusApp = isLoading
    ? "..."
    : validHistory.length > 0
      ? validHistory[validHistory.length - 1].app
      : "--";
  const riskScore = isLoading
    ? "..."
    : mlData && !mlData.error && hasData
      ? `${mlData.burnout_probability}%`
      : "--";
  const trend = mlData && !mlData.error && hasData ? mlData.trend : "stable";

  const activeTimeSubtext =
    timeRange === "week" ? "Daily Avg" : "Today's Total";
  const displayTrendText = isLoading
    ? "Syncing..."
    : !hasData
      ? "Awaiting Data"
      : trend;

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // --- 4. ANIMATION VARIANTS ---
  const containerVars = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };
  const itemVars = {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 300, damping: 24 },
    },
  };

  return (
    <motion.div
      variants={containerVars}
      initial="hidden"
      animate="show"
      className="px-6 md:px-10 pt-25 pb-10 space-y-8 max-w-7xl mx-auto"
    >
      {/* HEADER */}
      <motion.div
        variants={itemVars}
        className="flex justify-between items-end"
      >
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            Insights Engine
            <span className="text-xs bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20">
              Unified Analysis
            </span>
          </h2>
          <p className="text-white/50 font-medium mt-1">
            Correlating historical velocity with future burnout risk.
          </p>
        </div>
      </motion.div>

      {/* METRICS ROW */}
      <motion.div
        variants={itemVars}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        <StatCard
          label={timeRange === "week" ? "Avg Active Time" : "Total Active Time"}
          value={activeTimeValue}
          subtext={activeTimeSubtext}
          icon={BarChart2}
          color={{ bg: "bg-blue-500/10", text: "text-blue-400" }}
        />
        <StatCard
          label="Primary Focus"
          value={primaryFocusApp}
          subtext="Latest"
          icon={Activity}
          color={{ bg: "bg-purple-500/10", text: "text-purple-400" }}
        />
        <StatCard
          label="Projected Risk"
          value={riskScore}
          subtext={displayTrendText}
          icon={TrendingUp}
          color={{
            bg: trend === "increasing" ? "bg-rose-500/10" : "bg-emerald-500/10",
            text: trend === "increasing" ? "text-rose-400" : "text-emerald-400",
          }}
        />
        <StatCard
          label="Engine Status"
          value={isLoading ? "Syncing..." : "Online"}
          subtext={isLoading ? "Updating..." : mlData?.model_used || "Fallback"}
          icon={BrainCircuit}
          color={{ bg: "bg-emerald-500/10", text: "text-emerald-400" }}
        />
      </motion.div>

      {/* HERO CHART & ACTION PLAN */}
      <motion.div
        variants={itemVars}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* DYNAMIC CHART */}
        <SpotlightCard className="lg:col-span-2 p-8 min-h-[400px] flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white">
                Cognitive Load History
              </h3>
              <p className="text-sm text-white/50">
                {timeRange === "week"
                  ? "Last 7 Days (Daily Avg)"
                  : "Today (30-min Intervals)"}
              </p>
            </div>

            {/* THE TOGGLE UI */}
            <div className="flex gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
              <button
                onClick={() => setTimeRange("day")}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  timeRange === "day"
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    : "text-white/40 hover:text-white/80"
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setTimeRange("week")}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  timeRange === "week"
                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    : "text-white/40 hover:text-white/80"
                }`}
              >
                7 Days
              </button>
            </div>
          </div>

          {/* CHART CONTAINER WITH LOADING & EMPTY STATES */}
          <div className="w-full flex-1 min-h-[300px] relative rounded-xl border border-white/5 bg-white/[0.01]">
            {isLoading && <LoadingOverlay />}

            {!isLoading && !hasData ? (
              <EmptyDataState />
            ) : (
              <div className="absolute inset-0 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData}>
                    <defs>
                      <linearGradient
                        id="colorRecorded"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#10b981"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#10b981"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="colorPrediction"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#8b5cf6"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#8b5cf6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient id="colorCI" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="#8b5cf6"
                          stopOpacity={0.15}
                        />
                        <stop
                          offset="100%"
                          stopColor="#8b5cf6"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
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
                      dy={10}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 12 }}
                      domain={[0, 100]}
                      allowDataOverflow={true}
                    />

                    {/* 🚨 THE NEW SMART TOOLTIP INJECTION */}
                    <Tooltip
                      content={<CustomTooltip />}
                      cursor={{
                        stroke: "rgba(255,255,255,0.1)",
                        strokeWidth: 2,
                      }}
                    />

                    <Area
                      type="monotone"
                      name="Recorded"
                      dataKey="recorded"
                      stroke="#10b981"
                      strokeWidth={3}
                      fill="url(#colorRecorded)"
                    />

                    {/* Confidence Interval Band (behind prediction line) */}
                    <Area
                      type="monotone"
                      name="90% Confidence Interval"
                      dataKey="ci_range"
                      stroke="none"
                      fill="url(#colorCI)"
                      fillOpacity={0.15}
                      isAnimationActive={false}
                    />

                    <Area
                      type="monotone"
                      name="Prediction"
                      dataKey="prediction"
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      strokeDasharray="5 5"
                      fill="url(#colorPrediction)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </SpotlightCard>

        {/* DYNAMIC ACTION PLAN */}
        <SpotlightCard className="p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <div
              className={`p-2 rounded-lg ${trend === "increasing" ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"}`}
            >
              <Zap size={18} />
            </div>
            <h3 className="font-semibold text-white">Action Plan</h3>
          </div>

          {!hasData && !isLoading ? (
            <div className="flex-1 flex items-center justify-center text-center p-6 border-2 border-dashed border-white/5 rounded-xl bg-white/[0.01]">
              <p className="text-sm text-white/40">
                Not enough data to generate an action plan. Complete a focus
                session first.
              </p>
            </div>
          ) : (
            <div className="space-y-4 flex-1">
              <div>
                <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
                  Telemetry Drivers
                </p>
                <FactorRow
                  label="Workload Velocity"
                  impact={trend === "increasing" ? "High" : "Stable"}
                  type={trend === "increasing" ? "negative" : "positive"}
                />
                <FactorRow
                  label="Focus Shifts"
                  impact="Tracked"
                  type="positive"
                />
              </div>

              <div className="bg-white/5 rounded-xl p-4 border border-white/5 mt-4">
                <div className="flex gap-3">
                  {trend === "increasing" ? (
                    <AlertTriangle
                      className="text-amber-400 shrink-0 mt-0.5"
                      size={18}
                    />
                  ) : (
                    <CheckCircle2
                      className="text-emerald-400 shrink-0 mt-0.5"
                      size={18}
                    />
                  )}
                  <div>
                    <h4 className="text-sm font-semibold text-white">
                      {trend === "increasing"
                        ? "Fatigue Warning"
                        : "Optimal Pacing"}
                    </h4>
                    <p className="text-xs text-white/60 mt-1 leading-relaxed">
                      {trend === "increasing"
                        ? "Your cognitive load trend is rising. Schedule a 45-minute deep recovery block to prevent burnout."
                        : "Your workload is sustainable. Keep maintaining your current rest intervals."}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleAddToCalendar}
                  className="mt-4 w-full py-2.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-200 text-xs font-semibold transition-all flex items-center justify-center gap-2 group"
                >
                  <span>Add Recovery Block to Calendar</span>
                  <ArrowRight
                    size={14}
                    className="group-hover:translate-x-1 transition-transform"
                  />
                </button>
              </div>
            </div>
          )}
        </SpotlightCard>
      </motion.div>

      {/* RECENT SESSIONS LOG */}
      <motion.div variants={itemVars}>
        <SpotlightCard className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <History size={18} className="text-indigo-400" />
              Session Log
            </h3>
            <span className="text-xs text-white/40 uppercase tracking-widest font-bold">
              Local SQLite Database
            </span>
          </div>

          <div className="space-y-3">
            {pastSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-white/5 rounded-xl bg-white/[0.01]">
                <p className="text-white/40 text-sm text-center">
                  No saved sessions yet. Head to the Focus Dashboard to start
                  one.
                </p>
              </div>
            ) : (
              pastSessions.map((session) => (
                <div
                  key={session.id}
                  className="grid grid-cols-2 md:grid-cols-5 gap-4 items-center p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl hover:bg-white/[0.04] transition-colors"
                >
                  <div className="col-span-2 md:col-span-1 flex flex-col">
                    <span className="text-sm font-semibold text-white/90">
                      {new Date(
                        session.start_time.replace(" ", "T"),
                      ).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="text-xs text-white/40 font-mono">
                      {new Date(
                        session.start_time.replace(" ", "T"),
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <div className="col-span-2 md:col-span-1 flex items-center gap-2">
                    <Activity size={14} className="text-blue-400" />
                    <span className="text-sm text-white/80 truncate">
                      {session.primary_app}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-emerald-400" />
                    <span className="text-sm font-mono text-white/80">
                      {formatDuration(session.duration_seconds)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-amber-400" />
                    <span className="text-sm font-mono text-white/80">
                      {session.avg_wpm} WPM
                    </span>
                  </div>

                  <div className="flex items-center gap-2 md:justify-end">
                    <PauseCircle size={14} className="text-rose-400" />
                    <span className="text-sm text-white/60">
                      {session.pause_count} Pauses
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </SpotlightCard>
      </motion.div>
    </motion.div>
  );
};

export default InsightsView;
