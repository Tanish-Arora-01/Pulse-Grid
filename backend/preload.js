const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fobitAPI", {
  getLiveMetrics: () => ipcRenderer.invoke("get-live-metrics"),
  runAnalytics: () => ipcRenderer.invoke("run-analytics"),
  getHistory: () => ipcRenderer.invoke("get-history"),

  // Session Management API
  startSession: () => ipcRenderer.invoke("start-session"),
  pauseSession: () => ipcRenderer.invoke("pause-session"),
  endSession: () => ipcRenderer.invoke("end-session"),
  getSessions: () => ipcRenderer.invoke("get-sessions"),
  getSessionStatus: () => ipcRenderer.invoke("get-session-status"),
  getTodayHistory: () => ipcRenderer.invoke("get-today-history"),

  // 🌟 NEW: Fatigue Feedback & ML Training API 🌟
  submitFatigueReport: (data) =>
    ipcRenderer.invoke("submit-fatigue-report", data),

  // System Idle Listeners (For Auto-Pause)
  onSystemIdle: (callback) =>
    ipcRenderer.on("trigger-auto-pause", () => callback()),
  removeSystemIdle: () => ipcRenderer.removeAllListeners("trigger-auto-pause"),

  // 🌟 NEW: Profile Management API 🌟
  getProfiles: () => ipcRenderer.invoke("get-profiles"),
  createProfile: (name) => ipcRenderer.invoke("create-profile", name),
  setActiveProfile: (id) => ipcRenderer.invoke("set-active-profile", id),
  getActiveProfile: () => ipcRenderer.invoke("get-active-profile"),

  // 🌟 NEW: Profile Editing API 🌟
  updateProfileName: (data) => ipcRenderer.invoke("update-profile-name", data),
  clearProfileData: (id) => ipcRenderer.invoke("clear-profile-data", id),
  deleteProfile: (id) => ipcRenderer.invoke("delete-profile", id),
  logoutProfile: () => ipcRenderer.invoke("logout-profile"),

  // 🌟 NEW: System & Settings API 🌟
  getDbSize: () => ipcRenderer.invoke("get-db-size"),
  openDbFolder: () => ipcRenderer.invoke("open-db-folder"),
  exportTelemetry: () => ipcRenderer.invoke("export-telemetry"),

  // 🚨 ADDED: The missing Preferences hooks!
  getPrefs: () => ipcRenderer.invoke("get-prefs"),
  savePrefs: (prefs) => ipcRenderer.invoke("save-prefs", prefs),

  // 🪟 WINDOW CONTROL API (for custom titlebar)
  minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window-maximize"),
  closeWindow: () => ipcRenderer.invoke("window-close"),
  isWindowMaximized: () => ipcRenderer.invoke("window-is-maximized"),
});
