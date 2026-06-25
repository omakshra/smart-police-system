# evaluate_model.py
import os
import joblib
import pandas as pd
import numpy as np
from sklearn.metrics import r2_score, accuracy_score, classification_report
from sklearn.preprocessing import LabelEncoder
from dotenv import load_dotenv

load_dotenv()

# --- Paths (adjust if needed) ---
MODELS_DIR = os.getenv("MODELS_DIR", "./models")
MODEL_PATH = os.path.join(MODELS_DIR, os.getenv("MODEL_FILENAME", "hotspot_xgb_model.pkl"))
STATE_ENCODER_PATH = os.path.join(MODELS_DIR, os.getenv("STATE_ENCODER", "state_encoder.pkl"))
DIST_ENCODER_PATH = os.path.join(MODELS_DIR, os.getenv("DIST_ENCODER", "district_encoder.pkl"))
CRIME_COLUMNS_PATH = os.path.join(MODELS_DIR, os.getenv("CRIME_COLUMNS", "crime_columns.pkl"))
HOTSPOT_MODEL_PATH = os.path.join(MODELS_DIR, "hotspot_model.pkl")

CSV_FILES = [
    "./datasets/01_District_wise_crimes_committed_IPC_2001_2012.csv",
    "./datasets/01_District_wise_crimes_committed_IPC_2013.csv",
    "./datasets/01_District_wise_crimes_committed_IPC_2014.csv",
]

# --- Helper to read CSVs ---
def _read_and_clean_csvs(csv_files):
    dfs = []
    for f in csv_files:
        if not os.path.exists(f):
            print(f"⚠️ CSV not found: {f}")
            continue
        df = pd.read_csv(f, encoding='utf-8', low_memory=False)
        df.columns = df.columns.str.strip().str.replace('\ufeff', '')

        # Detect STATE/DISTRICT
        state_col = [c for c in df.columns if "STATE" in c.upper() or "UT" in c.upper()]
        district_col = [c for c in df.columns if "DISTRICT" in c.upper()]
        state_col = state_col[0] if state_col else df.columns[0]
        district_col = district_col[0] if district_col else df.columns[1]

        df[state_col] = df[state_col].astype(str).str.strip()
        df[district_col] = df[district_col].astype(str).str.strip()
        df = df.rename(columns={state_col: "STATE", district_col: "DISTRICT"})

        # Ensure YEAR
        if 'YEAR' not in df.columns:
            year_cols = [c for c in df.columns if 'YEAR' in c.upper()]
            if year_cols:
                df = df.rename(columns={year_cols[0]: 'YEAR'})
            else:
                print(f"⚠️ Skipping CSV (no YEAR): {f}")
                continue

        # Convert numeric crime columns
        crime_cols = [c for c in df.columns if c not in ('STATE','DISTRICT','YEAR')]
        for col in crime_cols:
            df[col] = pd.to_numeric(df[col].astype(str).str.replace(',', ''), errors='coerce').fillna(0)

        dfs.append(df)

    if not dfs:
        raise FileNotFoundError("No valid CSVs found.")
    combined = pd.concat(dfs, ignore_index=True)
    combined['STATE'] = combined['STATE'].astype(str).str.strip()
    combined['DISTRICT'] = combined['DISTRICT'].astype(str).str.strip()
    return combined

# --- Load CSV data ---
df = _read_and_clean_csvs(CSV_FILES)
print(f"Loaded {len(df)} rows, {len(df.columns)} columns.")

# --- Load models & encoders ---
_model = joblib.load(MODEL_PATH)
_state_encoder = joblib.load(STATE_ENCODER_PATH)
_district_encoder = joblib.load(DIST_ENCODER_PATH)
_crime_columns = joblib.load(CRIME_COLUMNS_PATH)
hotspot_clf = joblib.load(HOTSPOT_MODEL_PATH)

# --- Filter valid crime columns (exist in CSV & not all zeros) ---
valid_crime_cols = [c for c in _crime_columns if c in df.columns and df[c].sum() > 0]

if len(valid_crime_cols) == 0:
    raise ValueError("No valid crime columns found in CSV that match model columns.")

# --- Encode categorical columns ---
state_codes = _state_encoder.transform(df['STATE'])
district_codes = _district_encoder.transform(df['DISTRICT'])
X = pd.DataFrame({
    'state_code': state_codes,
    'district_code': district_codes,
    'YEAR': df['YEAR'].astype(int)
})

# --- Prepare Y for evaluation ---
Y = df[valid_crime_cols].astype(float).fillna(0)
Y_log = np.log1p(Y)

# --- Make predictions safely aligned with valid columns ---
preds_log = _model.predict(X)
preds = np.expm1(preds_log).clip(min=0)

# Ensure number of columns matches valid_crime_cols
if preds.shape[1] > len(valid_crime_cols):
    preds = preds[:, :len(valid_crime_cols)]
elif preds.shape[1] < len(valid_crime_cols):
    # pad with zeros if model outputs fewer columns (rare)
    padding = np.zeros((preds.shape[0], len(valid_crime_cols) - preds.shape[1]))
    preds = np.hstack([preds, padding])

preds = pd.DataFrame(preds, columns=valid_crime_cols).fillna(0)

# --- Crime prediction R² ---
r2s = r2_score(Y, preds, multioutput='raw_values')
print("\n📊 Crime prediction R² scores:")
for col, r2 in zip(valid_crime_cols, r2s):
    print(f"{col}: {r2:.2f}")

# Optional: overall R²
overall_r2 = r2_score(Y.values.flatten(), preds.values.flatten())
print(f"\n✅ Overall R² across all crimes: {overall_r2:.2f}")

# --- Hotspot classifier evaluation ---
df['total_crimes'] = df[valid_crime_cols].sum(axis=1)
X_hotspot = pd.DataFrame({
    'state_code': state_codes,
    'district_code': district_codes,
    'YEAR': df['YEAR'].astype(int),
    'total_crimes': df['total_crimes']
})
y_hotspot = (df['total_crimes'] >= df['total_crimes'].quantile(0.75)).astype(int)

y_pred_h = hotspot_clf.predict(X_hotspot)
acc_h = accuracy_score(y_hotspot, y_pred_h)
print(f"\n🔥 Hotspot classifier accuracy: {acc_h:.2f}")
print(classification_report(y_hotspot, y_pred_h))
