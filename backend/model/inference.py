"""
Inference module for fatigue predictions.
Loads trained models and generates predictions with confidence intervals.
"""

import joblib
import pandas as pd
import numpy as np
import json
import os
from pathlib import Path

from features import engineer_features


from config import HEURISTIC_BASELINES, HEURISTIC_THRESHOLDS

import sys
import traceback

class FatiguePredictor:
    """
    Loads trained models and generates fatigue predictions with confidence bounds.

    The class is aware of PyInstaller's runtime extraction directory (`sys._MEIPASS`)
    so that bundled model files can be resolved correctly when running from a frozen
    executable.  If the binary is not frozen, it falls back to using the normal
    package directory.
    """

    def __init__(self, profile_id, model_dir=None):
        """
        Initialize predictor.

        Args:
            profile_id: User profile ID
            model_dir: Directory containing trained models (optional)
        """
        self.profile_id = profile_id

        # compute the base directory for data files; when PyInstaller bundles the
        # app the files are unpacked into _MEIPASS at runtime.
        if getattr(sys, 'frozen', False):
            base_dir = sys._MEIPASS
        else:
            base_dir = os.path.dirname(__file__)

        if model_dir:
            self.model_dir = model_dir
        else:
            self.model_dir = os.path.join(base_dir, "models", str(profile_id))

        self.model = None
        self.scaler = None
        self.calibrator = None
        self.baselines = None
        self.feature_names = None
        self.is_ready = False

    def load_model(self, version=None):
        """
        Load trained model and components.

        Args:
            version: Specific model version (if None, uses latest)

        Returns:
            True if successful
        """
        try:
            if version is None:
                # Find most recent model
                files = list(Path(self.model_dir).glob("model_*.pkl"))
                if not files:
                    return False
                latest_file = max(files, key=os.path.getctime)
                version = latest_file.stem.replace("model_", "")

            self.model = joblib.load(os.path.join(self.model_dir, f"model_{version}.pkl"))
            self.scaler = joblib.load(os.path.join(self.model_dir, f"scaler_{version}.pkl"))
            self.calibrator = joblib.load(os.path.join(self.model_dir, f"calibrator_{version}.pkl"))

            with open(os.path.join(self.model_dir, f"metadata_{version}.json"), 'r') as f:
                metadata = json.load(f)
                self.baselines = metadata.get('baselines', {})
                self.feature_names = metadata.get('feature_names', [])

            self.is_ready = True
            return True

        except Exception as e:
            # print full traceback to stderr so Node.js/packaged app can diagnose
            print(f"Error loading model: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return False

    def predict(self, session_logs_df, return_components=False):
        """
        Generate fatigue prediction with confidence interval.

        The model uses sigmoid-transformed targets, so predictions come out in [0, 1]
        range and are scaled to [0, 100] percentages.

        Args:
            session_logs_df: Recent session logs (raw data)
            return_components: If True, return dict with all components

        Returns:
            Dict with 'prediction', 'lower_bound', 'upper_bound', 'confidence'
            or full dict if return_components=True
        """
        if not self.is_ready:
            raise ValueError("Model not loaded. Call load_model() first.")

        try:
            # Engineer features
            X_engineered, _ = engineer_features(session_logs_df, baselines=self.baselines, include_lags=True)

            # Select only features the model was trained on
            X_engineered = X_engineered[self.feature_names]

            # Scale
            X_scaled = self.scaler.transform(X_engineered)

            # Get predictions (output is in [0, 1] from sigmoid)
            y_pred_sigmoid = self.model.predict(X_scaled)  # [0, 1] range

            # 🚨 CONVERT TO PERCENTAGE: Scale from [0, 1] to [0, 100]
            y_pred_percent = y_pred_sigmoid * 100.0

            # Use most recent prediction
            pred_percent = y_pred_percent[-1]

            # Apply calibration
            pred_calibrated = float(self.calibrator.transform([pred_percent])[0])

            # 🚨 FINAL CLAMP: Safety net (should be redundant due to sigmoid)
            pred_calibrated = np.clip(pred_calibrated, 0, 100)

            # Estimate confidence interval using percentiles from recent predictions
            recent_n = min(10, len(y_pred_percent))
            recent_preds = y_pred_percent[-recent_n:]
            recent_calibrated = self.calibrator.transform(recent_preds)

            # Confidence based on prediction variance
            pred_std = np.std(recent_calibrated)
            confidence = max(0.5, min(1.0, 1 - pred_std / 50))  # Higher variance = lower confidence

            # 90% confidence interval (±1.645 std errors)
            margin = 1.645 * pred_std
            lower_bound = np.clip(pred_calibrated - margin, 0, 100)
            upper_bound = np.clip(pred_calibrated + margin, 0, 100)

            result = {
                'prediction': round(pred_calibrated, 1),
                'lower_bound': round(lower_bound, 1),
                'upper_bound': round(upper_bound, 1),
                'confidence': round(confidence, 2),
                'model_used': 'XGBoost (Sigmoid-Transformed)',
            }

            if return_components:
                result['raw_prediction'] = round(float(pred_percent), 1)
                result['prediction_history'] = [round(float(p), 1) for p in y_pred_percent[-5:]]
                result['feature_count'] = len(self.feature_names)

            return result

        except Exception as e:
            print(f"Error during prediction: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            raise

    def predict_heuristic_fallback(self, session_logs_df):
        """
        Fallback prediction using heuristic rules (for when model is unavailable).

        This is based on the original HCI heuristic from the old analytics.py.
        """
        if len(session_logs_df) == 0:
            return {'prediction': 50.0, 'model_used': 'Fallback (No Data)'}

        # Get current row
        current = session_logs_df.iloc[-1]

        # Use baselines if available, else defaults from config constants
        baselines = self.baselines or HEURISTIC_BASELINES.copy()

        fatigue = 5.0  # Base resting state

        # Error rate calculation
        estimated_keys = max(current.get('typing_velocity', 0) * 5, 1)
        error_rate = current.get('backspace_count', 0) / estimated_keys

        # === EXTREME-OUTLIER GUARDS ===
        # Very low speed or absurd error rates => max burnout
        if current.get('typing_velocity', 0) < baselines['wpm_mean'] * 0.2 or error_rate > 0.5:
            return {'prediction': 100.0, 'model_used': 'Heuristic (Max Fatigue)'}

        # Unrealistically high speed (spam) also indicates fatigue; penalize heavily
        if current.get('typing_velocity', 0) > baselines['wpm_mean'] * 1.5:
            fatigue += 30.0

        # Flow state (low fatigue) only when speed is near baseline and accuracy is excellent
        if (
            baselines['wpm_mean'] * 0.8
            <= current.get('typing_velocity', 0)
            <= baselines['wpm_mean'] * 1.2
            and error_rate <= HEURISTIC_THRESHOLDS['error_rate_flow']
        ):
            return {'prediction': 0.0, 'model_used': 'Heuristic (Flow State)'}

        # Cognitive slips (errors above critical threshold)
        if error_rate > HEURISTIC_THRESHOLDS['error_rate_critical']:
            fatigue += HEURISTIC_THRESHOLDS['cognitive_slip_penalty'] * min((error_rate - HEURISTIC_THRESHOLDS['error_rate_critical']) * 10, 2.0)

        # Motor sluggishness
        if current.get('avg_dwell_time_ms', 0) > baselines['dwell_mean'] * HEURISTIC_THRESHOLDS['motor_sluggish_threshold']:
            fatigue += HEURISTIC_THRESHOLDS['motor_sluggish_penalty']
        if current.get('avg_flight_time_ms', 0) > baselines['flight_mean'] * HEURISTIC_THRESHOLDS['motor_sluggish_threshold']:
            fatigue += HEURISTIC_THRESHOLDS['motor_sluggish_penalty']

        # Velocity decay (typing noticeably slower than baseline)
        if 0 < current.get('typing_velocity', 0) < (baselines['wpm_mean'] * HEURISTIC_THRESHOLDS['velocity_decay_threshold']):
            vel_diff = baselines['wpm_mean'] - current.get('typing_velocity', 0)
            fatigue += HEURISTIC_THRESHOLDS['velocity_decay_penalty'] * min(vel_diff / 20.0, 1.5)

        return {
            'prediction': round(np.clip(fatigue, 0.0, 100.0), 1),
            'model_used': 'Heuristic Fallback'
        }


def predict_with_model_or_fallback(profile_id, session_logs_df, model_dir=None):
    """
    Convenience function: attempt ML prediction, fallback to heuristic if needed.

    Args:
        profile_id: User profile ID
        session_logs_df: Recent session logs
        model_dir: Directory containing models

    Returns:
        Prediction dict
    """
    predictor = FatiguePredictor(profile_id, model_dir=model_dir)

    # Try to load and use model
    if predictor.load_model():
        try:
            return predictor.predict(session_logs_df)
        except Exception as e:
            print(f"ML prediction failed, using heuristic fallback: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return predictor.predict_heuristic_fallback(session_logs_df)
    else:
        # No trained model yet, use heuristic
        return predictor.predict_heuristic_fallback(session_logs_df)
