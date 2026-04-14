#!/usr/bin/env python3

"""
Generate incident data from routes_cleaned.csv and insert into MongoDB.

Usage:
  python incident.py --insert --max-per-route 6 --scale 1.2 --seed 123
  python incident.py --csv incidents.csv
"""

import argparse
import csv
import os
import random
import uuid
from datetime import datetime, timedelta
from math import sqrt
from pathlib import Path

# Try loading pandas
try:
    import pandas as pd
    USE_PANDAS = True
except ImportError:
    USE_PANDAS = False
    pd = None

# Try loading pymongo
try:
    from pymongo import MongoClient
    HAS_MONGO = True
except ImportError:
    HAS_MONGO = False


INCIDENT_TYPES = [
    "accident", "landslide", "flood", "rockfall", "road_subsidence",
    "heavy_rain", "medical_emergency", "breakdown", "fire"
]

SEVERITY_WEIGHTS = {
    "accident": ["low", "medium", "high"],
    "landslide": ["medium", "high"],
    "flood": ["medium", "high"],
    "rockfall": ["medium", "high"],
    "road_subsidence": ["high"],
    "heavy_rain": ["low", "medium"],
    "medical_emergency": ["low"],
    "breakdown": ["low"],
    "fire": ["medium", "high"]
}


def jitter_point(lat1, lon1, lat2, lon2, frac):
    """Generate a point along the route with jitter."""
    lat = lat1 + (lat2 - lat1) * frac
    lon = lon1 + (lon2 - lon1) * frac
    d = sqrt((lat2 - lat1)**2 + (lon2 - lon1)**2)
    jitter_scale = min(0.002 + d * 0.5, 0.01)
    lat += random.uniform(-jitter_scale, jitter_scale)
    lon += random.uniform(-jitter_scale, jitter_scale)
    return lat, lon


def random_date_within(days_back=800):
    days = random.randint(0, days_back)
    hours = random.randint(0, 23)
    minutes = random.randint(0, 59)
    return (datetime.utcnow() -
            timedelta(days=days, hours=hours, minutes=minutes)).isoformat()


def choose_incident_type_by_risk(risk_score):
    if risk_score >= 0.75:
        return random.choice(["landslide", "road_subsidence", "rockfall", "accident"])
    elif risk_score >= 0.45:
        return random.choice(["accident", "flood", "rockfall", "heavy_rain"])
    else:
        return random.choice(["accident", "medical_emergency", "breakdown"])


def derive_severity(incident_type, risk_score):
    base = SEVERITY_WEIGHTS.get(incident_type, ["low"])
    if risk_score >= 0.8 and "high" in base:
        return "high"
    if risk_score >= 0.5:
        return random.choice(["medium"] + base)
    return random.choice(base)


def load_routes_csv(path):
    """Load routes_cleaned.csv with or without pandas."""
    if USE_PANDAS:
        print("→ Loading with pandas")
        return pd.read_csv(path).to_dict(orient="records")

    print("→ Loading with pure CSV (no pandas installed)")
    rows = []
    with open(path, newline='', encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


def generate_incidents(routes, max_per_route=5, scale=1.0, total_cap=5000):
    incidents = []

    weights = []
    for r in routes:
        acc = float(r.get("Accident_Count", 0))
        risk = float(r.get("Risk_Score", 0))
        w = acc * 2.0 + risk * 3.0 + 0.1
        weights.append(max(w, 0.1))

    total_weight = sum(weights)
    base_total = int(len(routes) * (max_per_route / 3.0) * scale)
    target_total = min(max(100, base_total), total_cap)

    counts = []
    for w in weights:
        cnt = int((w / total_weight) * target_total)
        cnt = min(cnt, max_per_route)
        counts.append(cnt)

    for idx, r in enumerate(routes):
        start_lat = float(r["Start_Lat"])
        start_lon = float(r["Start_Lon"])
        end_lat = float(r["End_Lat"])
        end_lon = float(r["End_Lon"])
        risk = float(r["Risk_Score"])
        city = r.get("City", "Unknown")

        for j in range(counts[idx]):
            frac = random.uniform(0, 1)
            lat, lon = jitter_point(start_lat, start_lon, end_lat, end_lon, frac)
            itype = choose_incident_type_by_risk(risk)
            severity = derive_severity(itype, risk)
            dt = random_date_within()

            incidents.append({
                "id": str(uuid.uuid4()),
                "location_name": f"{city} {itype} spot",
                "lat": lat,
                "lng": lon,
                "incident_type": itype,
                "severity": severity,
                "date": dt,
                "description": f"{itype.capitalize()} reported near {city}. Severity: {severity}."
            })

    random.shuffle(incidents)
    return incidents[:total_cap]


def insert_into_mongo(incidents):
    if not HAS_MONGO:
        raise RuntimeError("pymongo not installed! Install: pip install pymongo")

    mongo_url = os.getenv("MONGO_URL")
    db_name = os.getenv("DB_NAME")

    client = MongoClient(mongo_url)
    db = client[db_name]
    coll = db["incidents"]

    result = coll.insert_many(incidents)
    client.close()
    return len(result.inserted_ids)


def save_csv(incidents, path):
    keys = ["id", "location_name", "lat", "lng", "incident_type", "severity", "date", "description"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for r in incidents:
            writer.writerow(r)
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", help="Save incidents to CSV file")
    parser.add_argument("--insert", action="store_true", help="Insert incidents into MongoDB")
    parser.add_argument("--max-per-route", type=int, default=5)
    parser.add_argument("--scale", type=float, default=1.0)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--count-cap", type=int, default=5000)
    args = parser.parse_args()

    if args.seed:
        random.seed(args.seed)

    routes_path = Path("routes_cleaned.csv")
    if not routes_path.exists():
        print("ERROR: routes_cleaned.csv not found in backend folder.")
        return

    routes = load_routes_csv(routes_path)
    print(f"✓ Loaded {len(routes)} routes")

    incidents = generate_incidents(
        routes,
        max_per_route=args.max_per_route,
        scale=args.scale,
        total_cap=args.count_cap
    )

    print(f"✓ Generated {len(incidents)} incidents")

    if args.csv:
        out = save_csv(incidents, args.csv)
        print("✓ Saved CSV →", out)

    if args.insert:
        count = insert_into_mongo(incidents)
        print(f"✓ Inserted {count} incidents into MongoDB")


if __name__ == "__main__":
    main()
