import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, CloudRain, MapPin, LogOut, RefreshCw, Navigation, Search, AlertTriangle, Users, Route as RouteIcon, Phone } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import L from 'leaflet';
import "leaflet.heat";
import 'leaflet/dist/leaflet.css';



const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;


function HeatmapLayer({ routes }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !routes || routes.length === 0) return;

    let heatData = [];

    routes.forEach((r) => {
      r.route_points.forEach((p, index) => {

        // 🔥 Smooth gradient along route
        const progress = index / r.route_points.length;

        // 🔥 combine crowd + risk + position
        let intensity =
          ((r.crowd_level || 0.5) * 0.6 +
           (r.risk_score || 0.5) * 0.4);

        // 🔥 slight variation along route (looks realistic)
        intensity = intensity * 0.7 ;

        // clamp between 0 and 1
        intensity = Math.min(Math.max(intensity, 0.2), 1);

        heatData.push([p.lat, p.lng, intensity]);
      });
    });

    const heatLayer = L.heatLayer(heatData, {
  radius: 12,   // 🔥 reduce thickness
  blur: 8,     // 🔥 sharper edges
  maxZoom: 14,

  gradient: {
    0.2: "#22c55e",
    0.5: "#facc15",
    0.8: "#f97316",
    1.0: "#ef4444",
  },
});

    heatLayer.addTo(map);

    return () => {
      map.removeLayer(heatLayer);
    };
  }, [routes]);

  return null;
}
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_CENTER = [30.0668, 79.0193];

function MapController({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 10);
    }
  }, [center, map]);
  return null;
}

export default function Dashboard({ user, onLogout }) {
  const [location, setLocation] = useState(null);
  const [destination, setDestination] = useState(null);
  const [destinationSearch, setDestinationSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [weather, setWeather] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [geofenceZones, setGeofenceZones] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [crowdData, setCrowdData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);
  const [showSOSDialog, setShowSOSDialog] = useState(false);
  const [sosType, setSOSType] = useState('medical');
  const [sosMessage, setSOSMessage] = useState('');
  const [showIncidents, setShowIncidents] = useState(true);
  const [weatherMode, setWeatherMode] = useState("current");
  const [destinationWeather, setDestinationWeather] = useState(null);
  const [weatherUpdatedAt, setWeatherUpdatedAt] = useState(null);
  const [destinationWeatherUpdatedAt, setDestinationWeatherUpdatedAt] = useState(null);
  const [showSingleRoute, setShowSingleRoute] = useState(false);
  const activeWeather =
  weatherMode === "current" ? weather : destinationWeather;

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });

  const requestLocation = useCallback(() => {
    if ('geolocation' in navigator) {
      setIsLoading(true);
     navigator.geolocation.getCurrentPosition(
  (position) => {
    const coords = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };

    setLocation(coords);
    setMapCenter([coords.lat, coords.lng]);
    if (!weather) {
       fetchWeather(coords, "current");
    }
    
    if (destination) {
      calculateRouteLive(coords, destination);
    }

    // fetchRiskPrediction(coords);
    
    setIsLoading(false);
  },
  (error) => {
    console.error('Geolocation error:', error);
    toast.error('Unable to track live location', { id: "global-toast" });
    setIsLoading(false);
  },
  {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 5000,
  }
);

    } else {
      toast.error('Geolocation not supported by your browser', { id: "global-toast" });
    }
  }, []);

  const searchLocation = async () => {
  if (!destinationSearch.trim()) return;

  try {
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/search?q=${destinationSearch}&format=json`
    );

    const results = response.data.map((place) => ({
      name: place.display_name.split(",")[0],
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon),
      display_name: place.display_name,
    }));

    setSearchResults(results);

  } catch (error) {
    console.error("Search error:", error);
  }
};

  const selectDestination = (result) => {
    setDestination({
      lat: result.lat,
      lng: result.lng,
      name: result.name
    });
    setSearchResults([]);
    setDestinationSearch(result.name);
    toast.success(`Destination set: ${result.name}`);
    fetchWeather({ lat: result.lat, lng: result.lng }, "destination");

  };

const calculateRoute = async () => {
  if (!location || !destination) {
    toast.error('Please set both current location and destination', { id: "global-toast" });
    return;
  }

  setIsLoading(true);

  try {
    const response = await axios.post(
      `${API}/route/calculate`,
      {
        start_lat: location.lat,
        start_lng: location.lng,
        end_lat: destination.lat,
        end_lng: destination.lng,
        start_name: 'Current Location',
        end_name: destination.name
      },
      getAuthHeaders()
    );

    if (!response.data.routes || response.data.routes.length === 0) {
      toast.error("No routes found", { id: "global-toast" });
      return;
    }

    setRoutes(response.data.routes);
    setSelectedRouteIndex(0);

    const bestRoute = response.data.routes[0];
    
    const latLngs = bestRoute.route_points.map(p => [p.lat, p.lng]);
    const bounds = L.latLngBounds(latLngs);
    
    setMapCenter([
     (latLngs[0][0] + latLngs[latLngs.length - 1][0]) / 2,
     (latLngs[0][1] + latLngs[latLngs.length - 1][1]) / 2
    ]);

    toast.success(
      `Route calculated: ${bestRoute.distance_km} km, ${bestRoute.duration_minutes} mins`
    );

  } catch (error) {
    console.error('Route calculation error:', error);
    toast.error('Failed to calculate route', { id: "global-toast" });
  } finally {
    setIsLoading(false);
  }
};


  const calculateRouteLive = async (currentLoc, dest) => {
  try {
    const response = await axios.post(
      `${API}/route/calculate`,
      {
        start_lat: currentLoc.lat,
        start_lng: currentLoc.lng,
        end_lat: dest.lat,
        end_lng: dest.lng,
        start_name: "Live Location",
        end_name: dest.name,
      },
      getAuthHeaders()
    );

    setRoutes(response.data.routes);
    setSelectedRouteIndex(0);
  } catch (error) {
    console.error("Live route update failed:", error);
  }
};


  const sendSOSAlert = async () => {
  if (!location) {
    toast.error('Location required for SOS alert', { id: "global-toast" });
    return;
  }

  try {
    const response = await axios.post(
      `${API}/sos/alert`,
      {
        lat: location.lat,
        lng: location.lng,
        location_name: destination?.name || 'Unknown',
        emergency_type: sosType,
        message: sosMessage
      },
      getAuthHeaders()
    );

    // ✅ SHOW SUCCESS
    toast.success(`🚨 SOS ALERT SENT!`, { id: "global-toast" });


    const user = JSON.parse(localStorage.getItem("user"));
    const phone = user?.emergency_contact;

    if (phone) {
      const locationLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;

      const message = `
🚨 SOS ALERT!
Emergency Type: ${sosType}

${sosMessage || ""}

📍 Location:
${locationLink}
`;

      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

      window.open(url, "_blank");
    } else {
      toast.error("No emergency contact found", { id: "global-toast" });
    }

    // 🔥 NEW CODE END

    setShowSOSDialog(false);
    setSOSMessage('');

  } catch (error) {
    console.error('SOS alert error:', error);
    toast.error('Failed to send SOS alert', { id: "global-toast" });
  }
};
  const fetchWeather = async (coords, type = "current") => {
  if (isFetchingWeather) return;   // ✅ prevent duplicate calls

  setIsFetchingWeather(true);

  try {
    const response = await axios.get(
      `${API}/weather?lat=${coords.lat}&lng=${coords.lng}`,
      getAuthHeaders()
    );

    console.log("🌦 Weather API:", response.data);

    if (!response.data || response.data.humidity === undefined) {
      return;
    }

    const now = new Date().toLocaleTimeString();

    if (type === "current") {
      setWeather(response.data);
      setWeatherUpdatedAt(now);
    } else {
      setDestinationWeather(response.data);
      setDestinationWeatherUpdatedAt(now);
    }

  } catch (error) {
    console.error("Weather fetch error:", error);
  } finally {
    setIsFetchingWeather(false);
  }
};


useEffect(() => {
  if (location && weather && weather.conditions) {
    console.log("✅ FINAL Weather:", weather);
    fetchRiskPrediction(location);
  }
}, [weather]);

const fetchRiskPrediction = async (coords) => {
  if (!weather || !weather.conditions) {
    console.log("⏳ Weather not ready");
    return;
  }

  try {
    const hour = new Date().getHours();
    const month = new Date().getMonth();

    const response = await axios.post(
      `${API}/predict-risk`,
      {
        route_length_km: 10,
        road_type: 1,
        accident_count: 0,
        incident_severity: 3,

        weather_risk:
          (weather?.conditions || "").toLowerCase().includes("rain") ? 0.8 :
          (weather?.conditions || "").toLowerCase().includes("cloud") ? 0.5 : 0.2,

        crowd_level: 0.4,

        elevation: 500,
        slope: 5,

        time_of_day:
          hour < 12 ? 0 : hour < 18 ? 1 : 2,

        season:
          month >= 5 && month <= 8 ? 1 :
          month >= 11 || month <= 1 ? 2 : 0
      },
      getAuthHeaders()
    );

    console.log("🔥 Risk Response:", response.data);

    setRiskData(response.data);

    if (response.data.risk_level === "High-Risk") {
      toast.error("⚠️ High Risk Area Detected!", { id: "global-toast" });
    } else if (response.data.risk_level === "Moderate") {
      toast.warning("Moderate risk - Exercise caution", { id: "global-toast" });
    } else {
      toast.dismiss();
      toast.success("✅ Safe area for travel", { id: "global-toast" });
    }

  } catch (error) {
    console.error("Risk prediction error:", error);
    toast.error("Failed to predict risk", { id: "global-toast" });
  }
};
const calculateCurrentRisk = async () => {
  if (!location || !weather) return;

  const hour = new Date().getHours();
  const month = new Date().getMonth();

  const response = await axios.post(
    `${API}/predict-risk`,
    {
      lat: location.lat,        // 🔥 ADD THIS
      lng: location.lng,        // 🔥 ADD THIS

      route_length_km: 5,
      road_type: 1,
      accident_count: 0,
      incident_severity: 2,

      weather_risk:
        (weather?.conditions || "").toLowerCase().includes("rain") ? 0.8 : 0.3,

      crowd_level: 0.3,
      elevation: 400,
      slope: 4,

      time_of_day: hour < 12 ? 0 : hour < 18 ? 1 : 2,
      season: month >= 5 && month <= 8 ? 1 : 0
    },
    getAuthHeaders()
  );

  setRiskData(response.data);
};


const calculateDestinationRisk = async () => {
  if (!destination || !destinationWeather) return;

  const hour = new Date().getHours();
  const month = new Date().getMonth();

  const response = await axios.post(
    `${API}/predict-risk`,
    {
      lat: destination.lat,     // 🔥 ADD THIS
      lng: destination.lng,     // 🔥 ADD THIS

      route_length_km: 30,
      road_type: 2,
      accident_count: 2,
      incident_severity: 3,

      weather_risk:
        (destinationWeather?.conditions || "").toLowerCase().includes("rain") ? 0.8 : 0.3,

      crowd_level: 0.6,
      elevation: 1200,
      slope: 10,

      time_of_day: hour < 12 ? 0 : hour < 18 ? 1 : 2,
      season: month >= 5 && month <= 8 ? 1 : 0
    },
    getAuthHeaders()
  );

  setRiskData(response.data);
};

const fetchGeofenceZones = async () => {
    try {
      const response = await axios.get(`${API}/geofence-zones`, getAuthHeaders());
      setGeofenceZones(response.data);
    } catch (error) {
      console.error('Geofence zones fetch error:', error);
    }
  };

  const fetchIncidents = async () => {
    try {
      const response = await axios.get(`${API}/incidents`, getAuthHeaders());
      setIncidents(response.data);
    } catch (error) {
      console.error('Incidents fetch error:', error);
    }
  };

  const fetchCrowdData = async () => {
    try {
      const response = await axios.get(`${API}/crowd/data`, getAuthHeaders());
      setCrowdData(response.data);
    } catch (error) {
      console.error('Crowd data fetch error:', error);
    }
  };

  useEffect(() => {
    requestLocation();
    fetchGeofenceZones();
    fetchIncidents();
    // fetchCrowdData();
  }, []);

  useEffect(() => {
    if (location && geofenceZones.length > 0) {
      geofenceZones.forEach((zone) => {
        const distance = calculateDistance(
          location.lat,
          location.lng,
          zone.lat,
          zone.lng
        );
        if (distance < zone.radius) {
          toast.error(zone.alert_message, { duration: 5000 });
        }
      });
    }
  }, [location, geofenceZones]);

  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

const isIncidentNearRoute = (incident, routePoints, maxDistanceKm = 2) => {
  if (!routePoints || routePoints.length === 0) return false;

  // Only check every 10th route point (reduces checks massively)
  const sampledPoints = routePoints.filter((_, index) => index % 10 === 0);

  return sampledPoints.some((point) => {
    const dist = calculateDistance(
      incident.lat,
      incident.lng,
      point.lat,
      point.lng
    );

    return dist <= maxDistanceKm;
  });
};

  const getRiskColor = (level) => {
    switch (level) {
      case 'Safe':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'Moderate':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'High-Risk':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getZoneColor = (riskLevel) => {
    switch (riskLevel) {
      case 'High':
        return '#ef4444';
      case 'Moderate':
        return '#f59e0b';
      default:
        return '#10b981';
    }
  };

  const getCrowdColor = (level) => {
    switch (level) {
      case 'High':
        return 'text-red-600';
      case 'Moderate':
        return 'text-amber-600';
      default:
        return 'text-green-600';
    }
  };
  
  useEffect(() => {
  if (!location) return;

  const interval = setInterval(() => {
    fetchWeather(location, "current");

    if (destination) {
      fetchWeather(destination, "destination");
    }
  }, 300000); // 5 minutes

  return () => clearInterval(interval);
}, [location, destination]);

const sendSOS = () => {
  if (!location) {
    alert("Location not available");
    return;
  }

  const lat = location.lat;
  const lng = location.lng;

  const phone = user?.emergency_contact; // 👈 IMPORTANT (from logged-in user)

  if (!phone) {
    alert("No emergency contact found!");
    return;
  }


};

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50" data-testid="dashboard">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-xl flex items-center justify-center">
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Safety Dashboard</h1>
                <p className="text-sm text-gray-600">Welcome, {user?.name}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Dialog open={showSOSDialog} onOpenChange={setShowSOSDialog}>
                <DialogTrigger asChild>
                  <Button
                    variant="destructive"
                    className="bg-red-600 hover:bg-red-700 animate-pulse"
                    data-testid="sos-button"
                  >
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    SOS ALERT
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>🚨 Emergency SOS Alert</DialogTitle>
                    <DialogDescription>
                      This will notify emergency services and your contacts immediately
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Emergency Type</Label>
                      <Select value={sosType} onValueChange={setSOSType}>
                        <SelectTrigger data-testid="sos-type-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="medical">Medical Emergency</SelectItem>
                          <SelectItem value="accident">Accident</SelectItem>
                          <SelectItem value="stranded">Stranded/Lost</SelectItem>
                          <SelectItem value="weather">Weather Emergency</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Additional Information (Optional)</Label>
                      <Textarea
                        placeholder="Describe your situation..."
                        value={sosMessage}
                        onChange={(e) => setSOSMessage(e.target.value)}
                        data-testid="sos-message-input"
                      />
                    </div>
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Your location will be shared with emergency services
                      </AlertDescription>
                    </Alert>
                    <Button
                      onClick={sendSOSAlert}
                      className="w-full bg-red-600 hover:bg-red-700"
                      data-testid="send-sos-button"
                    >
                      <Phone className="w-4 h-4 mr-2" />
                      Send SOS Alert
                    </Button>
                    
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                onClick={onLogout}
                data-testid="logout-button"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Map Section */}
          <div className="lg:col-span-2 space-y-6">
            {/* Route Planning Card */}
            <Card className="border-none shadow-xl" data-testid="route-planning-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RouteIcon className="w-5 h-5 text-blue-600" />
                  Plan Your Journey
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Current Location</Label>
                    <div className="flex gap-2">
                      <Input
                        value={location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Detecting...'}
                        readOnly
                        data-testid="current-location-input"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={requestLocation}
                        data-testid="refresh-location-btn"
                      >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Destination</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          placeholder="Search destination..."
                          value={destinationSearch}
                          onChange={(e) => setDestinationSearch(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && searchLocation()}
                          data-testid="destination-search-input"
                        />
                        {searchResults.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
                            {searchResults.map((result, idx) => (
                              <div
                                key={idx}
                                className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                                onClick={() => selectDestination(result)}
                                data-testid={`search-result-${idx}`}
                              >
                                <p className="font-semibold text-sm">{result.name}</p>
                                <p className="text-xs text-gray-600">{result.display_name}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        size="icon"
                        onClick={searchLocation}
                        data-testid="search-destination-btn"
                      >
                        <Search className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={calculateRoute}
                  disabled={!location || !destination || isLoading}
                  className="w-full bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600"
                  data-testid="calculate-route-btn"
                >
                  <Navigation className="w-4 h-4 mr-2" />
                  {isLoading ? 'Calculating...' : 'Find Safest Route'}
                </Button>

                {routes.length > 0 && (
                <Alert className="bg-blue-50 border-blue-200">
                <RouteIcon className="h-4 w-4 text-blue-600" />
                <AlertDescription>
                <div className="space-y-3 mt-2">

                {routes.map((r, index) => (
              <div
              key={index}
              //  onClick={() => setSelectedRouteIndex(index)}
              onClick={() => {
                setSelectedRouteIndex(index);
                setShowSingleRoute(true);
              }}
               className={`p-3 rounded-lg cursor-pointer border ${
               index === selectedRouteIndex
                ? "border-blue-500 bg-blue-100"
                : "border-gray-200 bg-white"
                }`}
               >
              <div className="flex justify-between text-sm">
              <span>Distance:</span>
              <span className="font-semibold">
                {r.distance_km} km
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span>Duration:</span>
              <span className="font-semibold">
                {r.duration_minutes} mins
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span>Safety:</span>
              <Badge className={getRiskColor(r.risk_level)}>
                {r.risk_level}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span>Crowd:</span>
              <span className="font-semibold">
                {r.crowd_level === 0.9 ? "High" :
                r.crowd_level === 0.5 ? "Moderate" : "Low"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
                <span>Route Risk:</span>
                 <span
                  className={`font-semibold ${
                    r.risk_score > 0.7
                      ? "text-red-600"
                      : r.risk_score > 0.4
                      ? "text-yellow-500"
                      : "text-green-600"
                  }`}
                >
                  {Math.round((r.risk_score || 0) * 100)}%
                </span>
            </div>
          </div>
        ))}

               </div>
                </AlertDescription>
                </Alert>
                 )}
              </CardContent>
            </Card>


            {/* Map Card */}
            <Card className="border-none shadow-xl" data-testid="map-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Live Location Map</CardTitle>

               <Button
                 variant="outline"
                 size="sm"
                 onClick={() => setShowIncidents(!showIncidents)}
                 >
                 {showIncidents ? 'Hide Incidents' : 'Show Incidents'}
                </Button>
                </CardHeader>

              <CardContent>
                <div className="h-[500px] rounded-xl overflow-hidden" data-testid="map-container">
                  <MapContainer
                    center={mapCenter}
                    zoom={10}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <MapController center={mapCenter} />
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* User Location */}
                    {location && (
                      <Marker position={[location.lat, location.lng]}>
                        <Popup>
                          <div className="text-center">
                            <p className="font-semibold">Your Location</p>
                            <p className="text-xs text-gray-600">
                              {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                            </p>
                          </div>
                        </Popup>
                      </Marker>
                    )}

                    {/* Destination Marker */}
                    {destination && (
                      <Marker
                        position={[destination.lat, destination.lng]}
                        icon={L.icon({
                          iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                          iconSize: [25, 41],
                          iconAnchor: [12, 41],
                          popupAnchor: [1, -34],
                          shadowSize: [41, 41],
                        })}
                      >
                        <Popup>
                          <div className="text-center">
                            <p className="font-semibold">{destination.name}</p>
                            <p className="text-xs text-gray-600">Destination</p>
                          </div>
                        </Popup>
                      </Marker>
                    )}

               

              {routes.length > 0 && !showSingleRoute &&
                routes.map((r, index) => (
                  <Polyline
                    key={index}
                    positions={r.route_points.map((p) => [p.lat, p.lng])}
                    color={
                      r.risk_level === "High-Risk"
                        ? "#ef4444"
                        : r.risk_level === "Moderate"
                        ? "#f59e0b"
                        : "#10b981"
                    }
                    weight={4}
                    opacity={0.7}
                  />
              ))}

              {routes.length > 0 && showSingleRoute && routes[selectedRouteIndex] && (
                <Polyline
                  positions={routes[selectedRouteIndex].route_points.map((p) => [p.lat, p.lng])}
                  color={
                    routes[selectedRouteIndex].risk_level === "High-Risk"
                      ? "#ef4444"
                      : routes[selectedRouteIndex].risk_level === "Moderate"
                      ? "#f59e0b"
                      : "#10b981"
                  }
                  weight={6}
                />
              )}

                    {/* Geofence Zones */}
                    {geofenceZones
                      .filter((zone) => zone.risk_level === "High")
                      .map((zone) => (
                      <Circle
                        key={zone.id}
                        center={[zone.lat, zone.lng]}
                        radius={zone.radius * 1000}
                        pathOptions={{
                          color: getZoneColor(zone.risk_level),
                          fillColor: getZoneColor(zone.risk_level),
                          fillOpacity: 0.2,
                        }}
                      >
                        <Popup>
                          <div>
                            <p className="font-semibold">{zone.name}</p>
                            <p className="text-xs text-gray-600">{zone.risk_level} Risk</p>
                          </div>
                        </Popup>
                      </Circle>
                    ))}

                  
              {showIncidents &&
            routes.length > 0 &&
            incidents
              .filter((incident) =>
                isIncidentNearRoute(
                  incident,
                  routes[selectedRouteIndex]?.route_points,
                  2   // reduce distance
                )
              )
              .slice(0, 15)
              .map((incident) => (
                <Marker
                  key={incident.id}
                  position={[incident.lat, incident.lng]}
                  icon={L.icon({
                    iconUrl:
                      'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                    shadowUrl:
                      'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41],
                  })}
                >
                  <Popup>
                    <div>
                      <p className="font-semibold">{incident.location_name}</p>
                      <p className="text-xs text-gray-600 capitalize">
                        {incident.incident_type}
                      </p>
                      <p className="text-xs">{incident.description}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
               <HeatmapLayer routes={routes} />
              </MapContainer>
              </div>
              </CardContent>
              </Card>
            </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Weather Card */}
            {activeWeather && (
              <Card className="border-none shadow-lg" data-testid="weather-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CloudRain className="w-5 h-5 text-blue-600" />
                    Weather
                  </CardTitle>
                </CardHeader>
                <CardContent>
  {/* Toggle Buttons */}
                 <div className="flex gap-2 mb-3">

                  <Button
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-sm"
                    variant={weatherMode === "current" ? "default" : "outline"}
                    onClick={() => setWeatherMode("current")}
                  >
                  Current
                  </Button>

                  <Button
                    size="sm"
                    className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded-md text-sm"
                    variant={weatherMode === "destination" ? "default" : "outline"}
                    onClick={() => setWeatherMode("destination")}
                    disabled={!destinationWeather}
                  >
                  Destination
                  </Button>
                 </div>

                 {/* Weather Info */}
                 {activeWeather ? (
              <div className="space-y-2">
               <div className="flex justify-between">
               <span>Conditions</span>
               <span className="font-semibold">{activeWeather.conditions}</span>
              </div>

              <div className="flex justify-between">
              <span>Temperature</span>
              <span className="font-semibold">
               {activeWeather.temperature}°C
              </span>
              </div>

           <div className="flex justify-between">
           <span>Humidity</span>
           <span className="font-semibold">
            {activeWeather?.humidity ?? "--"}%
           </span>
           </div>
           
           <p className="text-sm text-gray-600 mt-2">
                Updated at:{" "}
              <span className="font-medium">
              {weatherMode === "current"
              ? weatherUpdatedAt || "—"
              : destinationWeatherUpdatedAt || "—"}
              </span>
            </p>

           </div>
           ) : (
           <p className="text-sm text-gray-500">Weather data not available</p>
            )}
           </CardContent>

            </Card>
            )}

            {routes.length > 0 && (
              <Card className="border-none shadow-lg mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Crowd Monitoring
                  </CardTitle>
                  <CardDescription>Real-time crowd based on traffic</CardDescription>
                </CardHeader>

                <CardContent>
                  <div className="space-y-3">

                    {routes.map((r, index) => (
                      <div key={index} className="p-3 bg-gray-50 rounded-lg">

                        <div className="flex justify-between items-center">

                          <div>
                            <p className="font-semibold text-sm">
                              Route {index + 1}
                            </p>
                            <p className="text-xs text-gray-600">
                              {r.distance_km} km • {r.duration_minutes} mins
                            </p>
                          </div>

                          <span
                            className={`px-3 py-1 rounded text-white text-sm
                              ${r.crowd_level > 0.7 ? "bg-red-500" :
                                r.crowd_level > 0.4 ? "bg-yellow-500" :
                                "bg-green-500"}`}
                          >
                            {r.crowd_level > 0.7
                              ? "High Crowd"
                              : r.crowd_level > 0.4
                              ? "Medium"
                              : "Low"}
                          </span>

                        </div>

                      </div>
                    ))}

                  </div>
                </CardContent>
              </Card>
            )}
            {/* Route Safety Tips */}
            {routes.length > 0 && (
              <Card className="border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    Safety Tips
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {routes[selectedRouteIndex]?.safety_tips?.map((tip, idx) => (
                      <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-blue-600 mt-1">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
             
            {/* Risk Assessment Card */}
            {riskData && (
              <Card className="border-none shadow-lg" data-testid="risk-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    Location Risk
                  </CardTitle>
                </CardHeader>
                <CardContent>

  {/* Risk Buttons */}
                  <div className="flex gap-2 mb-3">

                  <Button
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-sm"
                    onClick={calculateCurrentRisk}
                  >
                  Current
                  </Button>

                  <Button
                    size="sm"
                    className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded-md text-sm"
                    disabled={!destination}
                    onClick={calculateDestinationRisk}
                  >
                  Destination
                  </Button>

                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Risk Level</span>
                      <Badge
                        className={`${getRiskColor(riskData.risk_level)} border`}
                        data-testid="risk-level-badge"
                      >
                        {riskData.risk_level}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Risk Score</span>
                      <span className="font-semibold" data-testid="risk-score">
                        {(riskData.risk_score * 100).toFixed(0)}%
                      </span>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className="h-2 rounded-full bg-blue-500"
                          style={{ width: `${riskData.risk_score * 100}%` }}
                        />
                     </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Nearby Incidents</span>
                      <span className="font-semibold" data-testid="nearby-incidents">
                        {riskData.nearby_incidents}
                      </span>
                    </div>
                  </div>

                </CardContent>
              </Card>
            )}
           
            {/* High-Risk Zones */}
            <Card className="border-none shadow-lg" data-testid="alerts-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  High-Risk Zones
                </CardTitle>
                <CardDescription>Areas requiring extra caution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {geofenceZones
                    .filter((z) => z.risk_level === 'High')
                    .map((zone) => (
                      <div
                        key={zone.id}
                        className="p-3 bg-red-50 border border-red-200 rounded-lg"
                        data-testid={`high-risk-zone-${zone.name}`}
                      >
                        <p className="font-semibold text-sm text-red-900">{zone.name}</p>
                        <p className="text-xs text-red-700 mt-1">
                          Radius: {zone.radius}km
                        </p>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
