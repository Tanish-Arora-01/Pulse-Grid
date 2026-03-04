"""
Configuration and constants for the ML model system.
"""

import os
from pathlib import Path

# ============================================================================
# MODEL PATHS & STORAGE
# ============================================================================

def get_model_dir(profile_id):
    """Get model storage directory for a profile."""
    model_root = os.path.join(os.path.dirname(__file__), "models")
    Path(model_root).mkdir(parents=True, exist_ok=True)
    profile_dir = os.path.join(model_root, str(profile_id))
    Path(profile_dir).mkdir(parents=True, exist_ok=True)
    return profile_dir


# ============================================================================
# XGBoost HYPERPARAMETERS
# ============================================================================

XGBOOST_PARAMS = {
    'n_estimators': 100,      # Number of trees
    'max_depth': 5,           # Tree depth (prevent overfitting)
    'learning_rate': 0.1,     # Shrinkage (slower, more conservative updates)
    'random_state': 42,       # Reproducibility
    'verbosity': 0,           # Suppress output
}

# ============================================================================
# MODEL TRAINING PARAMETERS
# ============================================================================

TRAINING_CONFIG = {
    # lowered to make development/testing easier; a model will be trained once
    # the user has supplied only 5 labeled feedback entries.
    'min_samples_for_training': 5,        # Minimum labeled samples needed (was 50)
    'train_val_test_split': (0.80, 0.10, 0.10),  # Temporal split ratios
    'retrain_threshold': 10,              # Retrain after N new labels
    'session_log_limit': 500,             # Max historical data to load
}

# ============================================================================
# FEATURE ENGINEERING PARAMETERS
# ============================================================================

FEATURE_CONFIG = {
    'meso_window_minutes': 5,       # Rolling window for trend features
    'lag_steps': [1, 2, 5],         # Temporal lag features
    'include_lags': True,           # Whether to engineer lag features
}

# ============================================================================
# INFERENCE PARAMETERS
# ============================================================================

INFERENCE_CONFIG = {
    'confidence_ci': 0.90,          # Confidence interval level (90%)
    'z_score_ci': 1.645,            # Z-score for 90% CI
    'prediction_range': (0, 100),   # Valid prediction range
}

# ============================================================================
# FORECASTING PARAMETERS
# ============================================================================

FORECASTING_CONFIG = {
    'forecast_steps': 3,                    # Steps ahead to forecast
    'arima_order': (1, 1, 1),               # ARIMA(p, d, q)
    'min_history_for_arima': 10,            # Minimum data points for ARIMA
    'min_history_for_holt_winters': 4,      # Minimum for exponential smoothing
    'fatigue_history_limit': 100,           # Max historical feedback to load
}

# ============================================================================
# CALIBRATION & EVALUATION
# ============================================================================

CALIBRATION_CONFIG = {
    'calibration_method': 'isotonic',  # 'isotonic' or 'platt'
    'use_validation_for_calibration': True,  # Calibrate on val set
}

# ============================================================================
# HEURISTIC FALLBACK PARAMETERS (used when ML unavailable)
# ============================================================================

HEURISTIC_BASELINES = {
    'dwell_mean': 100.0,      # Default key dwell time (ms)
    'flight_mean': 200.0,     # Default key-to-key interval (ms)
    'wpm_mean': 40.0,         # Default typing speed (words per minute)
    'mouse_mean': 500.0,      # Default mouse movement (pixels)
}

HEURISTIC_THRESHOLDS = {
    'error_rate_critical': 0.04,              # High error = fatigue
    'error_rate_flow': 0.02,                  # Low error = flow state
    'flow_state_reduction': 0.0,              # Fatigue when in flow (0%)
    'cognitive_slip_penalty': 25.0,           # Penalty for errors
    'motor_sluggish_penalty': 15.0,           # Penalty for slow keys
    'velocity_decay_penalty': 20.0,           # Penalty for slow typing
    'distraction_penalty': 10.0,              # Penalty for mouse activity
    'motor_sluggish_threshold': 1.2,          # 1.2x baseline = sluggish
    'velocity_decay_threshold': 0.8,          # 0.8x baseline = decay
    'distraction_threshold': 1.5,             # 1.5x baseline = distraction
    'low_velocity_for_distraction': 10,       # WPM threshold for distraction check
}

# ============================================================================
# LOG MESSAGE PREFIXES (for debugging)
# ============================================================================

LOG_PREFIX = {
    'INFO': '[MODEL]',
    'ERROR': '[MODEL ERROR]',
    'WARN': '[MODEL WARN]',
    'DEBUG': '[MODEL DEBUG]',
}
