"""
Forecasting module for fatigue predictions.
Uses ARIMA and Holt-Winters for time-series forecasting.
"""

import sqlite3
import pandas as pd
import numpy as np
import json
import warnings

# Suppress statsmodels warnings
warnings.filterwarnings('ignore')

try:
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    STATSMODELS_AVAILABLE = True
except ImportError:
    STATSMODELS_AVAILABLE = False


class FatigueForecaster:
    """
    Generates future fatigue predictions using time-series models.
    """

    def __init__(self, profile_id, db_path):
        """
        Initialize forecaster.

        Args:
            profile_id: User profile ID
            db_path: Path to SQLite database
        """
        self.profile_id = profile_id
        self.db_path = db_path

    def load_fatigue_history(self, limit=100):
        """
        Load historical fatigue feedback from database.

        Args:
            limit: Maximum number of recent entries to load

        Returns:
            Dataframe with timestamp and reported_fatigue_1_10
        """
        try:
            conn = sqlite3.connect(self.db_path)
            query = """
                SELECT timestamp, reported_fatigue_1_10
                FROM fatigue_feedback
                WHERE profile_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
            """
            df = pd.read_sql_query(query, conn, params=(self.profile_id, limit))
            conn.close()

            if len(df) == 0:
                return None

            # Reverse to chronological order
            df = df.iloc[::-1].reset_index(drop=True)
            df['timestamp'] = pd.to_datetime(df['timestamp'])
            df['fatigue_100'] = df['reported_fatigue_1_10'] * 10  # Convert 1-10 to 0-100

            return df

        except Exception as e:
            # 🚨 CRITICAL: Send to stderr, NOT stdout
            import sys
            print(f"Error loading fatigue history: {e}", file=sys.stderr)
            sys.stderr.flush()
            return None

    def forecast_arima(self, fatigue_series, steps=3, order=(1, 1, 1)):
        """
        Generate forecast using ARIMA model.

        Args:
            fatigue_series: Pandas Series of fatigue values (100-point scale)
            steps: Number of steps ahead to forecast (default 3)
            order: ARIMA order (p, d, q)

        Returns:
            Dict with forecast and confidence intervals, or None if failed
        """
        if not STATSMODELS_AVAILABLE:
            return None

        try:
            if len(fatigue_series) < 5:
                return None

            # Fit ARIMA
            model = ARIMA(fatigue_series, order=order)
            results = model.fit()

            # Generate forecast
            forecast = results.get_forecast(steps=steps)
            forecast_df = forecast.summary_frame()

            # Format output
            predictions = []
            for i in range(steps):
                pred = {
                    'step': i + 1,
                    'forecast': round(float(forecast_df['mean'].iloc[i]), 1),
                    'ci_lower': round(float(forecast_df['mean_ci_lower'].iloc[i]), 1),
                    'ci_upper': round(float(forecast_df['mean_ci_upper'].iloc[i]), 1),
                }
                # Clip to valid range
                pred['forecast'] = max(0, min(100, pred['forecast']))
                pred['ci_lower'] = max(0, min(100, pred['ci_lower']))
                pred['ci_upper'] = max(0, min(100, pred['ci_upper']))
                predictions.append(pred)

            return {
                'method': 'ARIMA',
                'predictions': predictions,
            }

        except Exception as e:
            # 🚨 CRITICAL: Send to stderr, NOT stdout (stdout must be valid JSON)
            import sys
            print(f"ARIMA forecasting failed: {e}", file=sys.stderr)
            sys.stderr.flush()
            return None

    def forecast_holt_winters(self, fatigue_series, steps=3):
        """
        Generate forecast using Holt-Winters exponential smoothing.

        Useful when ARIMA fails or data has seasonal patterns.

        Args:
            fatigue_series: Pandas Series of fatigue values
            steps: Number of steps ahead

        Returns:
            Dict with forecast and confidence, or None if failed
        """
        if not STATSMODELS_AVAILABLE:
            return None

        try:
            if len(fatigue_series) < 4:
                return None

            # Fit Holt-Winters (additive trend, no seasonality for short series)
            model = ExponentialSmoothing(
                fatigue_series,
                trend='add',
                seasonal=None
            )
            results = model.fit(optimized=True)

            # Forecast using correct method for HoltWinters
            try:
                # Try new API: get_forecast()
                forecast = results.get_forecast(steps=steps)
                forecast_df = forecast.summary_frame()
            except (AttributeError, TypeError):
                # Fall back to forecast() method for older statsmodels
                forecast_values = results.forecast(steps=steps)
                # Create simple forecast frame without confidence intervals
                forecast_df = pd.DataFrame({
                    'mean': forecast_values,
                    'mean_ci_lower': forecast_values - 10,  # Simple CI estimate
                    'mean_ci_upper': forecast_values + 10,
                })

            predictions = []
            for i in range(steps):
                pred = {
                    'step': i + 1,
                    'forecast': round(float(forecast_df['mean'].iloc[i]), 1),
                    'ci_lower': round(float(forecast_df['mean_ci_lower'].iloc[i]), 1),
                    'ci_upper': round(float(forecast_df['mean_ci_upper'].iloc[i]), 1),
                }
                pred['forecast'] = max(0, min(100, pred['forecast']))
                pred['ci_lower'] = max(0, min(100, pred['ci_lower']))
                pred['ci_upper'] = max(0, min(100, pred['ci_upper']))
                predictions.append(pred)

            return {
                'method': 'Holt-Winters',
                'predictions': predictions,
            }

        except Exception as e:
            # 🚨 CRITICAL: Send to stderr, NOT stdout (stdout must be valid JSON)
            import sys
            print(f"Holt-Winters forecasting failed: {e}", file=sys.stderr)
            sys.stderr.flush()
            return None

    def forecast_naive(self, fatigue_series, steps=3):
        """
        Simple naive forecast: assume recent trend continues.

        Fallback when statistical models fail.

        Args:
            fatigue_series: Pandas Series of fatigue values
            steps: Number of steps to forecast

        Returns:
            Dict with naive forecast
        """
        if len(fatigue_series) < 2:
            # Constant forecast
            current = fatigue_series.iloc[-1] if len(fatigue_series) > 0 else 50
            return {
                'method': 'Constant',
                'predictions': [
                    {
                        'step': i + 1,
                        'forecast': round(current, 1),
                        'ci_lower': round(max(0, current - 10), 1),
                        'ci_upper': round(min(100, current + 10), 1),
                    }
                    for i in range(steps)
                ],
            }

        # Compute trend from recent data
        recent_n = min(5, len(fatigue_series))
        recent = fatigue_series.iloc[-recent_n:]
        trend = (recent.iloc[-1] - recent.iloc[0]) / (recent_n - 1)

        predictions = []
        current = fatigue_series.iloc[-1]

        for i in range(steps):
            forecast_val = current + trend * (i + 1)
            forecast_val = max(0, min(100, forecast_val))

            pred = {
                'step': i + 1,
                'forecast': round(forecast_val, 1),
                'ci_lower': round(max(0, forecast_val - 15), 1),
                'ci_upper': round(min(100, forecast_val + 15), 1),
            }
            predictions.append(pred)

        return {
            'method': 'Naive Trend',
            'predictions': predictions,
        }

    def forecast(self, steps=3):
        """
        Main forecasting function: tries ARIMA, falls back to simpler methods.

        Args:
            steps: Number of forecast steps (default 3)

        Returns:
            Dict with forecast predictions and method used
        """
        # Load history
        history_df = self.load_fatigue_history(limit=100)

        if history_df is None or len(history_df) == 0:
            return None

        fatigue_series = history_df['fatigue_100']

        # Try ARIMA first (lowered threshold for quicker dev feedback)
        # previously required >=10 history points; now allow as few as 3
        if len(fatigue_series) >= 3:
            result = self.forecast_arima(fatigue_series, steps=steps)
            if result:
                return result

        # Try Holt-Winters (was 4)
        if len(fatigue_series) >= 2:
            result = self.forecast_holt_winters(fatigue_series, steps=steps)
            if result:
                return result

        # Fallback to naive forecast
        return self.forecast_naive(fatigue_series, steps=steps)


def forecast_fatigue(profile_id, db_path, steps=3):
    """
    Convenience function to generate fatigue forecast.

    Args:
        profile_id: User profile ID
        db_path: Path to SQLite database
        steps: Number of forecast steps

    Returns:
        Dict with forecast predictions
    """
    forecaster = FatigueForecaster(profile_id, db_path)
    return forecaster.forecast(steps=steps)
