# OpenWeatherMap API Integration Guide

## Getting Your Free API Key

### Step-by-Step Instructions:

1. **Visit OpenWeatherMap Website**
   - Go to: https://openweathermap.org/

2. **Create Account**
   - Click "Sign In" (top right)
   - Click "Create an Account"
   - Fill in:
     * Username
     * Email
     * Password
   - Click "Create Account"

3. **Verify Email**
   - Check your email inbox
   - Click the verification link
   - You'll be redirected back to OpenWeatherMap

4. **Access API Keys**
   - After logging in, click your username (top right)
   - Select "My API keys" from dropdown
   - OR directly visit: https://home.openweathermap.org/api_keys

5. **Copy Your API Key**
   - You'll see a default API key already generated
   - Click the copy icon to copy the key
   - Format looks like: `abc123def456ghi789jkl012mno345pq`

6. **Important Notes**
   - New API keys take **~2 hours** to activate
   - Free tier includes 1,000 calls/day
   - 60 calls per minute limit

## Adding API Key to Application

### Option 1: Using Environment Variable (Recommended)

1. Open `/app/backend/.env` file
2. Add this line:
```
OPENWEATHER_API_KEY=your_actual_api_key_here
```
3. Restart backend:
```bash
sudo supervisorctl restart backend
```

### Option 2: Update Code to Enable Real Weather

Replace the mock weather endpoint in `/app/backend/server.py`:

```python
import requests

@api_router.get("/weather", response_model=WeatherResponse)
async def get_weather(lat: float, lng: float, current_user: dict = Depends(get_current_user)):
    api_key = os.environ.get('OPENWEATHER_API_KEY')
    
    if api_key:
        try:
            # Real API call
            url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lng}&appid={api_key}&units=metric"
            response = requests.get(url, timeout=5)
            data = response.json()
            
            return WeatherResponse(
                temperature=round(data['main']['temp'], 1),
                humidity=data['main']['humidity'],
                conditions=data['weather'][0]['main'],
                description=data['weather'][0]['description']
            )
        except Exception as e:
            logging.error(f"Weather API error: {e}")
            # Fallback to mock data
            pass
    
    # Mock weather data (current implementation)
    import random
    mock_conditions = [
        ("Clear", "Clear sky", 22, 45),
        ("Clouds", "Partly cloudy", 18, 65),
        ("Rain", "Light rain", 15, 85),
    ]
    condition = random.choice(mock_conditions)
    
    return WeatherResponse(
        temperature=condition[2],
        humidity=condition[3],
        conditions=condition[0],
        description=condition[1]
    )
```

## Testing API Integration

### Test with curl:
```bash
# Replace with your actual API key
curl "https://api.openweathermap.org/data/2.5/weather?lat=30.7346&lon=79.0669&appid=YOUR_API_KEY&units=metric"
```

Expected response:
```json
{
  "weather": [{"main": "Clear", "description": "clear sky"}],
  "main": {"temp": 15.5, "humidity": 65},
  ...
}
```

## Free Tier Limits

| Feature | Limit |
|---------|-------|
| Calls per day | 1,000 |
| Calls per minute | 60 |
| Historical data | No |
| Forecast | 5 days |
| Current weather | ✅ Yes |

## Troubleshooting

### Error: "Invalid API key"
- Wait 2 hours after creating key
- Check if key is copied correctly
- Verify no extra spaces in .env file

### Error: "429 Too Many Requests"
- You've exceeded 60 calls/minute
- Wait 1 minute and try again
- Consider caching weather data

### Error: "City not found"
- Check latitude/longitude values
- Ensure coordinates are valid
- Try different location

## Alternative: Continue with Mock Data

The application works perfectly with mock weather data. Real API integration is optional and can be added later when needed.

Mock data provides:
- Realistic temperature ranges
- Various weather conditions
- Humidity levels
- Perfect for testing and demonstrations

---

**Note**: The current application uses mock weather data by default. Real API integration is optional and can be enabled by following the steps above.
