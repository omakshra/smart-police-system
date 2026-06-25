# main.py
from hotspot_ml import _model, _state_encoder, _district_encoder, _crime_columns
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from supabase import create_client, Client
import os
import base64
from dotenv import load_dotenv
from utils import hash_password, verify_password, create_jwt
from jose import jwt, JWTError
from typing import Optional, List
from datetime import datetime
import pandas as pd
import numpy as np
import joblib
import matplotlib
matplotlib.use("Agg")  # prevents Tkinter errors
import matplotlib.pyplot as plt
import io

# -----------------------------
# Load environment variables
# -----------------------------
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# -----------------------------
# Load trained models and encoders
# -----------------------------
try:
    model = joblib.load("models/hotspot_model.pkl")
    state_encoder = joblib.load("models/state_encoder.pkl")
    district_encoder = joblib.load("models/district_encoder.pkl")
except Exception as e:
    raise RuntimeError(f"Failed to load model or encoders: {e}")

# -----------------------------
# Load CSVs and prepare dataset
# -----------------------------
CSV_FILES = [
    "datasets/01_District_wise_crimes_committed_IPC_2001_2012.csv",
    "datasets/01_District_wise_crimes_committed_IPC_2013.csv",
    "datasets/01_District_wise_crimes_committed_IPC_2014.csv"
]

# Read CSVs and concatenate
dfs = [pd.read_csv(f) for f in CSV_FILES]
_data_df = pd.concat(dfs, ignore_index=True)

# Standardize column names
_data_df = _data_df.rename(columns={'STATE/UT': 'STATE'})
if 'DISTRICT' not in _data_df.columns:
    # Rename if CSV uses another column name for districts
    _data_df = _data_df.rename(columns={'DISTRICT/NAME': 'DISTRICT'})

# Ensure YEAR column is numeric and drop invalid rows
_data_df['YEAR'] = pd.to_numeric(_data_df['YEAR'], errors='coerce')
_data_df = _data_df.dropna(subset=['YEAR'])
_data_df['YEAR'] = _data_df['YEAR'].astype(int)

# Identify crime columns (everything except STATE, DISTRICT, YEAR)
_crime_columns = [col for col in _data_df.columns if col not in ['STATE', 'DISTRICT', 'YEAR']]

# Ensure all crime columns are numeric and fill NaN with 0
for col in _crime_columns:
    _data_df[col] = pd.to_numeric(_data_df[col], errors='coerce').fillna(0).astype(int)

# -----------------------------
# Compute growth rates and max year per district
# -----------------------------
_growth_rates = {}
_max_year_per_district = {}

grouped = _data_df.groupby(['STATE', 'DISTRICT'])
for (state, district), df in grouped:
    df_sorted = df.sort_values('YEAR')
    
    # Max year
    _max_year_per_district[(state, district)] = df_sorted['YEAR'].max()
    
    # Initialize growth rates dict
    _growth_rates.setdefault(state, {})
    _growth_rates[state].setdefault(district, {})
    
    # Compute average yearly growth for each crime column
    for col in _crime_columns:
        vals = df_sorted[col].values
        rates = []
        for i in range(1, len(vals)):
            prev = vals[i-1]
            curr = vals[i]
            if prev == 0:
                rate = 0.0
            else:
                rate = (curr - prev) / prev
            rates.append(rate)
        _growth_rates[state][district][col] = np.mean(rates) if rates else 0.0

print("Dataset loaded, numeric columns cleaned, growth rates and max years computed.")

# -----------------------------
# FastAPI app & CORS
# -----------------------------
app = FastAPI(title="Smart Police Hotspot Prediction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Authentication dependency
# -----------------------------
def get_current_user(authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM]
        )

        print("JWT PAYLOAD:", payload)

        user_id = payload.get("sub")

        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid token payload"
            )

        return str(user_id)

    except Exception as e:
        print("JWT ERROR:", e)
        raise HTTPException(
            status_code=401,
            detail=f"Invalid token: {str(e)}"
        )
# -----------------------------
# Auth models
# -----------------------------
class LoginRequest(BaseModel):
    email: str
    password: str

class SignupRequest(BaseModel):
    email: str
    password: str
    name: str

# -----------------------------
# Auth endpoints
# -----------------------------
@app.post("/login")
def login(req: LoginRequest):
    response = supabase.table("users").select("*").eq("email", req.email).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="User not found")
    user = response.data[0]
    if not verify_password(req.password, user["password"]):
        raise HTTPException(status_code=401, detail="Incorrect password")
    token = create_jwt(user["id"])
    return {"id": user["id"], "email": user["email"], "name": user["name"], "token": token}

@app.post("/signup")
def signup(req: SignupRequest):
    response = supabase.table("users").select("*").eq("email", req.email).execute()
    if response.data:
        raise HTTPException(status_code=400, detail="User already exists")
    hashed_pw = hash_password(req.password)
    insert_resp = supabase.table("users").insert({
        "email": req.email,
        "password": hashed_pw,
        "name": req.name
    }).execute()
    if not insert_resp.data:
        raise HTTPException(status_code=500, detail="Failed to create user")
    user_id = insert_resp.data[0]["id"]
    token = create_jwt(user_id)
    return {"id": user_id, "email": req.email, "name": req.name, "token": token}

# -----------------------------
# Crime CRUD endpoints
# -----------------------------
class CrimeIn(BaseModel):
    category: str
    description: Optional[str] = ""
    date: Optional[str] = None
    latitude: float
    longitude: float
    grid_id: Optional[str] = None

@app.get("/crimes")
def list_crimes(q: Optional[str] = None,
                category: Optional[str] = None,
                date_from: Optional[str] = None,
                date_to: Optional[str] = None,
                current_user: str = Depends(get_current_user)):

    query = supabase.table("crimes").select("*").eq("user_id", current_user)
    if category:
        query = query.eq("category", category)
    if date_from:
        query = query.gte("date", date_from)
    if date_to:
        query = query.lte("date", date_to)
    resp = query.execute()
    data_resp = resp.data or []
    if q:
        data_resp = [c for c in data_resp if q.lower() in (c.get("description", "") + c.get("category", "")).lower()]
    return data_resp

@app.post("/crimes")
def create_crime(crime: CrimeIn, current_user: str = Depends(get_current_user)):
    if not crime.date:
        crime.date = datetime.utcnow().isoformat()
    payload = crime.dict()
    payload["user_id"] = current_user
    insert_resp = supabase.table("crimes").insert(payload).execute()
    if not insert_resp.data:
        raise HTTPException(status_code=500, detail="Failed to create crime")
    return insert_resp.data[0]

# -----------------------------
# Input models
# -----------------------------
class CrimeInput(BaseModel):
    state: str
    district: str
    year: int

class BulkCrimeInput(BaseModel):
    records: List[CrimeInput]
# Compute yearly growth rates for each district and crime
def compute_growth_rates():
    """
    Returns a dict of the form:
    growth_rates[state][district][crime] = avg yearly growth (float)
    """
    growth_rates = {}
    max_years = {}

    grouped = _data_df.groupby(['STATE', 'DISTRICT'])
    for (state, district), df in grouped:
        df_sorted = df.sort_values('YEAR')
        max_years[(state, district)] = df_sorted['YEAR'].max()
        growth_rates.setdefault(state, {})
        growth_rates[state].setdefault(district, {})
        for col in _crime_columns:
            # Compute year-to-year % change, avoid division by zero
            vals = df_sorted[col].values
            if len(vals) < 2:
                rate = 0.0
            else:
                rates = []
 
@app.post("/predict_crimes_combined")
def predict_crimes_combined(input_data: BulkCrimeInput):
    if _model is None:
        raise HTTPException(status_code=500, detail="Model not loaded.")

    MAX_YEARLY_GROWTH = 0.3
    MAX_CRIME_COUNT = 1_000_000

    df_input = pd.DataFrame([r.dict() for r in input_data.records])
    if df_input.empty:
        return JSONResponse({"predictions": [], "chart_base64": None})

    # Encode states & districts (fallback 0 if unknown)
    try:
        df_input["state_code"] = _state_encoder.transform(df_input["state"])
    except ValueError:
        df_input["state_code"] = 0
    try:
        df_input["district_code"] = _district_encoder.transform(df_input["district"])
    except ValueError:
        df_input["district_code"] = 0

    # Split into historical vs future
    df_input["max_year"] = df_input.apply(
        lambda row: _max_year_per_district.get((row["state"], row["district"]), row["year"]),
        axis=1
    )
    df_hist = df_input[df_input["year"] <= df_input["max_year"]].copy()
    df_future = df_input[df_input["year"] > df_input["max_year"]].copy()

    results_list = []

    # ---------- Historical years: batch predict ----------
    if not df_hist.empty:
        X_hist = df_hist[["state_code", "district_code", "year"]].rename(columns={"year": "YEAR"})
        pred_logs = _model.predict(X_hist)
        pred_counts_hist = np.expm1(pred_logs).clip(min=0).round().astype(int)

        for i, row in df_hist.iterrows():
            counts = {col: int(pred_counts_hist[i, j]) for j, col in enumerate(_crime_columns)}
            total = sum(counts.values())
            hotspot_score = 1 if total >= max(total * 0.5, 10) else 0
            results_list.append({
                "state": row["state"],
                "district": row["district"],
                "year": int(row["year"]),
                "predicted_counts": counts,
                "total_predicted_crimes": total,
                "hotspot": hotspot_score
            })

    # ---------- Future years: vectorized extrapolation ----------
    if not df_future.empty:
        for i, row in df_future.iterrows():
            state = row["state"]
            district = row["district"]
            years_diff = row["year"] - row["max_year"]

            hist_df = _data_df[
                (_data_df["STATE"] == state) & 
                (_data_df["DISTRICT"] == district) & 
                (_data_df["YEAR"] == row["max_year"])
            ]

            counts = {}
            for col in _crime_columns:
                last_val = int(hist_df.iloc[0][col]) if not hist_df.empty else 0
                growth = _growth_rates.get(state, {}).get(district, {}).get(col, 0.0)
                growth = max(min(growth, MAX_YEARLY_GROWTH), -0.9)
                counts[col] = min(max(int(round(last_val * ((1 + growth) ** years_diff))), 0), MAX_CRIME_COUNT)

            total = sum(counts.values())
            hotspot_score = 1 if total >= max(total * 0.5, 10) else 0

            results_list.append({
                "state": state,
                "district": district,
                "year": int(row["year"]),
                "predicted_counts": counts,
                "total_predicted_crimes": total,
                "hotspot": hotspot_score
            })

    # ---------- Optional chart for first record ----------
    chart_base64 = None
    if results_list:
        first = results_list[0]
        counts_chart = first["predicted_counts"]
        total_chart = sum(counts_chart.values())
        if counts_chart and total_chart > 0:
            import matplotlib.pyplot as plt
            import matplotlib.cm as cm
            import io, base64

            plt.figure(figsize=(8, 6))
            labels = list(counts_chart.keys())
            sizes = list(counts_chart.values())
            colors = cm.tab20.colors[:len(labels)]
            plt.pie(sizes, labels=None, autopct=lambda p: f'{p:.1f}%' if p >= 1 else '',
                    startangle=140, colors=colors, explode=[0.05]*len(labels), shadow=True, pctdistance=0.8,
                    textprops={'fontsize':10,'weight':'bold'})
            plt.legend(labels=[l.replace("_"," ") for l in labels], title="Crime Types",
                       loc="center left", bbox_to_anchor=(1,0,0.5,1), fontsize=10)
            plt.title(f"Crime distribution for {first['district']}, {first['state']} ({first['year']})",
                      fontsize=12, weight='bold')
            plt.tight_layout()
            buf = io.BytesIO()
            plt.savefig(buf, format='png', dpi=150)
            plt.close()
            buf.seek(0)
            chart_base64 = base64.b64encode(buf.read()).decode('utf-8')

    return JSONResponse({"predictions": results_list, "chart_base64": chart_base64})


# -----------------------------
# States & Districts endpoints
# -----------------------------
@app.get("/states")
def get_states():
    try:
        states = sorted(_data_df['STATE'].dropna().unique().tolist())
        return {"states": states}
    except Exception as e:
        return {"states": [], "error": str(e)}

@app.get("/districts/{state_name}")
def get_districts(state_name: str):
    try:
        districts = sorted(_data_df[_data_df['STATE'] == state_name]['DISTRICT'].dropna().unique().tolist())
        return {"districts": districts}
    except Exception as e:
        return {"districts": [], "error": str(e)}
# Add this right above or below your existing hotspot_trends_batch
@app.get("/hotspot_trends/{state}/{district}")
def hotspot_trends_alias(state: str, district: str):
    # Simply call the existing function
    return hotspot_trends_batch(state, district)

# -----------------------------
# Hotspot trends
# -----------------------------
@app.get("/hotspot_trends_batch/{state}/{district}")
def hotspot_trends_batch(state: str, district: str):
    years = sorted(_data_df["YEAR"].dropna().unique().tolist())
    max_year = _max_year_per_district.get((state, district), max(years))
    future_years = list(range(max_year + 1, max_year + 11))
    all_years = years + future_years

    trends = []

    # -----------------------------
    # Prepare batch input for historical years
    # -----------------------------
    hist_years = [y for y in all_years if y <= max_year]
    if hist_years:
        try:
            state_code = state_encoder.transform([state])[0]
        except ValueError:
            state_code = 0
        try:
            district_code = district_encoder.transform([district])[0]
        except ValueError:
            district_code = 0

        X_hist = pd.DataFrame({
            "state_code": [state_code]*len(hist_years),
            "district_code": [district_code]*len(hist_years),
            "YEAR": hist_years
        })

        # Predict all historical years at once
        pred_logs = _model.predict(X_hist)
        pred_counts_hist = np.expm1(pred_logs).clip(min=0).round().astype(int)

    # -----------------------------
    # Historical years: store counts
    # -----------------------------
    for i, y in enumerate(hist_years):
        counts = {col: int(pred_counts_hist[i, j]) for j, col in enumerate(_crime_columns)}
        total = sum(counts.values())
        hotspot_probability = min(total / max(total, 1_000), 1.0)
        trends.append({
            "year": int(y),
            "total_crimes": total,
            "hotspot_probability": hotspot_probability,
            **counts
        })

    # -----------------------------
    # Future years: extrapolate using growth rates
    # -----------------------------
    hist_df = _data_df[
        (_data_df['STATE'] == state) &
        (_data_df['DISTRICT'] == district) &
        (_data_df['YEAR'] == max_year)
    ]
    for y in future_years:
        counts = {}
        years_diff = y - max_year
        if hist_df.empty:
            counts = {col: 0 for col in _crime_columns}
        else:
            for col in _crime_columns:
                last_val = hist_df.iloc[0][col]
                growth = _growth_rates.get(state, {}).get(district, {}).get(col, 0.0)
                counts[col] = max(int(round(last_val * ((1 + growth) ** years_diff))), 0)

        total = sum(counts.values())
        hotspot_probability = min(total / max(total, 1_000), 1.0)
        trends.append({
            "year": int(y),
            "total_crimes": total,
            "hotspot_probability": hotspot_probability,
            **counts
        })

    return {"state": state, "district": district, "trends": trends}

# -----------------------------
# Root
# -----------------------------
@app.get("/")
def root():
    return {"message": "Smart Police Hotspot Prediction API Running"}
