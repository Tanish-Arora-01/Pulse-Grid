"""
Training pipeline for the fatigue detection model.
Handles model training, validation, calibration, and persistence.
"""

import sqlite3
import pandas as pd
import numpy as np
import json
import joblib
from datetime import datetime
import os
from pathlib import Path

from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from xgboost import XGBRegressor
from sklearn.calibration import IsotonicRegression
from sklearn.compose import TransformedTargetRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error

from features import engineer_features


def sigmoid(x):
    """Sigmoid function for target transformation: sigmoid(x) = 1 / (1 + exp(-x))"""
    return 1.0 / (1.0 + np.exp(-np.clip(x, -500, 500)))  # Clip to prevent overflow


def inverse_sigmoid(y):
    """Inverse sigmoid (logit) function: logit(y) = log(y / (1 - y))"""
    y = np.clip(y, 1e-7, 1 - 1e-7)  # Prevent log(0) and log(inf)
    return np.log(y / (1.0 - y))


class FatigueModelTrainer:
    """
    Handles complete training pipeline for fatigue detection models.
    """

    def __init__(self, profile_id, db_path, model_dir=None):
        """
        Initialize trainer.

        Args:
            profile_id: User profile ID
            db_path: Path to SQLite database
            model_dir: Directory to store models (defaults to ./models/{profile_id}/)
        """
        self.profile_id = profile_id
        self.db_path = db_path
        self.model_dir = model_dir or os.path.join(
            os.path.dirname(__file__), "models", str(profile_id)
        )
        Path(self.model_dir).mkdir(parents=True, exist_ok=True)

        self.scaler = None
        self.model = None
        self.calibrator = None
        self.baselines = None
        self.metrics = None
        self.feature_names = None

    # NOTE: the default value here can be lowered for development/testing.
    # production uses a higher threshold to avoid over‑fitting on very little feedback.
    def load_training_data(self, min_samples=5):
        """
        Load and join session_logs with fatigue_feedback from database.

        Args:
            min_samples: Minimum number of labeled samples required

        Returns:
            Tuple of (X_features, y_labels) or (None, None) if insufficient data
        """
        try:
            conn = sqlite3.connect(self.db_path)

            # Load feedback labels
            feedback_query = """
                SELECT timestamp, reported_fatigue_1_10
                FROM fatigue_feedback
                WHERE profile_id = ?
                ORDER BY timestamp
            """
            feedback_df = pd.read_sql_query(feedback_query, conn, params=(self.profile_id,))

            if len(feedback_df) < min_samples:
                print(f"Insufficient training data: {len(feedback_df)} labels < {min_samples} required")
                conn.close()
                return None, None

            # Load session logs
            logs_query = """
                SELECT timestamp, typing_velocity, backspace_count,
                       avg_dwell_time_ms, avg_flight_time_ms, mouse_distance_px
                FROM session_logs
                WHERE profile_id = ?
                ORDER BY timestamp DESC
                LIMIT 500
            """
            logs_df = pd.read_sql_query(logs_query, conn, params=(self.profile_id,))
            conn.close()

            if len(logs_df) == 0:
                return None, None

            # Reverse to chronological order
            logs_df = logs_df.iloc[::-1].reset_index(drop=True)

            # Match feedback to session logs (find closest timestamp within ±5 minutes)
            labels = []
            labeled_indices = []

            for _, feedback_row in feedback_df.iterrows():
                feedback_time = pd.to_datetime(feedback_row['timestamp'])
                # Find closest session log entry within ±5 minutes
                time_diffs = (logs_df['timestamp'].apply(pd.to_datetime) - feedback_time).abs()
                closest_idx = time_diffs.idxmin()
                closest_diff = time_diffs.iloc[closest_idx]

                if closest_diff <= pd.Timedelta(minutes=5):
                    labeled_indices.append(closest_idx)
                    labels.append(feedback_row['reported_fatigue_1_10'] * 10)  # Convert 1-10 to 10-100 scale

            if len(labels) < min_samples:
                return None, None

            # Extract training data
            logs_labeled = logs_df.iloc[labeled_indices].reset_index(drop=True)
            labels = np.array(labels)

            return logs_labeled, labels

        except Exception as e:
            import traceback
            print(f"Error loading training data: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return None, None

    def train(self, min_samples=50, val_size=0.1, test_size=0.1):
        """
        Complete training pipeline: load data, engineer features, train model, calibrate.

        Uses TransformedTargetRegressor with sigmoid transformation to mathematically
        constrain predictions to [0, 1] range before scaling to percentages.

        Args:
            min_samples: Minimum labeled samples required
            val_size: Validation set fraction
            test_size: Test set fraction

        Returns:
            Dict with training results and metrics, or None if training failed
        """
        # Load training data
        X_raw, y = self.load_training_data(min_samples=min_samples)
        if X_raw is None or y is None:
            return None

        print(f"Loaded {len(X_raw)} labeled samples for profile {self.profile_id}")

        # Engineer features
        X_engineered, baselines = engineer_features(X_raw, baselines=None, include_lags=True)
        self.baselines = baselines
        self.feature_names = X_engineered.columns.tolist()

        # 🚨 TARGET SCALING: Convert 0-100 scale to 0-1 for sigmoid training
        y_scaled = y / 100.0  # Convert from [0, 100] to [0, 1]

        # Temporal train/val/test split (preserve time order)
        n = len(X_engineered)
        train_size_n = int(n * (1 - val_size - test_size))
        val_size_n = int(n * val_size)

        X_train = X_engineered.iloc[:train_size_n]
        y_train_scaled = y_scaled[:train_size_n]

        X_val = X_engineered.iloc[train_size_n:train_size_n + val_size_n]
        y_val_scaled = y_scaled[train_size_n:train_size_n + val_size_n]

        X_test = X_engineered.iloc[train_size_n + val_size_n:]
        y_test_scaled = y_scaled[train_size_n + val_size_n:]

        print(f"Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")

        # Normalize features
        self.scaler = StandardScaler()
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_val_scaled = self.scaler.transform(X_val)
        X_test_scaled = self.scaler.transform(X_test)

        # 🚨 TRANSFORMED TARGET REGRESSION: Use sigmoid to mathematically bound predictions
        # Train a regressor that predicts in [0, 1] space (via inverse_sigmoid transform)
        base_model = XGBRegressor(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42,
            verbosity=0
        )

        # TransformedTargetRegressor automatically applies inverse_sigmoid before training
        # and sigmoid after prediction, ensuring output is always in [0, 1]
        self.model = TransformedTargetRegressor(
            regressor=base_model,
            func=inverse_sigmoid,
            inverse_func=sigmoid
        )

        # Train the model with transformed targets
        self.model.fit(X_train_scaled, y_train_scaled)

        # Generate predictions for calibration (output will be in [0, 1])
        y_val_pred_sigmoid = self.model.predict(X_val_scaled)  # [0, 1] range
        y_val_pred_percent = y_val_pred_sigmoid * 100.0  # Scale to [0, 100]

        # Calibrate model using isotonic regression on validation set
        y_val_percent = y_val_scaled * 100.0
        self.calibrator = IsotonicRegression(out_of_bounds='clip')
        self.calibrator.fit(y_val_pred_percent, y_val_percent)

        # Evaluate on test set
        y_test_pred_sigmoid = self.model.predict(X_test_scaled)  # [0, 1] range
        y_test_pred_percent = y_test_pred_sigmoid * 100.0  # Scale to [0, 100]
        y_test_pred_calibrated = self.calibrator.transform(y_test_pred_percent)

        # 🚨 HARD CLAMPING: Final safety net (should be redundant due to sigmoid)
        y_test_pred_calibrated = np.clip(y_test_pred_calibrated, 0, 100)

        y_test_percent = y_test_scaled * 100.0
        mae = mean_absolute_error(y_test_percent, y_test_pred_calibrated)
        rmse = np.sqrt(mean_squared_error(y_test_percent, y_test_pred_calibrated))

        # Compute feature importance
        feature_importance = dict(zip(
            self.feature_names,
            self.model.regressor_.feature_importances_
        ))
        top_features = sorted(feature_importance.items(), key=lambda x: x[1], reverse=True)[:5]

        self.metrics = {
            'mae': float(mae),
            'rmse': float(rmse),
            'test_samples': len(X_test),
            'train_samples': len(X_train),
            'val_samples': len(X_val),
            'top_features': [{'name': name, 'importance': float(imp)} for name, imp in top_features],
            'model_type': 'xgboost_sigmoid_transformed',
        }

        print(f"Test MAE: {mae:.2f}, RMSE: {rmse:.2f}")
        print(f"Top features: {[name for name, _ in top_features]}")

        return self.metrics

    def save_model(self):
        """
        Persist model, scaler, calibrator, and metadata to disk.

        Returns:
            Path to saved model directory
        """
        if self.model is None:
            raise ValueError("No trained model to save")

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        version = f"xgboost_v{timestamp}"

        # Save model components
        joblib.dump(self.model, os.path.join(self.model_dir, f"model_{version}.pkl"))
        joblib.dump(self.scaler, os.path.join(self.model_dir, f"scaler_{version}.pkl"))
        joblib.dump(self.calibrator, os.path.join(self.model_dir, f"calibrator_{version}.pkl"))

        # Save metadata
        metadata = {
            'version': version,
            'timestamp': timestamp,
            'metrics': self.metrics,
            'baselines': self.baselines,
            'feature_names': self.feature_names,
        }

        with open(os.path.join(self.model_dir, f"metadata_{version}.json"), 'w') as f:
            json.dump(metadata, f, indent=2)

        # Update model_metadata table
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO model_metadata (profile_id, model_version, training_samples, model_type, metrics, active)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    self.profile_id,
                    version,
                    self.metrics.get('train_samples', 0),
                    'xgboost',
                    json.dumps(self.metrics),
                    1
                )
            )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Warning: Could not update model_metadata table: {e}")

        print(f"Model saved to {self.model_dir}/{version}")
        return self.model_dir

    def load_model(self, version=None):
        """
        Load latest model or specific version from disk.

        Args:
            version: Specific model version to load (e.g., 'xgboost_v20260228_120000')
                    If None, loads most recent

        Returns:
            True if successful, False otherwise
        """
        if version is None:
            # Find most recent model
            files = Path(self.model_dir).glob("model_*.pkl")
            if not files:
                return False
            latest_file = max(files, key=os.path.getctime)
            version = latest_file.stem.replace("model_", "")

        try:
            self.model = joblib.load(os.path.join(self.model_dir, f"model_{version}.pkl"))
            self.scaler = joblib.load(os.path.join(self.model_dir, f"scaler_{version}.pkl"))
            self.calibrator = joblib.load(os.path.join(self.model_dir, f"calibrator_{version}.pkl"))

            with open(os.path.join(self.model_dir, f"metadata_{version}.json"), 'r') as f:
                metadata = json.load(f)
                self.baselines = metadata.get('baselines')
                self.feature_names = metadata.get('feature_names')
                self.metrics = metadata.get('metrics')

            print(f"Loaded model version {version}")
            return True
        except Exception as e:
            print(f"Error loading model: {e}")
            return False


def train_and_save(profile_id, db_path, min_samples=50):
    """
    Convenience function to train and save model in one call.

    Args:
        profile_id: User profile ID
        db_path: Path to SQLite database
        min_samples: Minimum labeled samples required

    Returns:
        True if successful, False otherwise
    """
    trainer = FatigueModelTrainer(profile_id, db_path)
    metrics = trainer.train(min_samples=min_samples)

    if metrics is None:
        return False

    trainer.save_model()
    return True
