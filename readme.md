<div align="center">

# ⚡ PulseGrid

**AI-Powered Cognitive Load & Fatigue Tracker for Developers**

[![Electron](https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white)](#)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](#)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](#)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](#)
[![XGBoost](https://img.shields.io/badge/XGBoost-172434?style=for-the-badge&logo=xgboost&logoColor=white)](#)
[![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)](#)

_A privacy-first desktop application that uses high-frequency telemetry and local machine learning to predict developer burnout and cognitive load in real-time._

<br />

![PulseGrid Dashboard Preview](https://via.placeholder.com/800x450/111827/00ffaa?text=PulseGrid+Dashboard+Screenshot+Here)

</div>

---

# 📖 About The Project

PulseGrid is a cross-platform desktop telemetry system built to monitor high-frequency keystroke and mouse dynamics to model cumulative cognitive fatigue.

Most productivity trackers rely on rigid rules or send your sensitive data to cloud APIs. PulseGrid does the opposite: it utilizes a **completely offline, local machine learning pipeline** that learns your specific typing patterns, calibrates to your personal baseline, and predicts exhaustion before it happens.

By bridging a Node.js/Electron environment with a compiled Python machine learning engine via Inter-Process Communication (IPC), PulseGrid delivers real-time time-series forecasting without ever exposing your data to the internet.

---

# ✨ Key Features

🔒 **100% Privacy-First**
Data collection, model training, and inference happen entirely locally on your machine via SQLite. No cloud, no telemetry sharing.

⌨️ **High-Frequency HCI Telemetry**
Asynchronously captures keystroke velocity (WPM), dwell/flight times, backspace ratios, and mouse dynamics without blocking the React UI thread.

🧠 **Continuous Local Learning**
Collects ground-truth feedback via the UI to automatically retrain personalized XGBoost models, adapting to your unique work patterns over time.

📈 **Honest Time-Series Forecasting**
Uses ARIMA models and Isotonic Regression to provide calibrated fatigue predictions with 90% confidence intervals.

📦 **Zero-Dependency Deployment**
The heavy Python ML environment is compiled into a standalone binary (`.exe`) via PyInstaller. Users can run the app without installing Python or ML libraries.

---

# 🧠 Machine Learning Architecture

PulseGrid solves the classic **cold-start problem** using a multi-stage architecture.

## 1. Fallback Heuristic

For brand-new users with fewer than 10 sessions, the engine uses a safe rule-based heuristic (Flow State vs Exhausted) while data accumulates.

## 2. Temporal Feature Engineering

The ML pipeline extracts **40+ temporal features**:

**Micro (Per-Minute)**

- Typing velocity
- Error rates
- Mouse distance

**Meso (Rolling Window)**

- Moving averages
- Velocity slopes
- Distraction indexes

**Macro (Session Level)**

- Z-scores relative to baseline
- Lag features (`t-1`, `t-5`)

## 3. Training & Calibration

Once labeled data is collected:

- Train **XGBoost Regressor**
- Apply **Isotonic Regression** to calibrate predictions into honest probabilities.

## 4. Forecasting

Historical fatigue trends are fed into an **ARIMA(1,1,1)** model to generate **3-step forecasts with confidence intervals**.

---

# 🏗️ Tech Stack

| Category              | Technologies                                 |
| --------------------- | -------------------------------------------- |
| **Frontend UI**       | React 18, Tailwind CSS, Recharts             |
| **Desktop Runtime**   | Electron.js, IPC Main/Renderer Bridge        |
| **Backend & Storage** | Node.js, SQLite3                             |
| **Machine Learning**  | Python 3, XGBoost, Scikit-learn, Statsmodels |
| **Data Processing**   | Pandas, NumPy                                |
| **Deployment**        | PyInstaller, electron-builder                |

---

# 🚀 Getting Started

## Prerequisites

- Node.js (v16+)
- Python (v3.9+)
- GCC/C++ Build Tools

---

## Installation

### 1️⃣ Clone Repository

```bash
git clone https://github.com/Tanish-Arora-01/PulseGrid.git
cd PulseGrid
```

### 2️⃣ Install Node Dependencies

```bash
npm install
```

### 3️⃣ Install ML Dependencies

```bash
cd backend/model
pip install -r requirements.txt
```

### 4️⃣ Compile ML Engine

```bash
python -m PyInstaller --onefile --name analytics-engine --hidden-import pandas --hidden-import scikit-learn --collect-all xgboost analytics.py
```

Move the generated binary:

```
dist/analytics-engine.exe → backend/model/
```

### 5️⃣ Run Development Mode

```bash
cd ../../
npm run dev
```

---

# 📦 Building Production App

Ensure the PyInstaller binary is included via **electron-builder `extraResources`**, then run:

```bash
npm run dist
```

The final installer will appear in:

```
dist/
or
out/
```

---

# 🛣️ Future Roadmap

- SHAP Explainable AI integration
- LSTM sequence modeling after large dataset
- Isolation Forest anomaly detection
- Personalized fatigue dashboards

---

# 🤝 Contributing

1. Fork the Project
2. Create a Branch (`git checkout -b feature/AmazingFeature`)
3. Commit Changes (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

