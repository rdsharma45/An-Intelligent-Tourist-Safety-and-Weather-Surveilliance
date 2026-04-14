from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import joblib
import numpy as np
import requests
from config import config

MAPPLS_API_KEY = os.getenv("MAPPLS_API_KEY")

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("uvicorn.error")


app = FastAPI()
api_router = APIRouter(prefix="/api")


class LogRequestsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        try:
            client = request.client.host if request.client else 'unknown'
            logger.info(f"INCOMING {request.method} {request.url.path} from {client}")
        except Exception:
            logger.exception("Failed to log request")
        return await call_next(request)

class NoCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response


mongo_url = os.environ.get('MONGO_URL') #or config.get('DB_URI') or 'mongodb://localhost:27017'
db_name = os.environ.get('DB_NAME') or config.get('DB_NAME') or 'touristsafety'

SECRET_KEY =(

    os.environ.get('JWT_SECRET_KEY') 
   
     )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get('ACCESS_TOKEN_EXPIRE_MINUTES', 1440))


client = AsyncIOMotorClient(mongo_url)
db = client[db_name]


security = HTTPBearer()

try:
    model = joblib.load(ROOT_DIR / 'risk_model.pkl')
    logger.info("Risk prediction model loaded successfully")
except Exception:
    model = None
    logger.warning("Risk model not found, will use rule-based prediction")


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: EmailStr
    password_hash: str
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class Incident(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    location_name: str
    lat: float
    lng: float
    incident_type: str
    severity: str
    date: datetime
    description: Optional[str] = None

class RouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    start_name: Optional[str] = None
    end_name: Optional[str] = None

class RoutePoint(BaseModel):
    lat: float
    lng: float

class RouteOption(BaseModel):
    route_points: List[RoutePoint]
    distance_km: float
    duration_minutes: float
    risk_level: str
    risk_score: float
    safety_tips: List[str]
    crowd_level: float 


class MultiRouteResponse(BaseModel):
    routes: List[RouteOption]


class RiskPredictionRequest(BaseModel):
    # OPTIONAL coordinates (not required anymore)
    start_lat: float | None = None
    start_lng: float | None = None
    lat: float | None = None
    lng: float | None = None

    # ML features (MAIN)
    route_length_km: float | None = None
    road_type: int | None = None
    accident_count: int | None = None
    incident_severity: float | None = None
    weather_risk: float | None = None
    crowd_level: float | None = None
    elevation: float | None = None
    slope: float | None = None
    time_of_day: int | None = None
    season: int | None = None

    city: int | None = None
class RiskPredictionResponse(BaseModel):
    risk_level: str
    risk_score: float
    recommendations: List[str]
    nearby_incidents: int

class WeatherResponse(BaseModel):
    temperature: float
    humidity: float
    conditions: str
    description: str

class GeoFenceZone(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    lat: float
    lng: float
    radius: float
    risk_level: str
    alert_message: str

class SOSAlert(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    user_phone: Optional[str]
    lat: float
    lng: float
    location_name: Optional[str]
    emergency_type: str
    message: Optional[str]
    status: str = "active"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SOSRequest(BaseModel):
    lat: float
    lng: float
    location_name: Optional[str] = None
    emergency_type: str
    message: Optional[str] = None

class SOSResponse(BaseModel):
    alert_id: str
    status: str
    message: str
    emergency_contacts_notified: List[str]

class CrowdData(BaseModel):
    location_name: str
    lat: float
    lng: float
    crowd_level: str
    estimated_people: int
    last_updated: datetime

class LocationSearchRequest(BaseModel):
    query: str

class LocationSearchResult(BaseModel):
    name: str
    lat: float
    lng: float
    display_name: str

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")



def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine distance in KM"""
    from math import radians, cos, sin, asin, sqrt
    lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlng/2)**2
    c = 2 * asin(sqrt(a))
    km = 6371 * c
    return km

def get_traffic_eta(start_lat, start_lng, end_lat, end_lng):
    try:
        url = f"https://apis.mappls.com/advancedmaps/v1/{MAPPLS_API_KEY}/distance_matrix_eta/json"

        params = {
            "origins": f"{start_lat},{start_lng}",
            "destinations": f"{end_lat},{end_lng}"
        }

        response = requests.get(url, params=params, timeout=5)
        data = response.json()

        time = data["results"][0]["distances"][0]["duration"]

        return time / 60  # minutes

    except Exception as e:
        print("Mappls error:", e)
        return None\
        
def traffic_to_crowd(duration, distance):
    normal_time = distance * 2  # baseline

    ratio = duration / normal_time if normal_time > 0 else 1

    if ratio > 1.5:
        return 0.9
    elif ratio > 1.2:
        return 0.5
    else:
        return 0.2

def calculate_rule_based_risk(lat, lng, weather, temp, humidity, nearby_incidents):
    risk = 0.0

    # 📍 location risk
    high_risk_zones = [
        (30.7346, 79.0669),
        (30.5576, 79.5640),
    ]

    min_distance = min([calculate_distance(lat, lng, z[0], z[1]) for z in high_risk_zones])

    if min_distance < 10:
        risk += 0.5
    elif min_distance < 30:
        risk += 0.3
    else:
        risk += 0.1   # 👈 ALWAYS add base risk

    # 🌧 weather risk
    if weather.lower() in ['rain', 'storm', 'snow']:
        risk += 0.3
    elif weather.lower() in ['clouds', 'fog']:
        risk += 0.15

    # 🌡 temperature risk
    if temp < 5:
        risk += 0.2
    elif temp > 35:
        risk += 0.15

    # 💧 humidity risk
    if humidity > 80:
        risk += 0.15
    elif humidity > 60:
        risk += 0.1

    # 🚨 incidents
    risk += min(nearby_incidents * 0.1, 0.3)

    return min(risk, 1.0)

async def get_crowd_data(lat: float, lng: float) -> dict:
    import random
    crowd_levels = ["Low", "Moderate", "High"]
    return {"crowd_level": random.choice(crowd_levels)}

@api_router.get("/")
async def root():
    return {"message": "Tourist Safety API is running"}

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserRegister):
    logger.info("Register attempt for %s", user_data.email)
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = User(
        name=user_data.name,
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        phone=user_data.phone,
        emergency_contact=user_data.emergency_contact
    )
    
    doc = user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.users.insert_one(doc)
    
    access_token = create_access_token({"sub": user.id, "email": user.email})
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            name=user.name,
            email=user.email,
            phone=user.phone,
            emergency_contact=user.emergency_contact
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    access_token = create_access_token({"sub": user['id'], "email": user['email']})
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user['id'],
            name=user['name'],
            email=user['email'],
            phone=user.get('phone'),
            emergency_contact=user.get('emergency_contact')
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user['id'],
        name=current_user['name'],
        email=current_user['email'],
        phone=current_user.get('phone'),
        emergency_contact=current_user.get('emergency_contact')
    )


@api_router.post("/route/calculate", response_model=MultiRouteResponse)
async def calculate_route(request: RouteRequest, current_user: dict = Depends(get_current_user)):
    try:
        from datetime import datetime

        osrm_url = (
            f"http://router.project-osrm.org/route/v1/driving/"
            f"{request.start_lng},{request.start_lat};"
            f"{request.end_lng},{request.end_lat}"
            f"?overview=full&alternatives=true&geometries=geojson"
        )

        response = requests.get(osrm_url, timeout=5)
        route_data = response.json()

        if route_data.get("code") != "Ok":
            raise Exception("Route calculation failed")

        # -------- Fetch datasets --------
        incidents = await db.incidents.find({}, {"_id": 0}).limit(50).to_list(50)
        crowd_data = await db.crowd_data.find({}, {"_id": 0}).to_list(100)

        # -------- Weather --------
        try:
            weather = requests.get(
                f"http://127.0.0.1:8000/api/weather?lat={request.start_lat}&lng={request.start_lng}",
                timeout=3
            ).json()

            condition = weather.get("conditions", "Clear")

            weather_risk = 0.8 if condition.lower() in ["rain", "storm"] else \
                           0.5 if condition.lower() in ["clouds", "fog"] else 0.2

        except:
            weather_risk = 0.2

        route_options = []

        for route in route_data.get("routes", []):

            coordinates = route["geometry"]["coordinates"]

            route_points = [
                RoutePoint(lat=coord[1], lng=coord[0])
                for coord in coordinates
            ]

            distance_km = round(route["distance"] / 1000, 2)
            duration_minutes = round(route["duration"] / 60, 0)

            # -------- Traffic --------
            traffic_time = get_traffic_eta(
                request.start_lat,
                request.start_lng,
                request.end_lat,
                request.end_lng
            )

            if traffic_time is not None:
                duration_minutes = round(traffic_time, 0)

            # -------- Crowd --------
            crowd_level = traffic_to_crowd(duration_minutes, distance_km)

            for crowd in crowd_data:
                dist = calculate_distance(
                    request.start_lat,
                    request.start_lng,
                    crowd["lat"],
                    crowd["lng"]
                )

                if dist < 5:
                    if crowd["crowd_level"] == "High":
                        crowd_level = 0.9
                    elif crowd["crowd_level"] == "Moderate":
                        crowd_level = 0.5
                    else:
                        crowd_level = 0.2

            # -------- Incidents --------
            nearby_incidents = 0
            incident_severity = 1

            for inc in incidents:
                dist = calculate_distance(
                    request.start_lat,
                    request.start_lng,
                    inc["lat"],
                    inc["lng"]
                )

                if dist < 5:
                    nearby_incidents += 1
                    incident_severity = 5 if inc["severity"] == "high" else 3 if inc["severity"] == "medium" else 1

            # -------- Road Type --------
            road_type = 3 if distance_km > 100 else 2 if distance_km > 30 else 1

            # =========================
            # 🔥 NEW ML FEATURES (FIXED)
            # =========================
            elevation = 500   # can replace with API later
            slope = 5 if elevation < 1000 else 10

            hour = datetime.now().hour
            time_of_day = 0 if hour < 12 else 1 if hour < 18 else 2

            month = datetime.now().month
            season = 1 if 6 <= month <= 9 else 2 if month >= 11 or month <= 2 else 0

            features = np.array([[ 
                distance_km,
                road_type,
                nearby_incidents,
                incident_severity,
                weather_risk,
                crowd_level,
                elevation,
                slope,
                time_of_day,
                season
            ]])

            print("🔥 FEATURES:", features)

            # -------- ML Prediction --------
            if model:
                avg_risk = float(model.predict(features)[0])
            else:
                avg_risk = 0.3  # fallback

            print("🔥 PREDICTION:", avg_risk)

            # -------- Risk Level --------
            if avg_risk < 0.25:
                risk_level = "Safe"
                safety_tips = [
                    "Route is generally safe",
                    "Keep emergency contacts handy",
                    "Drive within speed limits"
                ]

            elif avg_risk < 0.45:
                risk_level = "Low"
                safety_tips = [
                    "Minor risks present",
                    "Stay alert while traveling",
                    "Follow traffic rules carefully"
                ]

            elif avg_risk < 0.65:
                risk_level = "Moderate"
                safety_tips = [
                    "Exercise caution",
                    "Travel during daylight",
                    "Stay on highways"
                ]

            else:
                risk_level = "High-Risk"
                safety_tips = [
                    "⚠️ Consider alternate route",
                    "Travel only if necessary",
                    "Keep emergency supplies"
                ]

            route_options.append(
                RouteOption(
                    route_points=route_points,
                    distance_km=distance_km,
                    duration_minutes=duration_minutes,
                    risk_level=risk_level,
                    risk_score=round(avg_risk, 2),
                    safety_tips=safety_tips,
                    crowd_level=crowd_level
                )
            )

        return MultiRouteResponse(routes=route_options)

    except Exception as e:
        logger.error(f"Route calculation failed: {e}")
        raise HTTPException(status_code=500, detail="Route calculation failed")


@api_router.post("/location/search", response_model=List[LocationSearchResult])
async def search_location(request: LocationSearchRequest, current_user: dict = Depends(get_current_user)):

    suggestions = [
        {"name": "Kedarnath", "lat": 30.7346, "lng": 79.0669, "display_name": "Kedarnath, Uttarakhand"},
        {"name": "Badrinath", "lat": 30.7433, "lng": 79.4930, "display_name": "Badrinath, Uttarakhand"},
        {"name": "Rishikesh", "lat": 30.0869, "lng": 78.2676, "display_name": "Rishikesh, Uttarakhand"},
        {"name": "Dehradun", "lat": 30.3165, "lng": 78.0322, "display_name": "Dehradun, Uttarakhand"},
        {"name": "Mussoorie", "lat": 30.4598, "lng": 78.0644, "display_name": "Mussoorie, Uttarakhand"},
        {"name": "Haridwar", "lat": 29.9457, "lng": 78.1642, "display_name": "Haridwar, Uttarakhand"},
        {"name": "Delhi", "lat": 28.6139, "lng": 77.2090, "display_name": "Delhi, India"},
        {"name": "Shimla", "lat": 31.1048, "lng": 77.1734, "display_name": "Shimla, Himachal Pradesh"},
        {"name": "Manali", "lat": 32.2432, "lng": 77.1892, "display_name": "Manali, Himachal Pradesh"},
    ]

    locations = []

    try:
        url = "https://nominatim.openstreetmap.org/search"

        params = {
            "q": request.query,
            "format": "json",
            "limit": 5
        }

        headers = {
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "en"
        }

        response = requests.get(url, params=params, headers=headers, timeout=5)

        print("STATUS:", response.status_code)
        print("RESPONSE:", response.text[:200])

        if response.status_code == 200:
            results = response.json()

            for result in results:
                locations.append(
                    LocationSearchResult(
                        name=result.get("display_name").split(",")[0],
                        lat=float(result["lat"]),
                        lng=float(result["lon"]),
                        display_name=result["display_name"]
                    )
                )

    except Exception as e:
        print("API ERROR:", e)

    # 🔥 STEP 2: ALWAYS add local suggestions (if matching)
    filtered = [
        s for s in suggestions
        if request.query.lower() in s["name"].lower()
    ]
    
    for s in filtered:
        locations.append(
            LocationSearchResult(
                name=s["name"],
                lat=s["lat"],
                lng=s["lng"],
                display_name=s["display_name"]
            )
        )
       
    # 🔥 STEP 3: Remove duplicates
    unique_locations = []
    seen = set()

    for loc in locations:
        if loc.display_name not in seen:
            seen.add(loc.display_name)
            unique_locations.append(loc)

    return unique_locations[:8]
@api_router.post("/sos/alert", response_model=SOSResponse)
async def create_sos_alert(request: SOSRequest, current_user: dict = Depends(get_current_user)):
    alert = SOSAlert(
        user_id=current_user['id'],
        user_name=current_user['name'],
        user_phone=current_user.get('phone'),
        lat=request.lat,
        lng=request.lng,
        location_name=request.location_name,
        emergency_type=request.emergency_type,
        message=request.message,
        status="active"
    )

    doc = alert.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.sos_alerts.insert_one(doc)

    emergency_contacts = []
    if current_user.get('emergency_contact'):
        emergency_contacts.append(current_user['emergency_contact'])

    logger.info(f"SOS ALERT: {current_user['name']} at ({request.lat}, {request.lng}) - {request.emergency_type}")

    return SOSResponse(
        alert_id=alert.id,
        status="Alert activated",
        message="Emergency services have been notified. Help is on the way!",
        emergency_contacts_notified=emergency_contacts
    )

@api_router.get("/sos/active", response_model=List[SOSAlert])
async def get_active_sos_alerts(current_user: dict = Depends(get_current_user)):
    alerts = await db.sos_alerts.find({"status": "active"}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return alerts


# 
def is_in_uttarakhand(lat, lng):

    # If location not provided
    if lat is None or lng is None:
        return False

    # Uttarakhand bounding box
    return (
        28.4 <= lat <= 31.5 and
        77.5 <= lng <= 81.0
    )
@api_router.post("/predict-risk", response_model=RiskPredictionResponse)
async def predict_risk(request: RiskPredictionRequest, current_user: dict = Depends(get_current_user)):

    from datetime import datetime

    start_lat = request.start_lat or request.lat
    start_lng = request.start_lng or request.lng

    
    if not is_in_uttarakhand(start_lat, start_lng):
        return RiskPredictionResponse(
            risk_level="Region Not Supported",
            risk_score=0,
            recommendations=["Risk prediction available only for Uttarakhand routes"],
            nearby_incidents=0
        )

   
    incidents = await db.incidents.find({}, {"_id": 0}).to_list(1000)

    nearby_count = 0
    for incident in incidents:
        distance = calculate_distance(
            start_lat,
            start_lng,
            incident["lat"],
            incident["lng"]
        )
        if distance < 5:
            nearby_count += 1

    # -----------------------------
    # BASIC FEATURES
    # -----------------------------
    route_length = request.route_length_km or 10
    road_type = request.road_type or 1
    accident_count = request.accident_count or nearby_count
    incident_severity = request.incident_severity or 3
    weather_risk = request.weather_risk or 0.5
    crowd_level = request.crowd_level or 0.5

    # -----------------------------
    # 🔥 NEW FEATURES (IMPORTANT)
    # -----------------------------
    elevation = 500
    slope = 5 if elevation < 1000 else 10

    hour = datetime.now().hour
    time_of_day = 0 if hour < 12 else 1 if hour < 18 else 2

    month = datetime.now().month
    season = 1 if 6 <= month <= 9 else 2 if month >= 11 or month <= 2 else 0

    # -----------------------------
    # ✅ CORRECT ML FEATURES
    # -----------------------------
    features = np.array([[ 
        route_length,
        road_type,
        accident_count,
        incident_severity,
        weather_risk,
        crowd_level,
        elevation,
        slope,
        time_of_day,
        season
    ]])

    print("🔥 FEATURES:", features)

    # -----------------------------
    # ML PREDICTION
    # -----------------------------
    try:
        if model is not None:
            prediction = model.predict(features)
            risk_score = float(prediction[0])
        else:
            risk_score = 0.5
    except Exception as e:
        logger.warning("Model predict failed (%s)", e)
        risk_score = 0.5

    print("🔥 PREDICTION:", risk_score)
    print("Nearby Incidents:", nearby_count)


    if risk_score < 0.25:
        risk_level = "Safe"
        recommendations = [
            "Route is generally safe",
            "Keep emergency contacts ready"
        ]

    elif risk_score < 0.45:
        risk_level = "Low"
        recommendations = [
            "Minor risks present",
            "Stay alert and follow safety guidelines"
        ]

    elif risk_score < 0.65:
        risk_level = "Moderate"
        recommendations = [
            "Travel during daylight hours",
            "Monitor weather and traffic updates"
        ]

    else:
        risk_level = "High-Risk"
        recommendations = [
            "Avoid this route if possible",
            "Carry emergency supplies",
            "Stay in contact with local authorities"
        ]

    return RiskPredictionResponse(
        risk_level=risk_level,
        risk_score=round(risk_score, 2),
        recommendations=recommendations,
        nearby_incidents=nearby_count
    )
@api_router.get("/weather", response_model=WeatherResponse)
async def get_weather(lat: float, lng: float):
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&current_weather=true&hourly=relativehumidity_2m"

        response = requests.get(url, timeout=3)
        data = response.json()

        current = data.get("current_weather", {})
        hourly = data.get("hourly", {})

        temp = current.get("temperature", 25)
        wind = current.get("windspeed", 5)

        humidity_list = hourly.get("relativehumidity_2m", [])

        # ✅ FIXED LOGIC
        if humidity_list and len(humidity_list) > 0:
            humidity = int(humidity_list[0])
        else:
            humidity = 65

        # 🔥 DEBUG (MOVE HERE)
        print("🔥 WEATHER API CALLED 🔥")
        print("Humidity List:", humidity_list[:5])
        print("Final Humidity:", humidity)

        # condition logic
        if temp <= 0:
            condition = "Snow"
        elif temp < 10:
            condition = "Very Cold"
        elif temp < 20:
            condition = "Cold"
        elif temp > 35:
            condition = "Hot"
        else:
            condition = "Clear"

        return WeatherResponse(
            temperature=temp,
            humidity=humidity,
            conditions=condition,
            description=f"Wind speed {wind} km/h"
        )

    except Exception as e:
        logger.error(f"Weather fetch failed: {e}")

        return WeatherResponse(
            temperature=25,
            humidity=60,
            conditions="Clear",
            description="Weather data unavailable"
        )
@api_router.get("/crowd/data", response_model=List[CrowdData])
async def get_crowd_monitoring(current_user: dict = Depends(get_current_user)):
    crowd_data = await db.crowd_data.find({}, {"_id": 0}).to_list(100)
    return crowd_data

@api_router.get("/geofence-zones", response_model=List[GeoFenceZone])
async def get_geofence_zones(current_user: dict = Depends(get_current_user)):
    zones = await db.geofence_zones.find({}, {"_id": 0}).limit(20).to_list(20)
    return zones

@api_router.get("/incidents", response_model=List[Incident])
async def get_incidents(current_user: dict = Depends(get_current_user)):
    incidents = await db.incidents.find({}, {"_id": 0}).to_list(1000)
    return incidents


@app.on_event("startup")
async def startup_event():
    
    try:
        incidents_count = await db.incidents.count_documents({})
        if incidents_count == 0:
            sample_incidents = [
                {"id": str(uuid.uuid4()), "location_name": "Kedarnath Route", "lat": 30.7346, "lng": 79.0669, "incident_type": "landslide", "severity": "high", "date": datetime(2024, 6, 15).isoformat(), "description": "Major landslide blocked the main route"},
                {"id": str(uuid.uuid4()), "location_name": "Joshimath Area", "lat": 30.5576, "lng": 79.5640, "incident_type": "accident", "severity": "high", "date": datetime(2024, 7, 20).isoformat(), "description": "Road subsidence reported"},
                {"id": str(uuid.uuid4()), "location_name": "Badrinath Highway", "lat": 30.7433, "lng": 79.4930, "incident_type": "flood", "severity": "medium", "date": datetime(2024, 8, 10).isoformat(), "description": "Flash flood warning"},
                {"id": str(uuid.uuid4()), "location_name": "Rishikesh", "lat": 30.0869, "lng": 78.2676, "incident_type": "accident", "severity": "low", "date": datetime(2024, 9, 5).isoformat(), "description": "Minor traffic accident"}
            ]
            await db.incidents.insert_many(sample_incidents)
            logger.info("Sample incidents data initialized")

        zones_count = await db.geofence_zones.count_documents({})
        if zones_count == 0:
            geofence_zones = [
                {"id": str(uuid.uuid4()), "name": "Kedarnath High-Risk Zone", "lat": 30.7346, "lng": 79.0669, "radius": 15.0, "risk_level": "High", "alert_message": "⚠️ Alert: You are entering Kedarnath high-risk area. Landslide-prone zone - proceed with extreme caution."},
                {"id": str(uuid.uuid4()), "name": "Joshimath High-Risk Zone", "lat": 30.5576, "lng": 79.5640, "radius": 10.0, "risk_level": "High", "alert_message": "⚠️ Alert: You are entering Joshimath area. Ground subsidence zone - stay alert."},
                {"id": str(uuid.uuid4()), "name": "Badrinath Moderate Zone", "lat": 30.7433, "lng": 79.4930, "radius": 12.0, "risk_level": "Moderate", "alert_message": "⚠️ Caution: Entering Badrinath area. Monitor weather conditions."}
            ]
            await db.geofence_zones.insert_many(geofence_zones)
            logger.info("Geofence zones initialized")

        crowd_count = await db.crowd_data.count_documents({})
        if crowd_count == 0:
            crowd_data = [
                {"location_name": "Kedarnath Temple", "lat": 30.7346, "lng": 79.0669, "crowd_level": "High", "estimated_people": 5000, "last_updated": datetime.now(timezone.utc).isoformat()},
                {"location_name": "Badrinath Temple", "lat": 30.7433, "lng": 79.4930, "crowd_level": "Moderate", "estimated_people": 3000, "last_updated": datetime.now(timezone.utc).isoformat()},
                {"location_name": "Rishikesh", "lat": 30.0869, "lng": 78.2676, "crowd_level": "Low", "estimated_people": 1000, "last_updated": datetime.now(timezone.utc).isoformat()}
            ]
            await db.crowd_data.insert_many(crowd_data)
            logger.info("Crowd data initialized")

    except Exception as e:
        logger.exception("Startup initialization failed: %s", e)

    
    logger.info("==== Registered Routes ====")
    for r in app.router.routes:
        methods = getattr(r, "methods", [])
        path = getattr(r, "path", "")
        logger.info(f"{methods} -> {path}")


app.add_middleware(LogRequestsMiddleware)
app.add_middleware(NoCacheMiddleware)
app.add_middleware(
    CORSMiddleware,

    allow_origins=["http://localhost:3000","https://an-intelligent-tourist-safety-and-w.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api_router)
