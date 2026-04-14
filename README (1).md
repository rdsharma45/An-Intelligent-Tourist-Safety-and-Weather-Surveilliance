# Uttarakhand Tourist Safety Application

## Overview
AI-powered web application for tourist safety in Uttarakhand with real-time route recommendations, weather monitoring, and geo-risk analysis.

## Tech Stack
- **Backend**: FastAPI (Python) + MongoDB
- **Frontend**: React + Tailwind CSS + Leaflet.js
- **AI Model**: scikit-learn (Random Forest Regressor)
- **Map**: OpenStreetMap
- **Weather**: OpenWeatherMap API (mock data implemented)

## Features Implemented

### ✅ Core Features
1. **User Authentication**
   - JWT-based authentication with bcrypt password hashing
   - Register and login functionality
   - Protected routes with token validation

2. **Location Detection**
   - Browser Geolocation API integration
   - Automatic map centering on user location
   - Real-time GPS coordinates display

3. **AI Risk Prediction**
   - Trained ML model using scikit-learn Random Forest
   - Features: latitude, longitude, temperature, humidity, nearby incidents
   - Risk levels: Safe (0-0.3), Moderate (0.3-0.6), High-Risk (0.6-1.0)
   - Rule-based fallback system

4. **Weather Integration**
   - Mock weather data (ready for API integration)
   - Temperature, humidity, and conditions display
   - Weather-aware risk calculations

5. **Interactive Map**
   - Leaflet.js with OpenStreetMap tiles
   - User location marker
   - High-risk zone circles (Kedarnath, Joshimath, Badrinath)
   - Incident markers (landslides, accidents, floods)
   - Color-coded risk zones

6. **Geo-fencing System**
   - Automatic alerts when entering high-risk zones
   - Radius-based detection (10-15km zones)
   - Real-time proximity checking

7. **Risk Assessment Dashboard**
   - Safety recommendations based on risk level
   - Nearby incidents count
   - Risk score visualization
   - Color-coded badges (green/amber/red)

## Getting OpenWeatherMap API Key (Free)

### Step 1: Sign Up
1. Visit: https://openweathermap.org/
2. Click "Sign In" → "Create an Account"
3. Fill in your details (Name, Email, Password)
4. Verify your email

### Step 2: Get API Key
1. After login, go to: https://home.openweathermap.org/api_keys
2. You'll see a default API key already created
3. Copy the API key (format: `abc123def456...`)
4. **Note**: New API keys take ~2 hours to activate

### Step 3: Add to Application (Optional - Currently Using Mock Data)
Once you have your API key, you can enable real weather data by adding it to the backend environment file.

## Testing the Application

### Access the App
- URL: https://mountsafe.preview.emergentagent.com

### Test Steps
1. Click "Get Started" on landing page
2. Register a new account or login
3. Allow location access when prompted
4. Explore the interactive map with risk zones
5. Check weather and risk assessment cards

## Uttarakhand Locations Reference

| Location | Latitude | Longitude | Risk Level |
|----------|----------|-----------|------------|
| Kedarnath | 30.7346 | 79.0669 | High |
| Joshimath | 30.5576 | 79.5640 | High |
| Badrinath | 30.7433 | 79.4930 | Moderate |
| Rishikesh | 30.0869 | 78.2676 | Safe |

## License
MIT License

---

**Status**: ✅ MVP Complete
**Version**: 1.0.0
