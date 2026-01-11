import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Trip, dbRowToTrip } from '@/types/database'
import { calculateSchengenDaysUsed, calculateRemainingSchengenDays } from '@/lib/schengen'
import { parseToLocalDayStart } from '@/lib/date'
import { ArrowLeft, MapPin, Calendar, Globe, Clock, CheckCircle2, Plane, TrendingUp, AlertTriangle } from 'lucide-react'

export function Dashboard() {
  const { user, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const [trips, setTrips] = useState<Trip[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState({
    totalTrips: 0,
    activeTrips: 0,
    completedTrips: 0,
    uniqueCountries: 0,
    totalDaysTraveled: 0,
    schengenDaysUsed: 0,
    remainingSchengenDays: 90,
    upcomingTrips: 0,
    tripsThisYear: 0,
  })

  useEffect(() => {
    if (loading) return
    
    if (!isAuthenticated || !user) {
      navigate('/login')
      return
    }

    const fetchTrips = async () => {
      try {
        setIsLoading(true)
        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .eq('user_id', user.id)
          .order('start_date', { ascending: false })

        if (error) throw error

        if (data) {
          const tripsData = data.map(dbRowToTrip)
          setTrips(tripsData)
          calculateStats(tripsData)
        }
      } catch (error) {
        console.error('Error fetching trips:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTrips()
  }, [isAuthenticated, user, loading, navigate])

  const calculateStats = (tripsData: Trip[]) => {
    const now = new Date()
    const currentYear = now.getFullYear()
    
    const totalTrips = tripsData.length
    const activeTrips = tripsData.filter(t => !t.endDate).length
    const completedTrips = tripsData.filter(t => t.endDate).length
    
    // Unique countries visited
    const uniqueCountries = new Set(tripsData.map(t => t.destination)).size
    
    // Total days traveled (completed trips only)
    let totalDaysTraveled = 0
    tripsData.forEach(trip => {
      if (trip.endDate) {
        const start = parseToLocalDayStart(trip.startDate)
        const end = parseToLocalDayStart(trip.endDate)
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
        totalDaysTraveled += days
      }
    })
    
    // Schengen days
    const schengenDaysUsed = calculateSchengenDaysUsed(tripsData)
    const remainingSchengenDays = calculateRemainingSchengenDays(tripsData)
    
    // Upcoming trips (start date in the future)
    const upcomingTrips = tripsData.filter(t => {
      const startDate = parseToLocalDayStart(t.startDate)
      return startDate > now && !t.endDate
    }).length
    
    // Trips this year
    const tripsThisYear = tripsData.filter(t => {
      const startDate = parseToLocalDayStart(t.startDate)
      return startDate.getFullYear() === currentYear
    }).length

    setStats({
      totalTrips,
      activeTrips,
      completedTrips,
      uniqueCountries,
      totalDaysTraveled,
      schengenDaysUsed,
      remainingSchengenDays,
      upcomingTrips,
      tripsThisYear,
    })
  }

  // Get most visited countries
  const getMostVisitedCountries = () => {
    const countryCounts: Record<string, number> = {}
    trips.forEach(trip => {
      countryCounts[trip.destination] = (countryCounts[trip.destination] || 0) + 1
    })
    return Object.entries(countryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([country, count]) => ({ country, count }))
  }

  // Get recent trips
  const getRecentTrips = () => {
    return trips
      .sort((a, b) => parseToLocalDayStart(b.startDate).getTime() - parseToLocalDayStart(a.startDate).getTime())
      .slice(0, 5)
  }

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-white to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const mostVisited = getMostVisitedCountries()
  const recentTrips = getRecentTrips()

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-white to-white">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/trips')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Trips
              </Button>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                  Dashboard
                </h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Plane className="h-4 w-4 text-blue-600" />
                Total Trips
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{stats.totalTrips}</div>
              <p className="text-xs text-slate-500 mt-1">
                {stats.activeTrips} active, {stats.completedTrips} completed
              </p>
            </CardContent>
          </Card>

          <Card className="border-cyan-200 bg-gradient-to-br from-cyan-50 to-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Globe className="h-4 w-4 text-cyan-600" />
                Countries Visited
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-cyan-600">{stats.uniqueCountries}</div>
              <p className="text-xs text-slate-500 mt-1">Unique destinations</p>
            </CardContent>
          </Card>

          <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Clock className="h-4 w-4 text-green-600" />
                Days Traveled
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.totalDaysTraveled}</div>
              <p className="text-xs text-slate-500 mt-1">Total days on the road</p>
            </CardContent>
          </Card>

          <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-600" />
                This Year
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{stats.tripsThisYear}</div>
              <p className="text-xs text-slate-500 mt-1">Trips in {new Date().getFullYear()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Schengen Zone Card */}
        {stats.schengenDaysUsed > 0 && (
          <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Schengen Zone Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Days Used (180-day period)</p>
                  <div className="text-2xl font-bold text-amber-600">{stats.schengenDaysUsed}</div>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Days Remaining</p>
                  <div className="text-2xl font-bold text-green-600">{stats.remainingSchengenDays}</div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-amber-200">
                <div className="w-full bg-amber-100 rounded-full h-2">
                  <div
                    className="bg-amber-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min((stats.schengenDaysUsed / 90) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {stats.remainingSchengenDays <= 14 && (
                    <span className="text-red-600 font-semibold">⚠️ Less than 14 days remaining!</span>
                  )}
                  {stats.remainingSchengenDays > 14 && stats.remainingSchengenDays <= 30 && (
                    <span className="text-amber-600 font-semibold">⚠️ Less than 30 days remaining</span>
                  )}
                  {stats.remainingSchengenDays > 30 && '90 days allowed in any 180-day period'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Most Visited Countries */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-blue-600" />
                Most Visited Countries
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mostVisited.length > 0 ? (
                <div className="space-y-3">
                  {mostVisited.map(({ country, count }, index) => (
                    <div key={country} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                          {index + 1}
                        </div>
                        <span className="font-medium">{country}</span>
                      </div>
                      <Badge variant="secondary">{count} {count === 1 ? 'trip' : 'trips'}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">No trips yet</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Trips */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-cyan-600" />
                Recent Trips
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentTrips.length > 0 ? (
                <div className="space-y-3">
                  {recentTrips.map(trip => (
                    <div key={trip.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <MapPin className="h-4 w-4 text-slate-400" />
                          <span className="font-medium">{trip.destination}</span>
                          {!trip.endDate && (
                            <Badge variant="outline" className="text-xs">Active</Badge>
                          )}
                          {trip.endDate && (
                            <Badge variant="secondary" className="text-xs bg-green-100">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Complete
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {new Date(trip.startDate).toLocaleDateString()}
                          {trip.endDate && ` - ${new Date(trip.endDate).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">No trips yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Trips */}
        {stats.upcomingTrips > 0 && (
          <Card className="mt-6 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plane className="h-5 w-5 text-blue-600" />
                Upcoming Trips
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.upcomingTrips}</div>
              <p className="text-sm text-slate-600 mt-1">Trips starting in the future</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
