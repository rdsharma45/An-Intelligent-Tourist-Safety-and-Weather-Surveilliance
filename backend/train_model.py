import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import joblib

data = pd.read_csv("Dataset.csv")

print("✅ Dataset loaded:", data.shape)

data.dropna(inplace=True)

label_encoders = {}

if "Road_Type" in data.columns:
    le = LabelEncoder()
    data["Road_Type"] = le.fit_transform(data["Road_Type"])
    label_encoders["Road_Type"] = le

feature_cols = [
    "Route_Length_km",
    "Road_Type",
    "Accident_Count",
    "Incident_Severity",
    "Weather_Risk",
    "Crowd_Level",
    "Elevation",
    "Slope",
    "Time_of_Day",
    "Season"
]

X = data[feature_cols]
y = data["Risk_Score"]

print("✅ Features used:", feature_cols)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

model = RandomForestRegressor(
    n_estimators=200,
    max_depth=None,
    random_state=42
)

model.fit(X_train, y_train)

print("✅ Model trained")

y_pred = model.predict(X_test)

r2 = r2_score(y_test, y_pred)
mae = mean_absolute_error(y_test, y_pred)
mse = mean_squared_error(y_test, y_pred)

print("\n📊 Model Evaluation:")
print("R² Score:", round(r2, 3))
print("MAE:", round(mae, 3))
print("MSE:", round(mse, 3))

joblib.dump(model, "risk_model.pkl")
joblib.dump(label_encoders, "label_encoders.pkl")

print("\n💾 Model saved as risk_model.pkl")

print("\n📈 Feature Importance:")
for name, score in zip(feature_cols, model.feature_importances_):
    print(f"{name}: {round(score, 3)}")

print("\n🚀 Training Complete!")