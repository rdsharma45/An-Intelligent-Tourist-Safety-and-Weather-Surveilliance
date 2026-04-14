import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, MapPin, CloudRain, Shield, Mountain } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';


const raw = (process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:8000").trim();
const cleaned = raw.replace(/^["']|["']$/g, "").replace(/\/+$/, "");
const API = cleaned.endsWith("/api") ? cleaned : `${cleaned}/api`;



export default function LandingPage({ onLogin }) {
  const [showAuth, setShowAuth] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.target);
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      password: formData.get('password'),
      phone: formData.get('phone') || null,
      emergency_contact: formData.get('emergency_contact') || null,
    };

    try {
      const response = await axios.post(`${API}/auth/register`, data);
      toast.success('Account created successfully!', { id: "global-toast" });
      onLogin(response.data.access_token, response.data.user);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed', { id: "global-toast" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.target);
    const data = {
      email: formData.get('email'),
      password: formData.get('password'),
    };

    try {
      const response = await axios.post(`${API}/auth/login`, data);
      toast.success('Welcome back!', { id: "global-toast" });
      onLogin(response.data.access_token, response.data.user);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed', { id: "global-toast" });
    } finally {
      setIsLoading(false);
    }
  };

  if (showAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-2xl mb-4">
              <Mountain className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h1>
            <p className="text-gray-600">Sign in to access your safety dashboard</p>
          </div>

          <Card className="border-none shadow-xl">
            <CardHeader>
              <CardTitle className="text-center">Authentication</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login" data-testid="login-tab">Login</TabsTrigger>
                  <TabsTrigger value="register" data-testid="register-tab">Register</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-4" data-testid="login-form">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        name="email"
                        type="email"
                        placeholder="your@email.com"
                        required
                        data-testid="login-email-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        name="password"
                        type="password"
                        placeholder="••••••••"
                        required
                        data-testid="login-password-input"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600"
                      disabled={isLoading}
                      data-testid="login-submit-button"
                    >
                      {isLoading ? 'Signing in...' : 'Sign In'}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="register">
                  <form onSubmit={handleRegister} className="space-y-4" data-testid="register-form">
                    <div className="space-y-2">
                      <Label htmlFor="register-name">Full Name</Label>
                      <Input
                        id="register-name"
                        name="name"
                        type="text"
                        placeholder="John Doe"
                        required
                        data-testid="register-name-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-email">Email</Label>
                      <Input
                        id="register-email"
                        name="email"
                        type="email"
                        placeholder="your@email.com"
                        required
                        data-testid="register-email-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password">Password</Label>
                      <Input
                        id="register-password"
                        name="password"
                        type="password"
                        placeholder="••••••••"
                        required
                        minLength={6}
                        data-testid="register-password-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-phone">Phone Number (Optional)</Label>
                      <Input
                        id="register-phone"
                        name="phone"
                        type="tel"
                        placeholder="+91 XXXXX XXXXX"
                        data-testid="register-phone-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-emergency">Emergency Contact (Optional)</Label>
                      <Input
                        id="register-emergency"
                        name="emergency_contact"
                        type="tel"
                        placeholder="+91 XXXXX XXXXX"
                        data-testid="register-emergency-input"
                      />
                      <p className="text-xs text-gray-500">Will be notified in case of SOS alert</p>
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600"
                      disabled={isLoading}
                      data-testid="register-submit-button"
                    >
                      {isLoading ? 'Creating account...' : 'Create Account'}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="mt-6 text-center">
            <Button
              variant="ghost"
              onClick={() => setShowAuth(false)}
              data-testid="back-to-home-button"
            >
              ← Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-3xl mb-6 animate-fade-in">
              <Mountain className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-5xl lg:text-7xl font-bold text-gray-900 mb-6 animate-fade-in">
              An Intelligent Tourist Safety
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-emerald-600 bg-clip-text text-transparent">
                for Uttarakhand
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
              AI-powered route recommendations with real-time weather monitoring and geo-risk analysis
              to keep your journey safe through the Himalayas.
            </p>
            <Button
              onClick={() => setShowAuth(true)}
              size="lg"
              className="bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white px-8 py-6 text-lg rounded-full shadow-xl hover:shadow-2xl transition-all"
              data-testid="get-started-btn"
            >
              Get Started →
            </Button>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <Card className="border-none shadow-lg hover:shadow-xl transition-shadow" data-testid="feature-ai-risk">
            <CardHeader>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-blue-600" />
              </div>
              <CardTitle>AI Risk Prediction</CardTitle>
              <CardDescription>
                Machine learning model analyzes past incidents, weather, and terrain to calculate route safety scores
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-none shadow-lg hover:shadow-xl transition-shadow" data-testid="feature-weather">
            <CardHeader>
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4">
                <CloudRain className="w-6 h-6 text-emerald-600" />
              </div>
              <CardTitle>Live Weather</CardTitle>
              <CardDescription>
                Real-time weather data integration to assess environmental risk factors and travel conditions
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-none shadow-lg hover:shadow-xl transition-shadow" data-testid="feature-geofence">
            <CardHeader>
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mb-4">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <CardTitle>Geo-fence Alerts</CardTitle>
              <CardDescription>
                Automatic warnings when entering high-risk zones like Kedarnath, Joshimath, and landslide-prone areas
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-none shadow-lg hover:shadow-xl transition-shadow" data-testid="feature-location">
            <CardHeader>
              <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center mb-4">
                <MapPin className="w-6 h-6 text-rose-600" />
              </div>
              <CardTitle>Location Tracking</CardTitle>
              <CardDescription>
                GPS-based location detection with interactive map visualization showing your position and nearby hazards
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>

      {/* CTA Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <Card className="border-none bg-gradient-to-br from-blue-500 to-emerald-500 text-white shadow-2xl">
          <CardContent className="p-12 text-center">
            <h2 className="text-4xl font-bold mb-4">Ready to Travel Safely?</h2>
            <p className="text-lg mb-8 text-blue-50">
              Join thousands of travelers exploring Uttarakhand with confidence
            </p>
            <Button
              onClick={() => setShowAuth(true)}
              size="lg"
              className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-6 text-lg rounded-full shadow-xl"
              data-testid="cta-get-started-btn"
            >
              Start Your Journey
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600">
          <p>© 2025 Uttarakhand Tourist Safety. AI-Powered Route Protection.</p>
        </div>
      </div>
    </div>
  );
}
