
import argparse
import csv
import os
import random
import uuid
from datetime import datetime, timezone
from pathlib import Path
from math import sqrt

try:
    from pymongo import MongoClient
    HAS_MONGO = True
except Exception:
    HAS_MONGO = False

try:
    import pandas as pd
    HAS_PANDAS = True
except Exception:
    HAS_PANDAS = False

# crowd mapping by risk score
def risk_to_crowd_level(risk):
    # assume higher risk routes attract more crowd (e.g., pilgrimage)
    if risk >= 0.75:
        return "High", int(2000 + risk * 5000)
    if risk >= 0.5:
        return "Moderate", int(500 + risk * 1000)
    return "Low", int(50 + risk * 200)

def midpoint(lat1, lon1, lat2, lon2):
    return ((lat1 + lat2) / 2.0, (lon1 + lon2) / 2.0)

def scale_radius(risk, max_radius_km):
    # radius scales with risk (0.0 -> 2 km, 1.0 -> max_radius_km)
    return round(2.0 + (max_radius_km - 2.0) * risk, 2)

def load_routes(path):
    if HAS_PANDAS:
        df = pd.read_csv(path)
        return df.to_dict(orient="records")
    else:
        rows = []
        with open(path, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for r in reader:
                rows.append(r)
        return rows

def generate_crowd_and_zones(routes, risk_threshold=0.6, max_radius_km=20):
    crowd_list = []
    geofence_list = []
    # Use city-level aggregation for crowd: group by City and average risk
    city_map = {}
    for r in routes:
        city = r.get("City", "Unknown")
        risk = float(r.get("Risk_Score") or 0.0)
        lat_s = float(r.get("Start_Lat") or 0)
        lon_s = float(r.get("Start_Lon") or 0)
        lat_e = float(r.get("End_Lat") or 0)
        lon_e = float(r.get("End_Lon") or 0)
        mid = midpoint(lat_s, lon_s, lat_e, lon_e)
        if city not in city_map:
            city_map[city] = {"count":0, "sum_risk":0.0, "samples":[]}
        city_map[city]["count"] += 1
        city_map[city]["sum_risk"] += risk
        city_map[city]["samples"].append(mid)

        # Geofence for high-risk route
        if risk >= risk_threshold:
            mid_lat, mid_lon = mid
            radius = scale_radius(risk, max_radius_km)
            zone = {
                "id": str(uuid.uuid4()),
                "name": f"HighRiskZone_{city}_{round(mid_lat,4)}_{round(mid_lon,4)}",
                "lat": mid_lat,
                "lng": mid_lon,
                "radius": radius,
                "risk_level": "High" if risk >= 0.75 else "Moderate",
                "alert_message": (
                    f"⚠️ High risk area (route risk {risk:.2f}). "
                    "Proceed with extreme caution. Check weather and road updates."
                )
            }
            geofence_list.append(zone)

    # Create crowd entries per city using aggregated risk and sample midpoint
    for city, info in city_map.items():
        avg_risk = info["sum_risk"] / max(1, info["count"])
        # choose a representative coordinate (median sample)
        samples = info["samples"]
        rep = samples[len(samples)//2] if samples else (0.0, 0.0)
        crowd_level, est_people = risk_to_crowd_level(avg_risk)
        crowd = {
            "id": str(uuid.uuid4()),
            "location_name": city,
            "lat": rep[0],
            "lng": rep[1],
            "crowd_level": crowd_level,
            "estimated_people": est_people,
            "last_updated": datetime.now(timezone.utc).isoformat()
        }
        crowd_list.append(crowd)

    return crowd_list, geofence_list

def upsert_to_mongo(collection, items, key_field="name"):
    """Upsert each item in items to collection using key_field as identifier.
       If key_field not present, use id.
    """
    upserted = 0
    for item in items:
        filter_key = {}
        if key_field in item and item[key_field]:
            filter_key = {key_field: item[key_field]}
        else:
            filter_key = {"id": item.get("id")}
        collection.replace_one(filter_key, item, upsert=True)
        upserted += 1
    return upserted

def save_csv(items, path):
    if not items:
        return None
    keys = list(items[0].keys())
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for it in items:
            writer.writerow(it)
    return str(Path(path).absolute())

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--insert", action="store_true", help="Insert/Upsert into MongoDB")
    parser.add_argument("--csv-prefix", type=str, default=None, help="Write CSVs with this prefix")
    parser.add_argument("--max-radius", type=float, default=20.0, help="Max radius km for geofences")
    parser.add_argument("--risk-threshold", type=float, default=0.6, help="Risk threshold to create geofence")
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--routes-file", type=str, default="routes_cleaned.csv")
    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    routes_path = Path(args.routes_file)
    if not routes_path.exists():
        print("ERROR: routes_cleaned.csv not found in backend folder.")
        return

    routes = load_routes(routes_path)
    print(f"Loaded {len(routes)} routes")

    crowds, zones = generate_crowd_and_zones(routes, risk_threshold=args.risk_threshold, max_radius_km=args.max_radius)
    print(f"Generated {len(crowds)} crowd entries and {len(zones)} geofence zones")

    if args.csv_prefix:
        prefix = args.csv_prefix
        cpath = save_csv(crowds, f"{prefix}_crowd.csv")
        zpath = save_csv(zones, f"{prefix}_geofence.csv")
        print("Saved crowd CSV:", cpath)
        print("Saved geofence CSV:", zpath)

    if args.insert:
        if not HAS_MONGO:
            print("pymongo not installed. Install with: pip install pymongo")
            return
        mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.getenv("DB_NAME", "touristsafety")
        client = MongoClient(mongo_url)
        db = client[db_name]
        crowd_coll = db["crowd_data"]
        geofence_coll = db["geofence_zones"]

        n1 = upsert_to_mongo(crowd_coll, crowds, key_field="location_name")
        n2 = upsert_to_mongo(geofence_coll, zones, key_field="name")
        client.close()
        print(f"Upserted {n1} crowd entries and {n2} geofence zones into MongoDB ({db_name})")

if __name__ == "__main__":
    main()
