import React, { useState, useEffect } from "react";
import {
  Shield,
  Database,
  Cpu,
  Power,
  FolderOpen,
  Download,
  AlertOctagon,
  Clock,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import SpotlightCard from "../components/ui/SpotlightCard";

const CustomSwitch = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
      checked ? "bg-indigo-500" : "bg-white/10"
    }`}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
        checked ? "translate-x-5" : "translate-x-0"
      }`}
    />
  </button>
);

const SettingsRow = ({ icon: Icon, title, description, control }) => (
  <div className="flex items-center justify-between p-5 rounded-xl hover:bg-white/[0.02] border border-transparent hover:border-white/5 transition-all group">
    <div className="flex items-center gap-4">
      <div className="p-2.5 rounded-lg bg-white/5 text-white/50 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-colors">
        <Icon size={20} />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-white tracking-wide">
          {title}
        </h4>
        <p className="text-xs text-white/40 mt-0.5 max-w-[250px] sm:max-w-md">
          {description}
        </p>
      </div>
    </div>
    <div className="ml-4 shrink-0">{control}</div>
  </div>
);

const SettingsView = () => {
  const [dbSize, setDbSize] = useState("Calculating...");
  const [exportStatus, setExportStatus] = useState("idle");
  const [isRestartRequired, setIsRestartRequired] = useState(false);

  // Default fallback state
  const [prefs, setPrefs] = useState({
    launchOnBoot: false,
    hardwareAcceleration: true,
    strictTracking: true,
    aggressiveAutoPause: true,
  });

  // 1. Fetch real preferences and DB size on load
  useEffect(() => {
    const fetchSettings = async () => {
      if (window.fobitAPI) {
        // Get DB Size
        const size = await window.fobitAPI.getDbSize();
        setDbSize(size);

        // Get saved preferences from config.json
        const loadedPrefs = await window.fobitAPI.getPrefs();
        if (loadedPrefs) setPrefs(loadedPrefs);
      }
    };
    fetchSettings();
  }, []);

  // 2. Auto-save preferences when toggled
  const togglePref = async (key) => {
    const newPrefs = { ...prefs, [key]: !prefs[key] };
    setPrefs(newPrefs); // Update React UI instantly

    // Show restart warning if they touch hardware acceleration
    if (key === "hardwareAcceleration") {
      setIsRestartRequired(true);
    }

    // Tell Electron to save to JSON and apply OS changes immediately
    if (window.fobitAPI) {
      await window.fobitAPI.savePrefs(newPrefs);
    }
  };

  const handleOpenFolder = async () => {
    if (window.fobitAPI) await window.fobitAPI.openDbFolder();
  };

  const handleExport = async () => {
    if (!window.fobitAPI || exportStatus === "exporting") return;

    setExportStatus("exporting");
    const res = await window.fobitAPI.exportTelemetry();

    if (res.success) {
      setExportStatus("success");
      setTimeout(() => setExportStatus("idle"), 3000);
    } else {
      setExportStatus("idle");
    }
  };

  return (
    <div className="px-6 md:px-10 pt-25 pb-10 space-y-8 max-w-7xl mx-auto">
      {/* RESTART WARNING BANNER */}
      {isRestartRequired && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 p-4 rounded-xl animate-in fade-in slide-in-from-top-4">
          <AlertTriangle size={20} />
          <p className="text-sm font-medium">
            Hardware Acceleration setting changed. Please restart FoBit to
            apply.
          </p>
        </div>
      )}

      {/* HEADER */}
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.15)]">
          <Shield size={32} />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">
            System Preferences
          </h2>
          <p className="text-white/50 font-medium mt-1">
            Manage hardware utilization, local data, and telemetry engine
            sensitivity.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          <SpotlightCard className="p-2">
            <div className="px-5 pt-4 pb-2 border-b border-white/5 mb-2">
              <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">
                System Integration
              </h3>
            </div>
            <SettingsRow
              icon={Power}
              title="Launch on System Boot"
              description="Automatically start the FoBit engine in the background when your computer turns on."
              control={
                <CustomSwitch
                  checked={prefs.launchOnBoot}
                  onChange={() => togglePref("launchOnBoot")}
                />
              }
            />
            <SettingsRow
              icon={Cpu}
              title="Hardware Acceleration"
              description="Use GPU to render complex UI animations and 3D gauge metrics smoothly."
              control={
                <CustomSwitch
                  checked={prefs.hardwareAcceleration}
                  onChange={() => togglePref("hardwareAcceleration")}
                />
              }
            />
          </SpotlightCard>

          <SpotlightCard className="p-2">
            <div className="px-5 pt-4 pb-2 border-b border-white/5 mb-2">
              <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">
                HCI Telemetry Engine
              </h3>
            </div>
            <SettingsRow
              icon={AlertOctagon}
              title="Strict App Tracking"
              description="Ignore minor background processes and only log active, foreground window usage."
              control={
                <CustomSwitch
                  checked={prefs.strictTracking}
                  onChange={() => togglePref("strictTracking")}
                />
              }
            />
            <SettingsRow
              icon={Clock}
              title="Aggressive Auto-Pause"
              description="Automatically pause session recording after just 2 minutes of idle keyboard/mouse inactivity."
              control={
                <CustomSwitch
                  checked={prefs.aggressiveAutoPause}
                  onChange={() => togglePref("aggressiveAutoPause")}
                />
              }
            />
          </SpotlightCard>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          <SpotlightCard className="p-6 h-full flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[80px] rounded-full pointer-events-none" />

            <div className="flex items-center gap-3 mb-6 relative z-10">
              <Database size={24} className="text-indigo-400" />
              <h3 className="text-xl font-bold text-white">Local Data Vault</h3>
            </div>

            <p className="text-sm text-white/60 leading-relaxed mb-8 relative z-10">
              FoBit is strictly a local application. All keystrokes, application
              logs, and ML predictions are encrypted and stored in an isolated
              SQLite database directly on your hard drive.
              <strong className="text-white">
                {" "}
                No data ever leaves this machine.
              </strong>
            </p>

            <div className="space-y-3 mt-auto relative z-10">
              {/* DYNAMIC DB SIZE */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    Database Size
                  </h4>
                  <p className="text-xs text-white/40 font-mono mt-1">
                    fobit_local.db
                  </p>
                </div>
                <span className="text-sm font-mono font-medium text-emerald-400">
                  {dbSize}
                </span>
              </div>

              {/* ACTION: OPEN FOLDER */}
              <button
                onClick={handleOpenFolder}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <FolderOpen
                    size={18}
                    className="text-white/40 group-hover:text-indigo-400 transition-colors"
                  />
                  <span className="text-sm font-semibold text-white">
                    Open Database Folder
                  </span>
                </div>
              </button>

              {/* ACTION: EXPORT CSV */}
              <button
                onClick={handleExport}
                disabled={exportStatus !== "idle"}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all group
                  ${
                    exportStatus === "success"
                      ? "bg-emerald-500/10 border-emerald-500/30"
                      : "bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/30"
                  }`}
              >
                <div className="flex items-center gap-3">
                  {exportStatus === "exporting" ? (
                    <Loader2
                      size={18}
                      className="text-indigo-400 animate-spin"
                    />
                  ) : exportStatus === "success" ? (
                    <CheckCircle2 size={18} className="text-emerald-400" />
                  ) : (
                    <Download size={18} className="text-indigo-400" />
                  )}

                  <span
                    className={`text-sm font-semibold ${exportStatus === "success" ? "text-emerald-400" : "text-indigo-300"}`}
                  >
                    {exportStatus === "exporting"
                      ? "Generating CSV..."
                      : exportStatus === "success"
                        ? "Export Successful"
                        : "Export Raw Telemetry (CSV)"}
                  </span>
                </div>
              </button>
            </div>
          </SpotlightCard>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
