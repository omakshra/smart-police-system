# hotspot_ml.py
import os
import io
import glob
from dotenv import load_dotenv
import joblib
import numpy as np
import pandas as pd

# fastapi
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

# ML
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.multioutput import MultiOutputRegressor
from xgboost import XGBRegressor

# plotting (for chart option)
import matplotlib
matplotlib.use("Agg")  # headless backend
import matplotlib.pyplot as plt

load_dotenv()

# --- Config / paths (use .env to override) ---
CSV_FILES_ENV = os.getenv("CSV_FILES")  # comma-separated paths
if CSV_FILES_ENV:
    CSV_FILES = [p.strip() for p in CSV_FILES_ENV.split(",")]
else:
    # default relative paths (adjust if needed)
    CSV_FILES = [
        "./datasets/01_District_wise_crimes_committed_IPC_2001_2012.csv",
        "./datasets/01_District_wise_crimes_committed_IPC_2013.csv",
        "./datasets/01_District_wise_crimes_committed_IPC_2014.csv",
    ]

MODELS_DIR = os.getenv("MODELS_DIR", "./models")
MODEL_PATH = os.path.join(MODELS_DIR, os.getenv("MODEL_FILENAME", "hotspot_xgb_model.pkl"))
STATE_ENCODER_PATH = os.path.join(MODELS_DIR, os.getenv("STATE_ENCODER", "state_encoder.pkl"))
DIST_ENCODER_PATH = os.path.join(MODELS_DIR, os.getenv("DIST_ENCODER", "district_encoder.pkl"))
CRIME_COLUMNS_PATH = os.path.join(MODELS_DIR, os.getenv("CRIME_COLUMNS", "crime_columns.pkl"))

os.makedirs(MODELS_DIR, exist_ok=True)

# --- FastAPI app ---
app = FastAPI(title="Crime Distribution Prediction (XGBoost)")

# Globals (populated by load_or_train)
_model = None
_state_encoder = None
_district_encoder = None
_crime_columns = None
_data_df = None  # used for /states and /districts endpoints

class DistributionRequest(BaseModel):
    state: str
    district: str
    year: int

def _read_and_clean_csvs(csv_files):
    dfs = []
    for f in csv_files:
        if not os.path.exists(f):
            continue
        df = pd.read_csv(f, encoding='utf-8', low_memory=False)
        # cleanup column names (strip BOM/whitespace)
        df.columns = df.columns.str.strip().str.replace('\ufeff', '')
        # find state/district column names
        state_col = [c for c in df.columns if "STATE" in c.upper() and ("UT" in c.upper() or True)]
        district_col = [c for c in df.columns if "DISTRICT" in c.upper()]
        # fallback: first two columns if detection fails
        if not state_col or not district_col:
            # try common names
            candidates = [c for c in df.columns if c.upper().startswith("STATE") or c.upper().startswith("UT")]
            state_col = [candidates[0]] if candidates else [df.columns[0]]
            district_col = [c for c in df.columns if "DISTRICT" in c.upper()] or [df.columns[1]]
        state_col = state_col[0]
        district_col = district_col[0]

        # strip whitespace in names
        if df[state_col].dtype == object:
            df[state_col] = df[state_col].str.strip()
        if df[district_col].dtype == object:
            df[district_col] = df[district_col].str.strip()

        # rename to canonical columns
        df = df.rename(columns={state_col: "STATE", district_col: "DISTRICT"})
        # Ensure YEAR exists
        if 'YEAR' not in df.columns:
            # attempt to find a YEAR-like column
            year_cols = [c for c in df.columns if 'YEAR' in c.upper()]
            if year_cols:
                df = df.rename(columns={year_cols[0]: 'YEAR'})
            else:
                # skip files missing YEAR
                continue

        # Identify crime columns (everything except STATE, DISTRICT, YEAR)
        # Convert numeric columns to numerics, fill NA with 0 for counts
        crime_cols = [c for c in df.columns if c not in ('STATE','DISTRICT','YEAR')]
        for col in crime_cols:
            df[col] = pd.to_numeric(df[col].astype(str).str.replace(',', ''), errors='coerce').fillna(0)
        dfs.append(df)
    if not dfs:
        raise FileNotFoundError("No CSV files found. Check CSV_FILES paths or datasets folder.")
    combined = pd.concat(dfs, ignore_index=True)
    # normalize state/district cases
    combined['STATE'] = combined['STATE'].astype(str).str.strip()
    combined['DISTRICT'] = combined['DISTRICT'].astype(str).str.strip()
    return combined

def load_or_train_model(force_retrain=False):
    """
    Loads the saved XGBoost crime prediction model and encoders,
    or trains a new one along with a hotspot classifier.
    """
    global _model, _state_encoder, _district_encoder, _crime_columns, _data_df

    # If already loaded and not forcing retrain
    if _model is not None and not force_retrain:
        return

    # Load from disk if exists and not forcing retrain
    if (
        os.path.exists(MODEL_PATH)
        and os.path.exists(STATE_ENCODER_PATH)
        and os.path.exists(DIST_ENCODER_PATH)
        and os.path.exists(CRIME_COLUMNS_PATH)
        and not force_retrain
    ):
        _model = joblib.load(MODEL_PATH)
        _state_encoder = joblib.load(STATE_ENCODER_PATH)
        _district_encoder = joblib.load(DIST_ENCODER_PATH)
        _crime_columns = joblib.load(CRIME_COLUMNS_PATH)

        try:
            _data_df = _read_and_clean_csvs(CSV_FILES)
        except Exception:
            _data_df = None
        print("Loaded saved model and encoders.")
        return

    # ------------------------------
    # Train a new model
    # ------------------------------
    print("Training model from CSVs...")
    df = _read_and_clean_csvs(CSV_FILES)
    _data_df = df.copy()

    # ------------------------------
    # Data preprocessing
    # ------------------------------
    crime_columns = [c for c in df.columns if c not in ('STATE', 'DISTRICT', 'YEAR')]
    df[crime_columns] = df[crime_columns].fillna(0)

    # Recalculate total crimes
    df['total_crimes'] = df[crime_columns].sum(axis=1)
    df = df.dropna(subset=['total_crimes'])

    # Create hotspot label
    threshold = df['total_crimes'].quantile(0.75)
    df['hotspot'] = (df['total_crimes'] >= threshold).astype(int)
    df = df.dropna(subset=['hotspot'])

    # ------------------------------
    # Encode categorical columns
    # ------------------------------
    _state_encoder = LabelEncoder()
    _district_encoder = LabelEncoder()
    df['state_code'] = _state_encoder.fit_transform(df['STATE'])
    df['district_code'] = _district_encoder.fit_transform(df['DISTRICT'])

    # Save encoders
    joblib.dump(_state_encoder, STATE_ENCODER_PATH)
    joblib.dump(_district_encoder, DIST_ENCODER_PATH)

    # Determine crime columns (preserve order)
    cols = [c for c in df.columns if c not in ('STATE', 'DISTRICT', 'YEAR')]
    _crime_columns = cols
    joblib.dump(_crime_columns, CRIME_COLUMNS_PATH)

    # ------------------------------
    # Train main XGBoost multi-output regressor
    # ------------------------------
    X = df[['state_code', 'district_code', 'YEAR']].astype(int)
    Y = df[cols].astype(float)

    Y_log = np.log1p(Y)  # stabilize wide ranges

    X_train, X_test, y_train, y_test = train_test_split(X, Y_log, test_size=0.2, random_state=42)

    base = XGBRegressor(
        n_estimators=200,
        max_depth=6,
        objective='reg:squarederror',
        random_state=42,
        verbosity=0,
        n_jobs=-1
    )
    model = MultiOutputRegressor(base, n_jobs=-1)
    model.fit(X_train, y_train)

    # Evaluate RMSE
    preds_log = model.predict(X_test)
    preds = np.expm1(preds_log).clip(min=0)
    y_test_orig = np.expm1(y_test)
    rmses = np.sqrt(np.mean((preds - y_test_orig.values) ** 2, axis=0))
    for col, rmse in zip(cols, rmses):
        print(f"RMSE for {col}: {rmse:.2f}")

    # Save the main model
    joblib.dump(model, MODEL_PATH)
    _model = model
    print("✅ Crime prediction model trained and saved.")

    # ------------------------------
    # Train hotspot classifier
    # ------------------------------
    from sklearn.ensemble import RandomForestClassifier

    hotspot_features = ['state_code', 'district_code', 'YEAR', 'total_crimes']
    X_hotspot = df[hotspot_features]
    y_hotspot = df['hotspot']

    hotspot_clf = RandomForestClassifier(
        n_estimators=150,
        random_state=42,
        class_weight='balanced'
    )
    hotspot_clf.fit(X_hotspot, y_hotspot)

    HOTSPOT_MODEL_PATH = os.path.join(MODELS_DIR, "hotspot_model.pkl")
    joblib.dump(hotspot_clf, HOTSPOT_MODEL_PATH)
    print("🔥 Hotspot classifier trained and saved.")

# Load or train on startup (set force_retrain=True to retrain)
load_or_train_model(force_retrain=False)

# -------------------------
# API endpoints
# -------------------------
@app.get("/crime_types")
def crime_types():
    if _crime_columns is None:
        raise HTTPException(status_code=500, detail="Crime columns not loaded.")
    return {"crime_types": _crime_columns}

@app.get("/states")
def get_states():
    if _data_df is None:
        raise HTTPException(status_code=500, detail="Data not loaded.")
    return sorted(_data_df['STATE'].unique().tolist())

@app.get("/districts/{state}")
def get_districts(state: str):
    if _data_df is None:
        raise HTTPException(status_code=500, detail="Data not loaded.")
    return sorted(_data_df[_data_df['STATE'] == state]['DISTRICT'].unique().tolist())

@app.post("/predict_distribution")
def predict_distribution(req: DistributionRequest, as_chart: bool = Query(False, description="If true, returns a PNG pie chart")):
    """
    Predict crime counts and percentages for a given state/district/year.
    If as_chart=true returns image/png (pie chart). Otherwise returns JSON:
    {
      "predicted_counts": { crime_col: count, ... },
      "percentages": { crime_col: percentage, ... }
    }
    """
    if _model is None:
        raise HTTPException(status_code=500, detail="Model not loaded.")

    # encode state/district
    try:
        state_code = _state_encoder.transform([req.state])[0]
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown state '{req.state}'. Check /states or retrain with new data.")

    try:
        district_code = _district_encoder.transform([req.district])[0]
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown district '{req.district}' for state '{req.state}'. Check /districts/{req.state} or retrain with new data.")

    X_new = pd.DataFrame([[state_code, district_code, int(req.year)]], columns=['state_code','district_code','YEAR'])
    pred_log = _model.predict(X_new)  # shape (1, n_targets) in log-space
    pred_counts = np.expm1(pred_log).flatten()
    # clamp negatives to zero and round to integers
    pred_counts = np.clip(pred_counts, 0, None)
    pred_counts = np.round(pred_counts).astype(int)

    result_counts = {col: int(cnt) for col, cnt in zip(_crime_columns, pred_counts)}
    total = float(pred_counts.sum())
    if total <= 0:
        # If model predicts zeros (rare), return zeros percentages
        percentages = {col: 0.0 for col in _crime_columns}
    else:
        percentages = {col: float(np.round((cnt / total) * 100, 2)) for col, cnt in zip(_crime_columns, pred_counts)}

    if as_chart:
        # Build a pie chart image (bytes)
        labels = _crime_columns
        sizes = [percentages[c] for c in labels]
        # Only show labels for top N slices for readability or all if few
        fig, ax = plt.subplots(figsize=(8, 6))
        # Matplotlib pie - do not specify colors
        ax.pie(sizes, labels=labels, autopct=lambda p: ('%1.1f%%' % p) if p > 0 else '')
        ax.set_title(f"Crime distribution for {req.district}, {req.state} ({req.year})")
        buf = io.BytesIO()
        plt.tight_layout()
        fig.savefig(buf, format='png')
        plt.close(fig)
        buf.seek(0)
        return StreamingResponse(buf, media_type="image/png")

    return {
        "state": req.state,
        "district": req.district,
        "year": req.year,
        "predicted_counts": result_counts,
        "percentages": percentages,
        "total_predicted_crimes": int(total)
    }

@app.post("/retrain")
def retrain_model(force: bool = Query(False, description="Force retrain even if model exists")):
    """
    Retrain the model from CSV files and overwrite saved model.
    Use with caution (long-running).
    """
    try:
        load_or_train_model(force_retrain=True)
        return JSONResponse({"detail": "Retraining completed."})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Retraining failed: {e}")
