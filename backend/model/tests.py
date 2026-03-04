"""
Unit tests for the fatigue detection ML system.
Tests feature engineering, training, and inference modules.
"""

import os
import sys
import unittest
import tempfile
import sqlite3
import pandas as pd
import numpy as np
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from features import (
    compute_micro_features,
    compute_meso_features,
    compute_macro_features,
    normalize_to_user_baseline,
    create_lag_features,
    engineer_features,
)
from inference import FatiguePredictor
from forecasting import FatigueForecaster


class TestFeatureEngineering(unittest.TestCase):
    """Test feature engineering pipeline."""

    def setUp(self):
        """Create sample data for testing."""
        self.sample_data = pd.DataFrame({
            'typing_velocity': [50, 45, 55, 30, 60],
            'backspace_count': [1, 2, 1, 5, 0],
            'avg_dwell_time_ms': [100, 110, 95, 150, 90],
            'avg_flight_time_ms': [200, 210, 190, 300, 180],
            'mouse_distance_px': [500, 600, 400, 800, 300],
            'timestamp': pd.date_range('2026-02-28', periods=5, freq='H'),
        })

    def test_micro_features_shape(self):
        """Micro features should match input size."""
        micro = compute_micro_features(self.sample_data)
        self.assertEqual(len(micro), len(self.sample_data))

    def test_micro_features_no_nan(self):
        """Micro features should not contain NaN."""
        micro = compute_micro_features(self.sample_data)
        self.assertFalse(micro.isnull().any().any())

    def test_error_rate_calculation(self):
        """Error rate should be positive."""
        micro = compute_micro_features(self.sample_data)
        self.assertTrue((micro['error_rate'] >= 0).all())

    def test_meso_features_rolling(self):
        """Meso features should include rolling statistics."""
        meso = compute_meso_features(self.sample_data)
        self.assertIn('wpm_rolling_mean', meso.columns)
        self.assertIn('error_rate_rolling_mean', meso.columns)
        self.assertIn('distraction_index', meso.columns)

    def test_macro_features_temporal(self):
        """Macro features should include time-of-day info."""
        macro = compute_macro_features(self.sample_data)
        self.assertIn('hour_of_day', macro.columns)
        self.assertIn('day_of_week', macro.columns)
        self.assertTrue((macro['hour_of_day'] >= 0).all())
        self.assertTrue((macro['hour_of_day'] < 24).all())

    def test_normalization_bounds(self):
        """Normalized features should have reasonable bounds."""
        micro = compute_micro_features(self.sample_data)
        baselines = {
            'wpm_mean': 45.0,
            'wpm_std': 15.0,
            'error_rate_mean': 0.05,
            'error_rate_std': 0.03,
            'dwell_mean': 110.0,
            'flight_mean': 215.0,
            'mouse_mean': 520.0,
        }
        normalized = normalize_to_user_baseline(self.sample_data, micro, baselines)
        # Z-scores should typically be between -3 and 3
        self.assertTrue(
            (normalized['typing_velocity_zscore'] > -5).all() and
            (normalized['typing_velocity_zscore'] < 5).all()
        )

    def test_lag_features_creation(self):
        """Lag features should be created for historical context."""
        micro = compute_micro_features(self.sample_data)
        with_lags = create_lag_features(micro, lags=[1, 2])
        self.assertIn('typing_velocity_lag1', with_lags.columns)
        self.assertIn('typing_velocity_lag2', with_lags.columns)

    def test_full_pipeline(self):
        """Full feature engineering should complete without errors."""
        features, baselines = engineer_features(self.sample_data)
        self.assertEqual(len(features), len(self.sample_data))
        self.assertFalse(features.isnull().any().any())
        self.assertIn('wpm_mean', baselines)


class TestInference(unittest.TestCase):
    """Test inference and prediction."""

    def setUp(self):
        """Setup test predictor."""
        self.predictor = FatiguePredictor(profile_id=1)

    def test_heuristic_fallback_flow_state(self):
        """Heuristic should recognize flow states."""
        # Create a "flow state" scenario
        flow_data = pd.DataFrame({
            'typing_velocity': [70],  # High velocity
            'backspace_count': [0],   # No errors
            'avg_dwell_time_ms': [90],
            'avg_flight_time_ms': [180],
            'mouse_distance_px': [200],
            'timestamp': pd.to_datetime(['2026-02-28']),
        })

        result = self.predictor.predict_heuristic_fallback(flow_data)
        # Should show very low fatigue (close to 0) for flow state
        self.assertLess(result['prediction'], 10)

    def test_heuristic_fallback_high_errors(self):
        """Heuristic should penalize high error rates."""
        error_data = pd.DataFrame({
            'typing_velocity': [50],
            'backspace_count': [20],  # Many errors
            'avg_dwell_time_ms': [100],
            'avg_flight_time_ms': [200],
            'mouse_distance_px': [500],
            'timestamp': pd.to_datetime(['2026-02-28']),
        })

        result = self.predictor.predict_heuristic_fallback(error_data)
        # Should show high fatigue for errors
        self.assertGreater(result['prediction'], 20)

    def test_prediction_range(self):
        """Predictions should be in valid range [0, 100]."""
        data = pd.DataFrame({
            'typing_velocity': [40, 35, 45],
            'backspace_count': [3, 2, 1],
            'avg_dwell_time_ms': [100, 105, 95],
            'avg_flight_time_ms': [200, 210, 190],
            'mouse_distance_px': [500, 600, 400],
            'timestamp': pd.date_range('2026-02-28', periods=3, freq='H'),
        })

        result = self.predictor.predict_heuristic_fallback(data)
        self.assertGreaterEqual(result['prediction'], 0)
        self.assertLessEqual(result['prediction'], 100)


class TestForecasting(unittest.TestCase):
    """Test forecasting module."""

    def setUp(self):
        """Create temporary database for forecasting tests."""
        self.temp_db = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
        self.db_path = self.temp_db.name
        self.temp_db.close()

        # Initialize database
        conn = sqlite3.connect(self.db_path)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS fatigue_feedback (
                id INTEGER PRIMARY KEY,
                profile_id INTEGER,
                timestamp DATETIME,
                reported_fatigue_1_10 INTEGER
            )
        """)
        conn.commit()

        # Add sample feedback data
        for i in range(20):
            conn.execute(
                "INSERT INTO fatigue_feedback VALUES (?, ?, ?, ?)",
                (i, 1, f'2026-02-{15+i%14:02d}', np.random.randint(1, 11))
            )
        conn.commit()
        conn.close()

        self.forecaster = FatigueForecaster(profile_id=1, db_path=self.db_path)

    def tearDown(self):
        """Clean up temporary database."""
        if os.path.exists(self.db_path):
            os.unlink(self.db_path)

    def test_forecast_output_structure(self):
        """Forecast should have proper structure."""
        result = self.forecaster.forecast(steps=3)
        self.assertIsNotNone(result)
        self.assertIn('predictions', result)
        self.assertEqual(len(result['predictions']), 3)

    def test_forecast_values_in_range(self):
        """Forecast values should be in [0, 100]."""
        result = self.forecaster.forecast(steps=3)
        for pred in result['predictions']:
            self.assertGreaterEqual(pred['forecast'], 0)
            self.assertLessEqual(pred['forecast'], 100)
            self.assertGreaterEqual(pred['ci_lower'], 0)
            self.assertLessEqual(pred['ci_upper'], 100)

    def test_naive_forecast_fallback(self):
        """Naive forecast should work with minimal data."""
        result = self.forecaster.forecast_naive(
            pd.Series([50, 55, 60]), steps=3
        )
        self.assertEqual(len(result['predictions']), 3)
        self.assertIn('method', result)


class TestIntegration(unittest.TestCase):
    """Integration tests for full pipeline."""

    def test_features_to_prediction_pipeline(self):
        """Full pipeline: engineer features -> predict."""
        sample_data = pd.DataFrame({
            'typing_velocity': [50, 45, 55, 30, 60] * 10,
            'backspace_count': [1, 2, 1, 5, 0] * 10,
            'avg_dwell_time_ms': [100, 110, 95, 150, 90] * 10,
            'avg_flight_time_ms': [200, 210, 190, 300, 180] * 10,
            'mouse_distance_px': [500, 600, 400, 800, 300] * 10,
            'timestamp': pd.date_range('2026-02-28', periods=50, freq='H'),
        })

        # Engineer features
        features, baselines = engineer_features(sample_data)
        self.assertEqual(len(features), len(sample_data))
        self.assertFalse(features.isnull().any().any())

        # Make heuristic prediction
        predictor = FatiguePredictor(profile_id=1)
        result = predictor.predict_heuristic_fallback(sample_data.iloc[-10:])
        self.assertIn('prediction', result)
        self.assertGreaterEqual(result['prediction'], 0)
        self.assertLessEqual(result['prediction'], 100)


if __name__ == '__main__':
    unittest.main()
