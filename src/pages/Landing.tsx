import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Globe, Zap, MapPin, CheckCircle2, Sparkles, LogIn, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { checkVisaRequirements } from '@/lib/visaApi'
import { initializeDestinations } from '@/lib/destinations'
import { VisaResults } from '@/components/VisaResults'
import { countries } from '@/lib/countries'
import { Combobox } from '@/components/ui/combobox'

const ANON_SEARCH_STORAGE_KEY = 'visaStay:anonSearches:v1'
const ANON_SEARCH_LIMIT = 3
const ANON_SEARCH_WINDOW_MS = 24 * 60 * 60 * 1000
const ANON_LIMIT_ERROR =
  "You've reached the free limit (3 searches per 24 hours). Sign in to get unlimited searches."

function readAnonSearchTimestamps(): number[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(ANON_SEARCH_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((n) => typeof n === 'number' && Number.isFinite(n))
  } catch {
    return []
  }
}

function writeAnonSearchTimestamps(timestamps: number[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ANON_SEARCH_STORAGE_KEY, JSON.stringify(timestamps))
  } catch {
    // ignore (private mode / storage disabled)
  }
}

function pruneAnonSearchTimestamps(now: number, timestamps: number[]): number[] {
  const cutoff = now - ANON_SEARCH_WINDOW_MS
  return timestamps.filter((t) => t >= cutoff)
}

function getAnonSearchAllowance(now: number): { allowed: boolean; remaining: number } {
  const pruned = pruneAnonSearchTimestamps(now, readAnonSearchTimestamps())
  const remaining = Math.max(0, ANON_SEARCH_LIMIT - pruned.length)
  return { allowed: remaining > 0, remaining }
}

function recordAnonSearch(now: number): number {
  const pruned = pruneAnonSearchTimestamps(now, readAnonSearchTimestamps())
  const next = [...pruned, now]
  writeAnonSearchTimestamps(next)
  return Math.max(0, ANON_SEARCH_LIMIT - next.length)
}

export function Landing() {
  const [passportCountry, setPassportCountry] = useState<string>('')
  const [destinationCountry, setDestinationCountry] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visaData, setVisaData] = useState<any>(null)
  const [destinations, setDestinations] = useState<string[]>([])
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(false)
  const [anonSearchesLeft, setAnonSearchesLeft] = useState<number | null>(null)
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  // Load destinations from country code mapping (no DB/API needed)
  useEffect(() => {
    const loadDestinations = async () => {
      setIsLoadingDestinations(true)
      try {
        const dests = await initializeDestinations()
        setDestinations(dests)
      } catch (error) {
        console.error('Error loading destinations:', error)
      } finally {
        setIsLoadingDestinations(false)
      }
    }

    loadDestinations()
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      setAnonSearchesLeft(null)
      return
    }
    const now = Date.now()
    const allowance = getAnonSearchAllowance(now)
    setAnonSearchesLeft(allowance.remaining)
  }, [isAuthenticated])

  const handleCheckRequirements = async () => {
    if (!passportCountry || !destinationCountry) {
      return
    }

    const now = Date.now()
    if (!isAuthenticated) {
      const allowance = getAnonSearchAllowance(now)
      setAnonSearchesLeft(allowance.remaining)
      if (!allowance.allowed) {
        setError(ANON_LIMIT_ERROR)
        setVisaData(null)
        return
      }
    }

    setIsLoading(true)
    setError(null)
    setVisaData(null)

    try {
      if (!isAuthenticated) {
        const remaining = recordAnonSearch(now)
        setAnonSearchesLeft(remaining)
      }
      const result = await checkVisaRequirements(passportCountry, destinationCountry)
      setVisaData(result.data)
    } catch (err: any) {
      setError(err.message || 'Failed to check visa requirements. Please try again.')
      console.error('Visa check error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCloseResults = () => {
    setVisaData(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-white to-white">
      {/* Navigation */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto w-full max-w-6xl px-4 py-4">
          <div className="flex items-center justify-between">
            <a href="/" className="flex items-center">
              <img
                src="/logo-wordmark.png"
                alt="Visa Stay"
                className="h-[41px] w-auto max-w-[133px] object-contain"
                loading="eager"
                decoding="async"
              />
              <span className="sr-only">Visa Stay</span>
            </a>
            <div className="flex items-center gap-4">
              {isAuthenticated ? (
                <Button
                  onClick={() => navigate('/trips')}
                  variant="outline"
                >
                  My Trips
                </Button>
              ) : (
                <Button
                  onClick={() => navigate('/login')}
                  className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 gap-2"
                >
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-4 pb-4 md:pt-4 md:pb-4 relative">
        <div className="w-full">
          <div className="grid grid-cols-1 gap-12 items-center">
            {/* Left: Text Content */}
            <div className="text-center lg:text-left space-y-8 max-w-3xl mx-auto w-full">
              <div
                className="space-y-4 relative rounded-2xl overflow-hidden p-8 md:p-12 bg-cover bg-center bg-no-repeat"
                style={{
                  backgroundImage:
                    'url(https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&h=800&fit=crop&q=80)',
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-950/75 via-blue-900/60 to-cyan-950/75"></div>
                <div className="relative z-10">
                  <Badge variant="secondary" className="mb-4 bg-white/20 backdrop-blur-sm text-white border-white/30">
                    <Sparkles className="w-3 h-3 mr-1" />
                  Keep track of your travel days
                  </Badge>
                  <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-white drop-shadow-lg">
                    Know before you go
                  </h1>
                  <p className="text-xl md:text-2xl text-white/90 max-w-2xl mx-auto lg:mx-0 mt-4 drop-shadow-md">
                    Instant visa requirements for digital nomads and slow travelers
                  </p>
                </div>
              </div>

              {/* Search Interface */}
              <div className="pt-4">
                <Card className="p-6 shadow-lg border-2 border-blue-100 bg-white/90 backdrop-blur-sm">
                  <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                      <label className="text-sm font-medium text-slate-700 mb-2 block text-left">
                        Passport Country
                      </label>
                      <Select value={passportCountry} onValueChange={setPassportCountry}>
                        <SelectTrigger className="w-full h-12 border-blue-200 focus:border-primary focus:ring-primary">
                          <SelectValue placeholder="Select your passport country" />
                        </SelectTrigger>
                        <SelectContent>
                          {countries.map((country: string) => (
                            <SelectItem key={country} value={country}>
                              {country}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex-1 w-full">
                      <label className="text-sm font-medium text-slate-700 mb-2 block text-left">
                        Destination Country
                      </label>
                      {isLoadingDestinations ? (
                        <div className="flex items-center gap-2 h-12 px-3 border border-input rounded-md text-sm text-slate-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading destinations...</span>
                        </div>
                      ) : destinations.length > 0 ? (
                        <Combobox
                          options={destinations}
                          value={destinationCountry}
                          onValueChange={setDestinationCountry}
                          placeholder="Search and select destination..."
                          searchPlaceholder="Search destinations..."
                          emptyMessage="No destinations found."
                        />
                      ) : (
                        <Select value={destinationCountry} onValueChange={setDestinationCountry}>
                          <SelectTrigger className="w-full h-12 border-blue-200 focus:border-primary focus:ring-primary">
                            <SelectValue placeholder="Select destination" />
                          </SelectTrigger>
                          <SelectContent>
                            {countries.map((country: string) => (
                              <SelectItem key={country} value={country}>
                                {country}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <Button
                      onClick={handleCheckRequirements}
                      disabled={!passportCountry || !destinationCountry || isLoading}
                      className="w-full sm:w-auto h-12 px-8 text-base bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-md"
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        'Check Requirements'
                      )}
                    </Button>
                  </div>
                  {!isAuthenticated && (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-600">
                        Free searches left: <span className="font-semibold">{anonSearchesLeft ?? ANON_SEARCH_LIMIT}</span> /{' '}
                        {ANON_SEARCH_LIMIT} (last 24h)
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate('/login')}
                        className="h-8"
                      >
                        Sign In
                      </Button>
                    </div>
                  )}
                  {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-red-800">{error}</p>
                        {!isAuthenticated && error === ANON_LIMIT_ERROR && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => navigate('/login')}
                            className="border-red-200 text-red-800 hover:bg-red-50"
                          >
                            Sign In for unlimited
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="mx-auto w-full max-w-6xl px-4 py-24">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="border-2 border-blue-100 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-white to-blue-50/30 overflow-hidden group">
              <div className="relative h-48 overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&h=400&fit=crop&q=80"
                  alt="World map with travel destinations"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-blue-900/60 to-transparent"></div>
                <div className="absolute top-4 left-4 w-14 h-14 rounded-xl bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
                  <Globe className="h-7 w-7 text-blue-600" />
                </div>
              </div>
              <CardHeader>
                <CardTitle className="text-2xl text-slate-800">195+ Countries</CardTitle>
                <CardDescription className="text-base text-slate-600">
                  Comprehensive coverage of visa requirements worldwide
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 border-cyan-100 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-white to-cyan-50/30 overflow-hidden group">
              <div className="relative h-48 overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=400&fit=crop&q=80"
                  alt="Technology and data visualization"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-cyan-900/60 to-transparent"></div>
                <div className="absolute top-4 left-4 w-14 h-14 rounded-xl bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
                  <Zap className="h-7 w-7 text-cyan-600" />
                </div>
              </div>
              <CardHeader>
                <CardTitle className="text-2xl text-slate-800">Real-time Data</CardTitle>
                <CardDescription className="text-base text-slate-600">
                  Always up-to-date information from official sources
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-2 border-teal-100 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-white to-teal-50/30 overflow-hidden group">
              <div className="relative h-48 overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&h=400&fit=crop&q=80"
                  alt="Travel planning and destinations"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-teal-900/60 to-transparent"></div>
                <div className="absolute top-4 left-4 w-14 h-14 rounded-xl bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
                  <MapPin className="h-7 w-7 text-teal-600" />
                </div>
              </div>
              <CardHeader>
                <CardTitle className="text-2xl text-slate-800">Trip Planning</CardTitle>
                <CardDescription className="text-base text-slate-600">
                  Plan your multi-country journeys with confidence
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Destinations Gallery Section */}
      <section className="mx-auto w-full max-w-6xl px-4 py-24 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold tracking-tight mb-4 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              Popular Destinations
            </h2>
            <p className="text-xl text-slate-600">
              Explore visa requirements for your next adventure
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="relative group overflow-hidden rounded-xl shadow-md hover:shadow-xl transition-shadow">
              <img
                src="https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=400&h=300&fit=crop&q=80"
                alt="Bali, Indonesia"
                className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-white font-semibold text-lg">Bali</p>
                <p className="text-white/80 text-sm">Indonesia</p>
              </div>
            </div>
            <div className="relative group overflow-hidden rounded-xl shadow-md hover:shadow-xl transition-shadow">
              <img
                src="https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=400&h=300&fit=crop&q=80"
                alt="Tokyo, Japan"
                className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-white font-semibold text-lg">Tokyo</p>
                <p className="text-white/80 text-sm">Japan</p>
              </div>
            </div>
            <div className="relative group overflow-hidden rounded-xl shadow-md hover:shadow-xl transition-shadow">
              <img
                src="https://images.unsplash.com/photo-1515542622106-78bda8ba0e5b?w=400&h=300&fit=crop&q=80"
                alt="Barcelona, Spain"
                className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-white font-semibold text-lg">Barcelona</p>
                <p className="text-white/80 text-sm">Spain</p>
              </div>
            </div>
            <div className="relative group overflow-hidden rounded-xl shadow-md hover:shadow-xl transition-shadow">
              <img
                src="https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=400&h=300&fit=crop&q=80"
                alt="Bangkok, Thailand"
                className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent"></div>
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-white font-semibold text-lg">Bangkok</p>
                <p className="text-white/80 text-sm">Thailand</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="mx-auto w-full max-w-6xl px-4 py-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold tracking-tight mb-4 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Simple Pricing</h2>
            <p className="text-xl text-slate-600">
              Choose the plan that works for you
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mx-auto">
            <Card className="border-2 border-slate-200 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl mb-2 text-slate-800">Monthly</CardTitle>
                <div className="mt-4">
                  <span className="text-5xl font-bold text-slate-900">$3</span>
                  <span className="text-slate-600">/month</span>
                </div>
              </CardHeader>
              <CardContent className="text-center pt-6">
                <Button
                  className="w-full bg-slate-800 hover:bg-slate-900"
                  size="lg"
                  onClick={() =>
                    navigate(isAuthenticated ? '/upgrade' : '/login', {
                      state: { redirectTo: '/upgrade', plan: 'monthly' },
                    })
                  }
                >
                  Get Started
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-primary shadow-xl relative overflow-hidden bg-gradient-to-br from-blue-50 to-cyan-50">
              <div className="absolute top-4 right-4">
                <Badge className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-0">
                  Popular
                </Badge>
              </div>
              <CardHeader className="text-center">
                <CardTitle className="text-3xl mb-2 text-slate-800">Yearly</CardTitle>
                <div className="mt-4">
                  <span className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">$30</span>
                  <span className="text-slate-600">/year</span>
                </div>
                <div className="flex items-center justify-center gap-1 mt-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-green-600 font-medium">
                    Save $6 per year
                  </p>
                </div>
              </CardHeader>
              <CardContent className="text-center pt-6">
                <Button
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-md"
                  size="lg"
                  onClick={() =>
                    navigate(isAuthenticated ? '/upgrade' : '/login', {
                      state: { redirectTo: '/upgrade', plan: 'yearly' },
                    })
                  }
                >
                  Get Started
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50/50 mt-24">
        <div className="mx-auto w-full max-w-6xl px-4 py-12">
          <div className="text-center">
            <a href="/" className="inline-flex items-center justify-center mb-2">
              <img
                src="/logo-wordmark.png"
                alt="Visa Stay"
                className="h-[41px] w-auto max-w-[133px] object-contain"
                loading="lazy"
                decoding="async"
              />
              <span className="sr-only">Visa Stay</span>
            </a>
            <p className="text-sm text-slate-600">© 2024 Visa Stay. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Visa Results Modal */}
      {visaData && <VisaResults data={visaData} onClose={handleCloseResults} />}
    </div>
  )
}

