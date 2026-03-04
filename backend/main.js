const {
  app,
  BrowserWindow,
  Tray,
  ipcMain,
  powerMonitor,
  dialog,
  shell,
} = require("electron");
const path = require("path");
const { initDB } = require("./database.js");
const { uIOhook, UiohookKey } = require("uiohook-napi");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");

// ============================================================================
// 🚨 AGGRESSIVE ERROR CATCHING - FOR PRODUCTION DEBUGGING
// ============================================================================

// Catch ALL uncaught exceptions (fatal background errors)
process.on("uncaughtException", (error) => {
  console.error("🚨 FATAL ERROR (uncaughtException):", error);
  // Silently exit in production
  process.exit(1);
});

// Catch unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("🚨 UNHANDLED REJECTION:", reason);
  // Error logged silently in production
});

// Catch errors from native modules
process.on("error", (error) => {
  console.error("🚨 PROCESS ERROR:", error);
  // Error logged silently in production
});

// ============================================================================
// 🚀 PRODUCTION BUILD PATHS
// ============================================================================
// Helper functions to get correct paths for both dev and production builds

/**
 * Get the correct analytics engine path based on app.isPackaged
 * In development we call the python script directly (backend/model/analytics.py)
 * In production we execute the bundled standalone executable
 * which lives in resources/model/analytics-engine.exe
 */
function getAnalyticsEnginePath() {
  // if an EXE exists locally, prefer it (allows testing without Python)
  const exePath = app.isPackaged
    ? path.join(process.resourcesPath, "model", "analytics-engine.exe")
    : path.join(__dirname, "model", "analytics-engine.exe");

  if (fs.existsSync(exePath)) {
    return exePath;
  }

  // fallback to Python script (development or if EXE missing)
  return app.isPackaged
    ? path.join(process.resourcesPath, "model", "analytics.py")
    : path.join(__dirname, "model", "analytics.py");
}

// backwards‑compatible alias (used by some code earlier)
const getPythonScriptPath = getAnalyticsEnginePath; // keep existing callers working

/**
 * Get the correct frontend path based on app.isPackaged
 * In development: http://localhost:5173
 * In production: file:///app/frontend/dist/index.html
 */

/**
 * Get the correct asset path based on app.isPackaged
 * In development: backend/assets/
 * In production: resources/assets/
 */
function getAssetPath(assetName) {
  if (app.isPackaged) {
    // Production: Assets are in resources/extraResources/assets/
    return path.join(process.resourcesPath, "assets", assetName);
  } else {
    // Development: Assets are in backend/assets/
    return path.join(__dirname, "assets", assetName);
  }
}

// ============================================================================

let db;
let insertStmt;
let mainWindow;

// --- 0. MULTI-TENANT PROFILE STATE ---
let activeProfile = null;

// --- 1. GLOBAL PREFERENCES MANAGER ---
const configPath = path.join(app.getPath("userData"), "fobit_config.json");
let appConfig = {
  launchOnBoot: false,
  hardwareAcceleration: true,
  strictTracking: true,
  aggressiveAutoPause: true,
};
let tray = null;

function createTray() {
  // Use a 16x16 or 32x32 icon
  const icon = nativeImage.createFromPath(getAssetPath("tray-icon.png"));
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: "Open PulseGrid", click: () => mainWindow.show() },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("PulseGrid: AI Burnout Monitor");
  tray.setContextMenu(contextMenu);

  // Show window on tray click
  tray.on("click", () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

// Load existing config if it exists
if (fs.existsSync(configPath)) {
  try {
    appConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    console.error("Failed to parse config", e);
  }
}

// 🚨 OS HOOK: Disable Hardware Acceleration (MUST happen before app.whenReady)
if (!appConfig.hardwareAcceleration) {
  app.disableHardwareAcceleration();
}
// --- 1. THE UPGRADED IN-MEMORY STATE ---
const fobitState = {
  currentChunk: {
    startTime: Date.now(),
    appUsage: {},
    keystrokes: 0,
    clicks: 0,
    backspaces: 0,
    totalDwellTime: 0,
    totalFlightTime: 0,
    flightCount: 0,
    mouseDistance: 0,
    lastActivityTime: Date.now(),
  },
  liveMetrics: {
    currentApp: "None",
  },
  tracking: {
    lastKeyRelease: 0,
    activeKeys: {},
    lastMouse: { x: -1, y: -1 },
  },
  macroSession: {
    id: null,
    startTime: 0,
    isActive: false,
    pauseCount: 0,
  },
};

function resetTelemetryChunk() {
  fobitState.currentChunk = {
    startTime: Date.now(), // Resets the stopwatch to THIS EXACT SECOND
    appUsage: {},
    keystrokes: 0,
    clicks: 0,
    backspaces: 0,
    totalDwellTime: 0,
    totalFlightTime: 0,
    flightCount: 0,
    mouseDistance: 0,
  };
}

// --- EMERGENCY AUTO-SAVE LOGIC ---
function saveCurrentSession() {
  if (
    !fobitState.macroSession ||
    !fobitState.macroSession.isActive ||
    !activeProfile
  )
    return;

  const endTime = Date.now();
  const durationSeconds = Math.floor(
    (endTime - fobitState.macroSession.startTime) / 1000,
  );

  try {
    const stats = db
      .prepare(
        `
      SELECT 
        AVG(typing_velocity) as avg_wpm,
        active_app,
        COUNT(active_app) as app_count
      FROM session_logs 
      WHERE timestamp >= datetime(?, 'unixepoch', 'localtime')
      AND profile_id = ? -- ISOLATED TO USER
      GROUP BY active_app 
      ORDER BY app_count DESC 
      LIMIT 1
    `,
      )
      .get(fobitState.macroSession.startTime / 1000, activeProfile.id);

    const primaryApp =
      stats && stats.active_app ? stats.active_app : "Mixed Workload";
    const avgWpm = stats && stats.avg_wpm ? Math.round(stats.avg_wpm) : 0;

    const insertSession = db.prepare(`
      INSERT INTO focus_sessions (id, profile_id, start_time, end_time, duration_seconds, avg_wpm, primary_app, pause_count)
      VALUES (?, ?, datetime(?, 'unixepoch', 'localtime'), datetime(?, 'unixepoch', 'localtime'), ?, ?, ?, ?)
    `);

    insertSession.run(
      fobitState.macroSession.id,
      activeProfile.id,
      fobitState.macroSession.startTime / 1000,
      endTime / 1000,
      durationSeconds,
      avgWpm,
      primaryApp,
      fobitState.macroSession.pauseCount,
    );

    console.log(
      `🚨 Auto-Saved Session -> Time: ${durationSeconds}s | App: ${primaryApp} | WPM: ${avgWpm}`,
    );
  } catch (err) {
    console.error("Failed to auto-save session:", err);
  }

  fobitState.macroSession.isActive = false;
}

ipcMain.handle("get-prefs", () => appConfig);

ipcMain.handle("save-prefs", (event, newPrefs) => {
  appConfig = { ...appConfig, ...newPrefs };
  fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2));

  // 🚨 OS HOOK: Launch on System Boot
  // This tells Windows/macOS to start FoBit silently when you log in
  app.setLoginItemSettings({
    openAtLogin: appConfig.launchOnBoot,
    path: app.getPath("exe"), // The path to the actual built .exe
  });

  return { success: true };
});

// --- 1.5 PROFILE MANAGEMENT IPC API ---
ipcMain.handle("get-profiles", () => {
  return db.prepare("SELECT * FROM profiles").all();
});
// --- 1.6 PROFILE EDITING & DELETION API ---
ipcMain.handle("update-profile-name", (event, { id, newName }) => {
  try {
    db.prepare("UPDATE profiles SET name = ? WHERE id = ?").run(newName, id);
    return { success: true };
  } catch (err) {
    return { success: false, message: "Name might already exist." };
  }
});

ipcMain.handle("clear-profile-data", (event, profileId) => {
  try {
    // Delete all telemetry associated with this user
    db.prepare("DELETE FROM session_logs WHERE profile_id = ?").run(profileId);
    db.prepare("DELETE FROM focus_sessions WHERE profile_id = ?").run(
      profileId,
    );
    db.prepare("DELETE FROM daily_aggregates WHERE profile_id = ?").run(
      profileId,
    );
    console.log(`🗑️ Cleared all telemetry for Profile ID: ${profileId}`);
    return { success: true };
  } catch (err) {
    return { success: false, message: "Failed to clear data." };
  }
});

ipcMain.handle("delete-profile", (event, profileId) => {
  try {
    // Use a transaction with foreign keys disabled to ensure clean cascade delete
    db.exec("PRAGMA foreign_keys = OFF");

    const transaction = db.transaction(() => {
      // Cascade delete everything related to this profile
      // Delete in this order to avoid any constraint issues
      db.prepare("DELETE FROM prediction_logs WHERE profile_id = ?").run(
        profileId,
      );
      db.prepare("DELETE FROM fatigue_feedback WHERE profile_id = ?").run(
        profileId,
      );
      db.prepare("DELETE FROM model_metadata WHERE profile_id = ?").run(
        profileId,
      );
      db.prepare("DELETE FROM session_logs WHERE profile_id = ?").run(
        profileId,
      );
      db.prepare("DELETE FROM focus_sessions WHERE profile_id = ?").run(
        profileId,
      );
      db.prepare("DELETE FROM daily_aggregates WHERE profile_id = ?").run(
        profileId,
      );
      db.prepare("DELETE FROM profiles WHERE id = ?").run(profileId);
    });

    transaction();
    db.exec("PRAGMA foreign_keys = ON");

    // If they delete the profile they are currently logged into, log them out
    if (activeProfile && activeProfile.id === profileId) {
      activeProfile = null;
    }
    console.log(`💥 Deleted Profile ID: ${profileId}`);
    return { success: true };
  } catch (err) {
    db.exec("PRAGMA foreign_keys = ON"); // Re-enable in case of error
    console.error("Delete profile error:", err);
    return {
      success: false,
      message: "Failed to delete profile: " + err.message,
    };
  }
});

// Update create-profile
ipcMain.handle("create-profile", (event, name) => {
  try {
    const randomNum = Math.floor(Math.random() * 3) + 1;
    const randomAvatar = `/avatar${randomNum}.jpg`;

    const stmt = db.prepare(
      "INSERT INTO profiles (name, avatar_color) VALUES (?, ?)",
    );
    const info = stmt.run(name, randomAvatar);

    activeProfile = {
      id: info.lastInsertRowid,
      name: name,
      avatar_color: randomAvatar,
    };

    resetTelemetryChunk(); // 🚨 FIX: Reset stopwatch on account creation

    // 🚨 FIX: Reset macroSession so new profile starts with a clean slate
    fobitState.macroSession = {
      id: null,
      startTime: 0,
      isActive: false,
      pauseCount: 0,
    };

    return { success: true, profile: activeProfile };
  } catch (err) {
    return { success: false, message: "Name already exists" };
  }
});

// Update set-active-profile
ipcMain.handle("set-active-profile", (event, profileId) => {
  const profile = db
    .prepare("SELECT * FROM profiles WHERE id = ?")
    .get(profileId);
  if (profile) {
    activeProfile = profile;
    resetTelemetryChunk(); // 🚨 FIX: Reset stopwatch on login

    // 🚨 FIX: Reset macroSession to prevent session bleeding between profiles
    fobitState.macroSession = {
      id: null,
      startTime: 0,
      isActive: false,
      pauseCount: 0,
    };

    console.log(`👤 Active Profile Set: ${profile.name} (session state reset)`);
    return { success: true, profile };
  }
  return { success: false };
});

// 🚨 NEW FIX: Tell the backend to stop tracking when you log out
// 🚨 UPGRADED FIX: Prevent Data Bleeding on Logout
ipcMain.handle("logout-profile", () => {
  // 1. Check if they left a session running
  if (fobitState.macroSession && fobitState.macroSession.isActive) {
    console.log(
      "⚠️ Active session detected during profile switch. Force saving...",
    );

    // 2. Save the final seconds of telemetry first
    flushTelemetryToDB();

    // 3. Officially end and save the session under the OUTGOING user's ID
    saveCurrentSession();
  }

  // 4. Now it is safe to wipe the user from memory
  activeProfile = null;
  resetTelemetryChunk();

  // 5. Explicitly reset macroSession to prevent any session state leaking to next profile
  fobitState.macroSession = {
    id: null,
    startTime: 0,
    isActive: false,
    pauseCount: 0,
  };

  console.log(
    "👋 User logged out. Telemetry paused, session cleared, macroSession reset.",
  );
  return { success: true };
});

ipcMain.handle("get-active-profile", () => activeProfile);

// --- 2. SECURE IPC BRIDGE ---
ipcMain.handle("get-live-metrics", async () => {
  const chunk = fobitState.currentChunk;
  const minutesElapsed = Math.max(
    (Date.now() - chunk.startTime) / 60000,
    0.016,
  );
  const liveWPM = Math.round(chunk.keystrokes / 5 / minutesElapsed);

  return {
    currentApp: fobitState.liveMetrics.currentApp,
    currentWPM: liveWPM,
    currentClicks: chunk.clicks,
  };
});

// --- 2.5 RUN PYTHON ANALYTICS ---
ipcMain.handle("run-analytics", async () => {
  return new Promise((resolve) => {
    const dbPath = path.join(app.getPath("userData"), "fobit_local.db");
    const enginePath = getAnalyticsEnginePath();
    const isPackaged = app.isPackaged;

    console.log("🧠 Starting prediction analysis...");
    console.log(`📝 Engine path: ${enginePath}`);

    // decide how to launch the analytics engine based on the path we got
    // 🚨 THE FIX: Check if enginePath refers to the packaged executable or
    // to the raw Python script and spawn accordingly.
    let pythonProcess;
    if (enginePath.endsWith(".exe")) {
      // standalone binary (packaged mode or manual build)
      pythonProcess = spawn(enginePath, [dbPath]);
    } else {
      // fallback to running the script via the Python interpreter
      pythonProcess = spawn("python", [enginePath, dbPath]);
    }
    pythonProcess.on("error", (err) => {
      console.error("⚠️ Failed to launch analytics engine:", err);
    });

    let dataString = "";
    let hasResolved = false; // 🚨 CRITICAL: Prevent double-resolve

    const safeResolve = (value) => {
      if (!hasResolved) {
        hasResolved = true;
        resolve(value);
      }
    };

    // 🚨 TIMEOUT: If Python doesn't respond within 10 seconds, fail gracefully
    const timeout = setTimeout(() => {
      console.error("⚠️  Analytics timeout (10s) - killing process");
      pythonProcess.kill();
      safeResolve({
        error: "Prediction analysis timed out (10s exceeded)",
        fallback: true,
      });
    }, 10000);

    pythonProcess.stdout.on("data", (data) => {
      const chunk = data.toString();
      console.log("📝 Analytics stdout:", chunk.slice(0, 100));
      dataString += chunk;
    });

    pythonProcess.stderr.on("data", (data) => {
      const chunk = data.toString();
      if (chunk.trim()) {
        console.log("📝 Analytics stderr:", chunk.slice(0, 100));
      }
    });

    pythonProcess.on("close", (code) => {
      clearTimeout(timeout);
      console.log(`✅ Analytics process exited with code ${code}`);

      if (code !== 0) {
        return safeResolve({
          error: "Analytics engine crashed",
          code,
          fallback: true,
        });
      }

      try {
        if (!dataString.trim()) {
          return safeResolve({
            error: "No prediction data received",
            fallback: true,
          });
        }

        const result = JSON.parse(dataString);
        console.log("🧠 ML Forecast Generated:", result);
        safeResolve(result);
      } catch (e) {
        console.error("Failed to parse analytics response:", e.message);
        safeResolve({
          error: `Invalid data format: ${e.message}`,
          fallback: true,
        });
      }
    });

    pythonProcess.on("error", (err) => {
      clearTimeout(timeout);
      console.error("🚨 Analytics process error:", err);
      safeResolve({
        error: `Failed to start analytics: ${err.message}`,
        fallback: true,
      });
    });
  });
});

// --- 2.8 SESSION MANAGEMENT API ---
ipcMain.handle("start-session", () => {
  if (!activeProfile) return { success: false, message: "No profile active" };
  fobitState.macroSession = {
    id: crypto.randomUUID(),
    startTime: Date.now(),
    isActive: true,
    pauseCount: 0,
  };
  console.log("🟢 Focus Session Started:", fobitState.macroSession.id);
  return { success: true };
});

ipcMain.handle("pause-session", () => {
  if (fobitState.macroSession.isActive) {
    fobitState.macroSession.pauseCount += 1;
    console.log(
      "⏸️ Session Paused. Total pauses:",
      fobitState.macroSession.pauseCount,
    );
  }
  return { success: true };
});

ipcMain.handle("end-session", () => {
  if (!fobitState.macroSession.isActive) return { success: false };
  saveCurrentSession();
  return { success: true };
});

// Fetch past sessions for the UI (ISOLATED)
ipcMain.handle("get-sessions", () => {
  if (!activeProfile) return [];
  try {
    return db
      .prepare(
        "SELECT * FROM focus_sessions WHERE profile_id = ? ORDER BY start_time DESC LIMIT 10",
      )
      .all(activeProfile.id);
  } catch (err) {
    return [];
  }
});

// Fetch 7-day historical rollups for the Area Chart (ISOLATED)
ipcMain.handle("get-history", () => {
  if (!activeProfile) return [];
  try {
    const rows = db
      .prepare(
        `
      SELECT date_id, total_active_minutes, avg_cognitive_load, primary_focus_app
      FROM daily_aggregates 
      WHERE profile_id = ? 
      ORDER BY date_id DESC 
      LIMIT 7
    `,
      )
      .all(activeProfile.id);
    return rows.reverse();
  } catch (error) {
    console.error("Failed to fetch history:", error);
    return [];
  }
});

ipcMain.handle("get-session-status", () => {
  return fobitState.macroSession;
});

// --- 30-MIN GROUPED DATA FOR "TODAY" CHART (ISOLATED) ---
ipcMain.handle("get-today-history", () => {
  if (!activeProfile) return [];
  try {
    const rows = db
      .prepare(
        `
      SELECT 
        strftime('%H:%M', datetime((strftime('%s', timestamp, 'localtime') / 1800) * 1800, 'unixepoch')) as time_label,
        AVG(typing_velocity) as past,
        COUNT(*) as minutes,
        MAX(active_app) as app
      FROM session_logs
      WHERE date(timestamp, 'localtime') = date('now', 'localtime')
      AND profile_id = ?
      GROUP BY time_label
      ORDER BY time_label ASC
    `,
      )
      .all(activeProfile.id);
    return rows;
  } catch (error) {
    console.error("Failed to fetch today history:", error);
    return [];
  }
});

// --- 2.9 FATIGUE FEEDBACK & ML TRAINING TRIGGER ---
ipcMain.handle(
  "submit-fatigue-report",
  async (event, { fatigueScore, context }) => {
    if (!activeProfile) {
      return { success: false, error: "No active profile" };
    }

    // Validate input
    const score = parseInt(fatigueScore);
    if (isNaN(score) || score < 1 || score > 10) {
      return { success: false, error: "Fatigue score must be 1-10" };
    }

    try {
      // Step 1: Insert feedback into database (with safety timeout)
      console.log("🔄 Attempting to insert feedback into database...");
      const stmt = db.prepare(`
      INSERT INTO fatigue_feedback (profile_id, timestamp, reported_fatigue_1_10, context)
      VALUES (?, ?, ?, ?)
    `);

      const now = new Date().toISOString();
      let result;

      try {
        // Set a short timeout for database operations
        const dbInsertStart = Date.now();
        result = stmt.run(activeProfile.id, now, score, context || null);
        const dbInsertTime = Date.now() - dbInsertStart;
        console.log(
          `📊 Fatigue Report Saved: Profile ${activeProfile.id}, Score: ${score}/10, ID: ${result.lastInsertRowid} (${dbInsertTime}ms)`,
        );

        if (dbInsertTime > 1000) {
          console.warn(`⚠️  Database insert was slow: ${dbInsertTime}ms`);
        }
      } catch (dbErr) {
        console.error(
          "🚨 Database insert error (this shouldn't happen):",
          dbErr,
        );
        // Return immediately with error instead of hanging
        return {
          success: false,
          error: `Database error: ${dbErr.message}`,
        };
      }

      // Step 2: Trigger Python ML training script immediately
      return new Promise((resolve) => {
        const dbPath = path.join(app.getPath("userData"), "fobit_local.db");
        const enginePath = getAnalyticsEnginePath();
        const isPackagedTrain = app.isPackaged;

        console.log("🧠 Triggering ML training pipeline...");

        // determine launch method for ML training; similar fix as above
        let pythonProcess;
        if (enginePath.endsWith(".exe")) {
          pythonProcess = spawn(enginePath, [dbPath]);
        } else {
          pythonProcess = spawn("python", [enginePath, dbPath]);
        }
        pythonProcess.on("error", (err) => {
          console.error(
            "⚠️ Failed to launch analytics engine (training):",
            err,
          );
        });

        let output = "";
        let errorOutput = "";
        let processTimeout;
        let masterTimeout;
        let hasResolved = false; // 🚨 CRITICAL: Safety flag to prevent multiple resolves

        // Helper to safely resolve only once
        const safeResolve = (value) => {
          if (!hasResolved) {
            hasResolved = true;
            clearTimeout(processTimeout);
            clearTimeout(masterTimeout);
            console.log("✅ IPC response ready to send");
            resolve(value);
          }
        };

        // 🚨 SAFETY: Master timeout - if nothing resolves within 10 seconds, force resolve
        masterTimeout = setTimeout(() => {
          console.error(
            "🚨 CRITICAL: Master timeout triggered (10s) - forcing resolution",
          );
          pythonProcess.kill();
          safeResolve({
            success: true,
            feedbackId: result.lastInsertRowid,
            message: "Feedback saved, but ML training took too long",
            mlError: "Master timeout (10s) exceeded",
          });
        }, 10000);

        // 🚨 TIMEOUT: If Python doesn't respond within 15 seconds, fail gracefully
        // (Extended from 5s to give more breathing room for slower machines)
        processTimeout = setTimeout(() => {
          console.error("⚠️  Python process timeout (15s)");
          pythonProcess.kill();
          safeResolve({
            success: true,
            feedbackId: result.lastInsertRowid,
            message: "Feedback saved, but ML training timed out",
            mlError: "Process exceeded 15 second timeout",
          });
        }, 15000);

        pythonProcess.stdout.on("data", (data) => {
          const chunk = data.toString();
          console.log("📝 Python stdout:", chunk.slice(0, 100)); // Log first 100 chars
          output += chunk;
        });

        pythonProcess.stderr.on("data", (data) => {
          const chunk = data.toString();
          if (chunk.trim()) {
            console.log("📝 Python stderr:", chunk.slice(0, 100));
          }
          errorOutput += chunk;
        });

        pythonProcess.on("close", (code) => {
          console.log(`✅ Python process exited with code ${code}`);
          console.log("📝 Full output length:", output.length);

          // 🚨 CRITICAL: Try to parse output regardless of exit code
          // Python now always returns valid JSON
          if (output.trim().length === 0) {
            console.error("⚠️  No output from Python process");
            return safeResolve({
              success: true,
              feedbackId: result.lastInsertRowid,
              message: "Feedback saved, but ML training produced no output",
              mlError: "Empty response",
            });
          }

          try {
            const mlResult = JSON.parse(output);
            safeResolve({
              success: true,
              feedbackId: result.lastInsertRowid,
              message: "Feedback saved and ML engine synced",
              mlResult,
            });
          } catch (e) {
            console.error("Failed to parse ML output:", output);
            console.error("Parse error:", e.message);
            safeResolve({
              success: true,
              feedbackId: result.lastInsertRowid,
              message: "Feedback saved, but ML response could not be parsed",
              mlError: `Parse error: ${e.message}`,
            });
          }
        });

        pythonProcess.on("error", (err) => {
          console.error("🚨 Python process error:", err);
          safeResolve({
            success: true,
            feedbackId: result.lastInsertRowid,
            message: "Feedback saved, but ML process failed to start",
            mlError: err.message,
          });
        });
      });
    } catch (err) {
      console.error("Error submitting fatigue report:", err);
      return {
        success: false,
        error: `Database error: ${err.message}`,
      };
    }
  },
);

// --- 7. SYSTEM & SETTINGS API ---
ipcMain.handle("get-db-size", () => {
  try {
    const dbPath = path.join(app.getPath("userData"), "fobit_local.db");
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      return `${sizeInMB} MB`;
    }
    return "0.00 MB";
  } catch (err) {
    return "Unknown";
  }
});

ipcMain.handle("open-db-folder", () => {
  try {
    const dbPath = path.join(app.getPath("userData"), "fobit_local.db");
    shell.showItemInFolder(dbPath); // Natively opens File Explorer
    return { success: true };
  } catch (err) {
    console.error("Failed to open folder", err);
    return { success: false };
  }
});

ipcMain.handle("export-telemetry", async () => {
  if (!activeProfile) return { success: false, message: "No active profile" };

  try {
    // 1. Fetch all session logs for the current user
    const logs = db
      .prepare("SELECT * FROM session_logs WHERE profile_id = ?")
      .all(activeProfile.id);

    if (logs.length === 0)
      return { success: false, message: "No data to export" };

    // 2. Convert JSON to CSV format
    const header = Object.keys(logs[0]).join(",") + "\n";
    const rows = logs.map((obj) => Object.values(obj).join(",")).join("\n");
    const csvData = header + rows;

    // 3. Open native Windows "Save As" Dialog
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Export Telemetry Data",
      defaultPath: `fobit_telemetry_${activeProfile.name.replace(/\s+/g, "_")}.csv`,
      filters: [{ name: "CSV Files", extensions: ["csv"] }],
    });

    if (!canceled && filePath) {
      fs.writeFileSync(filePath, csvData);
      return { success: true };
    }
    return { success: false, message: "Export cancelled" };
  } catch (err) {
    console.error("Export Error:", err);
    return { success: false, message: "Failed to export data" };
  }
});

// --- WINDOW CONTROL API (for custom titlebar) ---
ipcMain.handle("window-minimize", () => {
  mainWindow.minimize();
  return { success: true };
});

ipcMain.handle("window-maximize", () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return { success: true };
});

ipcMain.handle("window-close", () => {
  mainWindow.close();
  return { success: true };
});

ipcMain.handle("window-is-maximized", () => {
  return mainWindow.isMaximized();
});

// --- 3. DATABASE FLUSH LOGIC ---
function flushTelemetryToDB() {
  if (!activeProfile) return; // Prevent writing orphaned data
  const chunk = fobitState.currentChunk;
  const apps = Object.keys(chunk.appUsage);

  // Save data if we have tracked activity
  if (apps.length > 0) {
    let primaryApp = apps[0];
    let maxTime = chunk.appUsage[primaryApp];

    for (const appName of apps) {
      if (chunk.appUsage[appName] > maxTime) {
        primaryApp = appName;
        maxTime = chunk.appUsage[appName];
      }
    }

    const minutesElapsed = Math.max(
      (Date.now() - chunk.startTime) / 60000,
      0.016,
    );

    // 🚨 IDLE DETECTION: If no keystrokes in 60s window, force WPM to 0
    const currentWPM =
      chunk.keystrokes === 0
        ? 0
        : Math.round(chunk.keystrokes / 5 / minutesElapsed);
    const totalClicks = chunk.clicks;
    const backspaces = chunk.backspaces;
    const avgDwell =
      chunk.keystrokes > 0 ? chunk.totalDwellTime / chunk.keystrokes : 0;
    const avgFlight =
      chunk.flightCount > 0 ? chunk.totalFlightTime / chunk.flightCount : 0;
    const mouseDistance = chunk.mouseDistance;

    try {
      insertStmt.run(
        activeProfile.id, // INJECTING USER ID
        primaryApp,
        currentWPM,
        totalClicks,
        0.0,
        backspaces,
        avgDwell,
        avgFlight,
        mouseDistance,
      );
    } catch (error) {
      console.error("Database Write Error:", error);
    }

    rollupDailyData();
  }

  // 🚨 CRITICAL FIX: Always reset the chunk, regardless of whether we saved
  fobitState.currentChunk = {
    startTime: Date.now(),
    appUsage: {},
    keystrokes: 0,
    clicks: 0,
    backspaces: 0,
    totalDwellTime: 0,
    totalFlightTime: 0,
    flightCount: 0,
    mouseDistance: 0,
  };
}

// --- 3.5 END OF DAY ROLLUP (ISOLATED) ---
function rollupDailyData() {
  if (!activeProfile) return;
  const today = new Date().toISOString().split("T")[0];
  try {
    const summary = db
      .prepare(
        `
      SELECT COUNT(*) as chunk_count, AVG(typing_velocity) as avg_wpm, MAX(cognitive_load) as peak_load
      FROM session_logs 
      WHERE DATE(timestamp) = ? AND profile_id = ?
    `,
      )
      .get(today, activeProfile.id);

    if (summary.chunk_count === 0) return;

    const totalMinutes = summary.chunk_count;
    const topAppRow = db
      .prepare(
        `
      SELECT active_app, COUNT(*) as app_count FROM session_logs
      WHERE DATE(timestamp) = ? AND profile_id = ? 
      GROUP BY active_app ORDER BY app_count DESC LIMIT 1
    `,
      )
      .get(today, activeProfile.id);

    const primaryApp = topAppRow ? topAppRow.active_app : "None";

    const upsertStmt = db.prepare(`
      INSERT INTO daily_aggregates (profile_id, date_id, total_active_minutes, primary_focus_app, avg_cognitive_load, peak_stress_time)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(date_id, profile_id) DO UPDATE SET
        total_active_minutes = excluded.total_active_minutes, primary_focus_app = excluded.primary_focus_app, avg_cognitive_load = excluded.avg_cognitive_load
    `);

    upsertStmt.run(
      activeProfile.id,
      today,
      totalMinutes,
      primaryApp,
      summary.avg_wpm,
      "14:00",
    );
  } catch (error) {
    console.error("Rollup Error:", error);
  }
}

// --- 4. WINDOW CREATION ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // 🚨 Removes the ugly Windows border/title bar
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 🚨 THE FIX: Use loadFile for production, loadURL for dev
  if (app.isPackaged) {
    const prodPath = path.join(__dirname, "../frontend/dist/index.html");
    console.log(`📱 Loading production frontend from: ${prodPath}`);
    mainWindow.loadFile(prodPath); // loadFile handles Windows paths perfectly!
  } else {
    if (process.env.NODE_ENV === "development") {
      console.log(`📱 Loading dev frontend from: http://localhost:5173`);
    }
    mainWindow.loadURL("http://localhost:5173");
  }

  // DevTools disabled for production
  // Uncomment below only for local debugging
  // mainWindow.webContents.openDevTools();

  // Add error handlers for the window
  mainWindow.webContents.on("crashed", () => {
    console.error("🚨 RENDERER CRASHED!");
    // Error handled silently in production
  });

  mainWindow.on("unresponsive", () => {
    console.error("🚨 WINDOW UNRESPONSIVE!");
    // Error handled silently in production
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `🚨 FAILED TO LOAD: ${validatedURL} (Code: ${errorCode}, ${errorDescription})`,
      );
      dialog.showErrorBox(
        "Failed to Load - PulseGrid",
        `Failed to load page:\n${validatedURL}\n\nError: ${errorDescription}`,
      );
    },
  );

  mainWindow.webContents.on("dom-ready", () => {
    console.log("✅ DOM ready - frontend loaded successfully");
  });

  // Modify window close event (minimize to tray instead of closing)
  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

// --- 5. THE NEW HCI TELEMETRY SENSORS ---
async function startTelemetry() {
  const activeWin = (await import("active-win")).default;

  uIOhook.on("keydown", (e) => {
    if (!activeProfile) return;
    const now = Date.now();

    fobitState.tracking.lastActivityTime = now; // 🚨 RESET IDLE TIMER
    fobitState.currentChunk.keystrokes += 1;

    if (e.keycode === UiohookKey.Backspace)
      fobitState.currentChunk.backspaces += 1;

    if (fobitState.tracking.lastKeyRelease > 0) {
      const flightTime = now - fobitState.tracking.lastKeyRelease;
      if (flightTime < 5000) {
        fobitState.currentChunk.totalFlightTime += flightTime;
        fobitState.currentChunk.flightCount += 1;
      }
    }

    if (!fobitState.tracking.activeKeys[e.keycode]) {
      fobitState.tracking.activeKeys[e.keycode] = now;
    }
  });

  uIOhook.on("keyup", (e) => {
    if (!activeProfile) return;
    const now = Date.now();
    fobitState.tracking.lastKeyRelease = now;

    if (fobitState.tracking.activeKeys[e.keycode]) {
      const dwellTime = now - fobitState.tracking.activeKeys[e.keycode];
      fobitState.currentChunk.totalDwellTime += dwellTime;
      delete fobitState.tracking.activeKeys[e.keycode];
    }
  });

  uIOhook.on("mousedown", () => {
    if (activeProfile) {
      fobitState.currentChunk.clicks += 1;
      fobitState.tracking.lastActivityTime = Date.now(); // 🚨 RESET IDLE TIMER
    }
  });

  uIOhook.on("wheel", (e) => {
    if (!activeProfile) return;
    fobitState.tracking.lastActivityTime = Date.now();
  });

  uIOhook.on("mousemove", (e) => {
    if (!activeProfile) return;
    if (fobitState.tracking.lastMouse.x !== -1) {
      const dx = e.x - fobitState.tracking.lastMouse.x;
      const dy = e.y - fobitState.tracking.lastMouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      fobitState.currentChunk.mouseDistance += dist;

      // 🚨 JITTER-PROOF: Only reset the timer if the mouse moved more than 5 pixels!
      if (dist > 5) {
        fobitState.tracking.lastActivityTime = Date.now();
      }
    }
    fobitState.tracking.lastMouse = { x: e.x, y: e.y };
  });

  uIOhook.start();
  console.log(
    "🔬 Advanced HCI Sensors Active: Tracking Dwell, Flight, and Entropy.",
  );

  setInterval(async () => {
    try {
      // Only track OS apps if a user is logged in
      if (!activeProfile) return;

      const window = await activeWin();
      if (window && window.owner) {
        const appName = window.owner.name;

        // 🚨 NEW: STRICT TRACKING LOGIC
        if (appConfig.strictTracking) {
          const ignoredApps = [
            "explorer.exe",
            "taskmgr.exe",
            "searchhost.exe",
            "lockapp.exe",
            "windows input experience",
            "application frame host",
            "desktop",
            "finder",
          ];
          // If the app is on the ignore list, skip logging it!
          if (ignoredApps.includes(appName.toLowerCase())) return;
        }

        fobitState.liveMetrics.currentApp = appName;
        if (!fobitState.currentChunk.appUsage[appName]) {
          fobitState.currentChunk.appUsage[appName] = 0;
        }
        fobitState.currentChunk.appUsage[appName] += 2000;
      }
    } catch (err) {}
  }, 2000);
}

// --- 6. BOOT SEQUENCE ---
// --- 6. BOOT SEQUENCE ---
app.whenReady().then(() => {
  try {
    db = initDB();
  } catch {
    dialog.showErrorBox("Initialization Failed", err.message);
  }
  insertStmt = db.prepare(`
    INSERT INTO session_logs 
    (profile_id, active_app, typing_velocity, click_count, cognitive_load, backspace_count, avg_dwell_time_ms, avg_flight_time_ms, mouse_distance_px)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  createWindow();
  try {
    startTelemetry();
  } catch {
    dialog.showErrorBox("Initialization Failed", err.message);
  }

  // 🚨 NEW: AUTO-PAUSE IDLE MONITOR
  // 🚨 CUSTOM HCI AUTO-PAUSE MONITOR
  setInterval(() => {
    // Only check if we are actively recording a session
    if (!activeProfile || !fobitState.macroSession.isActive) return;

    // Grab limits from your Settings page config (120s or 300s)
    const idleLimitSeconds = appConfig.aggressiveAutoPause ? 120 : 300;

    // Calculate how long it has been since the last physical input
    const idleSeconds =
      (Date.now() - fobitState.tracking.lastActivityTime) / 1000;

    if (idleSeconds >= idleLimitSeconds) {
      if (mainWindow) {
        console.log(
          `💤 Physical input idle for ${idleLimitSeconds}s. Triggering Auto-Pause.`,
        );
        mainWindow.webContents.send("trigger-auto-pause");

        // Reset the timer so it doesn't spam the console every 5 seconds while you are away
        fobitState.tracking.lastActivityTime = Date.now();
      }
    }
  }, 5000); // Checks every 5 seconds

  setInterval(flushTelemetryToDB, 60000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  saveCurrentSession();
  flushTelemetryToDB();
  rollupDailyData();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
