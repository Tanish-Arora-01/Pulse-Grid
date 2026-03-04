const Database = require("better-sqlite3");
const path = require("path");
const { app } = require("electron");

function initDB() {
  // Store the database in the user's secure AppData/Application Support folder
  const dbPath = path.join(app.getPath("userData"), "fobit_local.db");
  const db = new Database(dbPath);

  // --- 0. NEW: Profiles Table (Multi-Tenant Local Auth) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      avatar_color TEXT DEFAULT 'bg-indigo-500',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 1. The Minute-by-Minute Telemetry Table (Upgraded for HCI)
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL, -- NEW: Links log to specific user
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      active_app TEXT,
      typing_velocity INTEGER,
      click_count INTEGER,
      cognitive_load REAL,
      
      -- HCI Micro-Metrics
      backspace_count INTEGER DEFAULT 0,
      avg_dwell_time_ms REAL DEFAULT 0,
      avg_flight_time_ms REAL DEFAULT 0,
      mouse_distance_px REAL DEFAULT 0,
      
      FOREIGN KEY(profile_id) REFERENCES profiles(id)
    )
  `);

  // 2. The Daily Rollup Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_aggregates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL, -- NEW: Links rollup to specific user
      date_id TEXT,
      total_active_minutes INTEGER,
      primary_focus_app TEXT,
      avg_cognitive_load REAL,
      peak_stress_time TEXT,
      
      FOREIGN KEY(profile_id) REFERENCES profiles(id),
      UNIQUE(date_id, profile_id) -- Ensures only ONE rollup per user, per day
    )
  `);

  // 3. The Macro Session Tracker (For Start/Stop tracking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id TEXT PRIMARY KEY,
      profile_id INTEGER NOT NULL, -- NEW: Links session to specific user
      start_time DATETIME,
      end_time DATETIME,
      duration_seconds INTEGER,
      avg_wpm INTEGER,
      primary_app TEXT,
      pause_count INTEGER DEFAULT 0,

      FOREIGN KEY(profile_id) REFERENCES profiles(id)
    )
  `);

  // 4. User Feedback Table (Ground Truth Labels for ML Model)
  db.exec(`
    CREATE TABLE IF NOT EXISTS fatigue_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      timestamp DATETIME NOT NULL,
      reported_fatigue_1_10 INTEGER CHECK(reported_fatigue_1_10 BETWEEN 1 AND 10),
      context TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(profile_id) REFERENCES profiles(id)
    )
  `);

  // 5. Model Metadata Table (Version Control & Training Metrics)
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      model_version TEXT NOT NULL,
      training_samples INTEGER,
      model_type TEXT,
      metrics TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      active INTEGER DEFAULT 1,
      FOREIGN KEY(profile_id) REFERENCES profiles(id),
      UNIQUE(profile_id, model_version)
    )
  `);

  // 6. Prediction Logs (Track Predictions vs Actuals for Calibration)
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      timestamp DATETIME,
      predicted_fatigue REAL,
      actual_fatigue REAL,
      confidence REAL,
      FOREIGN KEY(profile_id) REFERENCES profiles(id)
    )
  `);

  console.log("🗄️ Database initialized with Multi-Profile support at:", dbPath);
  return db;
}

module.exports = { initDB };
