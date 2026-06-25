import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
import hotspot_ml

def main():
    model = hotspot_ml._model
    state_enc = hotspot_ml._state_encoder
    dist_enc = hotspot_ml._district_encoder
    crime_cols = hotspot_ml._crime_columns or []
    df = hotspot_ml._data_df.copy()

    # Ensure we evaluate using the model's expected target order; fill missing cols with zeros
    target_cols = hotspot_ml._crime_columns or []
    # Build Y with the full target_cols order, filling missing columns with zeros
    Y = pd.DataFrame({c: df[c] if c in df.columns else 0 for c in target_cols})

    if model is None or state_enc is None or dist_enc is None or crime_cols is None or df is None:
        print("Model, encoders, or data not loaded in hotspot_ml. Ensure models exist or retrain.")
        return

    # encode
    df['state_code'] = state_enc.transform(df['STATE'])
    df['district_code'] = dist_enc.transform(df['DISTRICT'])

    X = df[['state_code','district_code','YEAR']].astype(int)
    Y = Y.astype(float)

    # use a deterministic split
    X_train, X_test, y_train, y_test = train_test_split(X, Y, test_size=0.2, random_state=42)

    # model predicts log-space if trained with log1p
    try:
        pred_logs = model.predict(X_test)
    except Exception as e:
        print("Model prediction failed:", e)
        return

    preds = np.expm1(pred_logs)
    preds = np.clip(preds, 0, None)

    # compute RMSE and MAE per column
    rmses = np.sqrt(np.mean((preds - y_test.values) ** 2, axis=0))
    maes = np.mean(np.abs(preds - y_test.values), axis=0)

    print("Evaluation results (on 20% holdout):")
    for col, rmse, mae in zip(crime_cols, rmses, maes):
        print(f"- {col}: RMSE={rmse:.2f}, MAE={mae:.2f}")

    print()
    print(f"Mean RMSE across targets: {np.mean(rmses):.2f}")
    print(f"Median RMSE across targets: {np.median(rmses):.2f}")
    print(f"Mean MAE across targets: {np.mean(maes):.2f}")

    # show example rows
    n_show = min(5, len(X_test))
    print("\nExample predictions (first columns):")
    for i in range(n_show):
        actual = y_test.values[i][:10]
        predicted = preds[i][:10]
        print(f"Row {i+1}: total_actual={int(actual.sum())}, total_pred={int(predicted.sum())}")

if __name__ == '__main__':
    main()
