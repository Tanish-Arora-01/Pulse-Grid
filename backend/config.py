"""
PulseGrid REST API Configuration
"""

import os
from pathlib import Path

# Flask Configuration
FLASK_ENV = os.getenv("FLASK_ENV", "production")
DEBUG = FLASK_ENV == "development"
HOST = os.getenv("API_HOST", "127.0.0.1")
PORT = int(os.getenv("API_PORT", 5000))

# Database Configuration
DB_PATH = os.getenv("DB_PATH", str(Path(__file__).parent.parent / "backend" / "fobit_local.db"))

# Model Configuration
MODEL_DIR = Path(__file__).parent / "models"
MODEL_DIR.mkdir(exist_ok=True)

MIN_SAMPLES_FOR_TRAINING = 50
RETRAIN_THRESHOLD = 10  # Retrain after N new labels
MAX_MODEL_AGE_DAYS = 7  # Retrain if model older than N days

# Forecasting Configuration
FORECAST_STEPS = 3
ARIMA_ORDER = (1, 1, 1)

# API Configuration
API_VERSION = "1.0"
API_PREFIX = "/api/v1"

# Background Job Configuration
RETRAIN_CHECK_INTERVAL_MINUTES = 5
AUTO_RETRAIN_ENABLED = True

# Logging Configuration
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FORMAT = "json"  # "json" for structured logging

# CORS Configuration
CORS_ORIGINS = ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"]

# Model Confidence Configuration
CONFIDENCE_LEVEL = 0.90  # 90% confidence intervals
