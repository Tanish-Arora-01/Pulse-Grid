"""
Feature engineering module for fatigue detection system.
Transforms raw HCI metrics into meaningful features for ML models.
"""

import pandas as pd
import numpy as np
from datetime import datetime


def clip_outliers(df, feature_col, n_std=3):
    """
    Clip outliers in a feature to prevent extreme values from skewing the model.

    Args:
        df: DataFrame containing the feature
        feature_col: Column name to clip
        n_std: Number of standard deviations to use as threshold (default 3)

    Returns:
        Series with outliers clipped
    """
    if feature_col not in df.columns:
        return df[feature_col].copy()

    values = pd.to_numeric(df[feature_col], errors='coerce').fillna(0)

    # Skip clipping if all values are 0
    if values.max() == 0:
        return values

    mean = values.mean()
    std = values.std()

    # Only clip if we have meaningful variation
    if std > 0:
        upper_bound = mean + (n_std * std)
        values = values.clip(upper=upper_bound)

    return values


def compute_micro_features(df):
    """
    Extract micro-level features per session_log entry.

    These are instantaneous measurements captured at minute-by-minute intervals.
    """
    micro_features = pd.DataFrame()

    # Ensure numeric types
    for col in ['typing_velocity', 'backspace_count', 'avg_dwell_time_ms',
                'avg_flight_time_ms', 'mouse_distance_px']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    # 🚨 OUTLIER CLIPPING: Cap typing velocity at 3σ above user mean to prevent ghost data
    typing_velocity_clipped = clip_outliers(df, 'typing_velocity', n_std=3)
    micro_features['typing_velocity'] = typing_velocity_clipped

    # Error rate: backspaces per estimated keystroke
    estimated_keys = np.maximum(typing_velocity_clipped * 5, 1)  # 5 keystrokes per word (rough)
    micro_features['error_rate'] = df['backspace_count'] / estimated_keys

    # Keystroke timing metrics
    micro_features['avg_dwell_time_ms'] = df['avg_dwell_time_ms']
    micro_features['avg_flight_time_ms'] = df['avg_flight_time_ms']

    # Mouse activity as distance per minute
    micro_features['mouse_distance_px'] = df['mouse_distance_px']

    return micro_features


def compute_meso_features(df, window_minutes=5):
    """
    Extract meso-level features computed over rolling windows.

    These capture trends and patterns at the 5-10 minute scale.
    """
    meso_features = pd.DataFrame()

    # Ensure numeric data from micro features
    wpm = pd.to_numeric(df['typing_velocity'], errors='coerce').fillna(0)
    error_rate = (df['backspace_count'] / np.maximum(df['typing_velocity'] * 5, 1)).fillna(0)
    dwell = pd.to_numeric(df['avg_dwell_time_ms'], errors='coerce').fillna(0)
    flight = pd.to_numeric(df['avg_flight_time_ms'], errors='coerce').fillna(0)

    # Rolling mean (smoothed trend)
    meso_features['wpm_rolling_mean'] = wpm.rolling(window=window_minutes, min_periods=1).mean()
    meso_features['error_rate_rolling_mean'] = error_rate.rolling(window=window_minutes, min_periods=1).mean()
    meso_features['dwell_rolling_mean'] = dwell.rolling(window=window_minutes, min_periods=1).mean()

    # Velocity slope (are they speeding up or slowing down?)
    meso_features['wpm_slope'] = wpm.rolling(window=window_minutes, min_periods=2).apply(
        lambda x: (x.iloc[-1] - x.iloc[0]) / max(len(x) - 1, 1) if len(x) > 1 else 0
    )

    # Error trend (getting worse or better?)
    meso_features['error_trend'] = error_rate.rolling(window=window_minutes, min_periods=2).apply(
        lambda x: (x.iloc[-1] - x.iloc[0]) / max(len(x) - 1, 1) if len(x) > 1 else 0
    )

    # Distraction index: ratio of mouse movement to typing activity
    mouse = pd.to_numeric(df['mouse_distance_px'], errors='coerce').fillna(0)
    meso_features['distraction_index'] = mouse / (wpm + 1)  # Avoid division by zero

    return meso_features


def compute_macro_features(df):
    """
    Extract macro-level features from session context.

    These include temporal patterns and session-level aggregates.
    """
    macro_features = pd.DataFrame()

    # Time-of-day features (captures circadian patterns)
    if 'timestamp' in df.columns:
        df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
        macro_features['hour_of_day'] = df['timestamp'].dt.hour
        macro_features['day_of_week'] = df['timestamp'].dt.dayofweek  # 0=Monday, 6=Sunday
        macro_features['is_evening'] = (df['timestamp'].dt.hour >= 18).astype(int)
        macro_features['is_morning'] = (df['timestamp'].dt.hour < 9).astype(int)
    else:
        macro_features['hour_of_day'] = 12
        macro_features['day_of_week'] = 0
        macro_features['is_evening'] = 0
        macro_features['is_morning'] = 0

    # Session-level statistics
    wpm = pd.to_numeric(df['typing_velocity'], errors='coerce').fillna(0)
    macro_features['session_avg_wpm'] = wpm.mean()
    macro_features['session_wpm_std'] = wpm.std()
    macro_features['session_duration_minutes'] = len(df)

    # Activity pauses (if typing drops to 0)
    activity_breaks = (wpm == 0).sum()
    macro_features['pause_count'] = activity_breaks

    return macro_features


def normalize_to_user_baseline(df, features_df, baselines):
    """
    Normalize features relative to user's historical baseline.

    This creates personalized z-scores that account for individual differences
    in typing speed, error rate, etc.

    Args:
        df: Raw session_logs dataframe (for baseline calculation if needed)
        features_df: Engineered features dataframe
        baselines: Dict with keys 'wpm_mean', 'wpm_std', 'error_rate_mean', etc.

    Returns:
        Normalized features dataframe
    """
    normalized = features_df.copy()

    # Z-score normalization for key metrics
    if baselines.get('wpm_std', 0) > 0:
        normalized['typing_velocity_zscore'] = (
            features_df['typing_velocity'] - baselines['wpm_mean']
        ) / baselines['wpm_std']
    else:
        normalized['typing_velocity_zscore'] = 0

    if baselines.get('error_rate_std', 0) > 0:
        normalized['error_rate_zscore'] = (
            features_df['error_rate'] - baselines['error_rate_mean']
        ) / baselines['error_rate_std']
    else:
        normalized['error_rate_zscore'] = 0

    # Dwell time ratio (relative to user's typical)
    if baselines.get('dwell_mean', 1) > 0:
        normalized['dwell_ratio'] = (
            features_df['avg_dwell_time_ms'] / baselines['dwell_mean']
        )
    else:
        normalized['dwell_ratio'] = 1.0

    # Flight time ratio
    if baselines.get('flight_mean', 1) > 0:
        normalized['flight_ratio'] = (
            features_df['avg_flight_time_ms'] / baselines['flight_mean']
        )
    else:
        normalized['flight_ratio'] = 1.0

    return normalized


def create_lag_features(df, lags=[1, 2, 5]):
    """
    Create lagged features to capture temporal dependencies.

    These features enable the model to learn from recent history.

    Args:
        df: Features dataframe
        lags: List of lag steps (1=previous row, 2=two rows back, etc.)

    Returns:
        Dataframe with lag features appended
    """
    lag_features = df.copy()

    # Create lags for key metrics
    for lag in lags:
        if 'typing_velocity' in df.columns:
            lag_features[f'typing_velocity_lag{lag}'] = df['typing_velocity'].shift(lag)
        if 'error_rate' in df.columns:
            lag_features[f'error_rate_lag{lag}'] = df['error_rate'].shift(lag)
        if 'wpm_rolling_mean' in df.columns:
            lag_features[f'wpm_rolling_mean_lag{lag}'] = df['wpm_rolling_mean'].shift(lag)

    # Fill NaN lags with forward fill then backward fill
    lag_features = lag_features.fillna(method='bfill').fillna(method='ffill').fillna(0)

    return lag_features


def engineer_features(session_logs_df, baselines=None, include_lags=True):
    """
    Complete feature engineering pipeline.

    Orchestrates micro/meso/macro feature extraction and normalization.

    Args:
        session_logs_df: Raw session_logs data from database
        baselines: User baseline dict (if None, computed from data)
        include_lags: Whether to include temporal lag features

    Returns:
        Engineered features dataframe ready for model training
    """
    # Compute micro features
    micro = compute_micro_features(session_logs_df.copy())

    # Compute meso features
    meso = compute_meso_features(session_logs_df.copy())

    # Compute macro features
    macro = compute_macro_features(session_logs_df.copy())

    # Combine all features
    engineered = pd.concat([micro, meso, macro], axis=1)

    # Compute baselines if not provided
    if baselines is None:
        baselines = {
            'wpm_mean': micro['typing_velocity'][micro['typing_velocity'] > 0].mean() or 40.0,
            'wpm_std': micro['typing_velocity'][micro['typing_velocity'] > 0].std() or 15.0,
            'error_rate_mean': micro['error_rate'][micro['error_rate'] > 0].mean() or 0.05,
            'error_rate_std': micro['error_rate'][micro['error_rate'] > 0].std() or 0.03,
            'dwell_mean': micro['avg_dwell_time_ms'][micro['avg_dwell_time_ms'] > 0].mean() or 100.0,
            'flight_mean': micro['avg_flight_time_ms'][micro['avg_flight_time_ms'] > 0].mean() or 200.0,
            'mouse_mean': micro['mouse_distance_px'][micro['mouse_distance_px'] > 0].mean() or 500.0,
        }

    # Normalize to user baseline
    engineered = normalize_to_user_baseline(session_logs_df, engineered, baselines)

    # Add lag features
    if include_lags:
        engineered = create_lag_features(engineered)

    # Remove any remaining NaN values
    engineered = engineered.fillna(0)

    return engineered, baselines
