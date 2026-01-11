import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Trip, dbRowToTrip } from '@/types/database'
import { calculateSchengenDaysUsed } from '@/lib/schengen'
import { ArrowLeft, Users, MapPin, Calendar, Globe, Clock, Plane, TrendingUp, Database, Zap, CheckCircle2, Search, UserCheck, UserX, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function Admin() {
  const { user, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const [allTrips, setAllTrips] = useState<Trip[]>([])
  const [_allUsers, setAllUsers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [freeAccessUsers, setFreeAccessUsers] = useState<any[]>([])
  const [isLoadingFreeAccess, setIsLoadingFreeAccess] = useState(false)
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false)
  const [isMostVisitedOpen, setIsMostVisitedOpen] = useState(false)
  const [isRecentTripsOpen, setIsRecentTripsOpen] = useState(false)
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalTrips: 0,
    activeTrips: 0,
    completedTrips: 0,
    uniqueCountries: 0,
    totalDaysTraveled: 0,
    tripsThisMonth: 0,
    tripsThisYear: 0,
    totalSchengenDays: 0,
  })

  useEffect(() => {
    if (loading) return
    
    if (!isAuthenticated || !user) {
      navigate('/login')
      return
    }

    // Check if user is admin (trenton.brown99)
    if (!user.email?.includes('trenton.brown99')) {
      navigate('/trips')
      return
    }

    const fetchAdminData = async () => {
      try {
        setIsLoading(true)
        
        // Get total user count from auth.users
        let totalUserCount = 0
        try {
          const { data: userCount, error: countError } = await supabase.rpc('admin_get_total_user_count')
          if (!countError && userCount !== null) {
            totalUserCount = userCount
          }
        } catch (e) {
          console.error('Error getting total user count:', e)
          // Fallback: count from trips if function doesn't exist
        }
        
        // Fetch all trips (admin can see all)
        const { data: tripsData, error: tripsError } = await supabase
          .from('trips')
          .select('*')
          .order('start_date', { ascending: false })

        if (tripsError) throw tripsError

        if (tripsData) {
          const trips = tripsData.map(dbRowToTrip)
          setAllTrips(trips)
          
          // Calculate unique users from trips (for users with trips)
          const uniqueUserIds = new Set(tripsData.map(t => t.user_id))
          setAllUsers(Array.from(uniqueUserIds).map(id => ({ id })))
          
          // Use total user count from auth.users, or fallback to users with trips
          const finalUserCount = totalUserCount > 0 ? totalUserCount : uniqueUserIds.size
          calculateStats(trips, finalUserCount)
        } else {
          // If no trips, still set user count
          const finalUserCount = totalUserCount > 0 ? totalUserCount : 0
          calculateStats([], finalUserCount)
        }
      } catch (error) {
        console.error('Error fetching admin data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAdminData()
    loadFreeAccessUsers()
  }, [isAuthenticated, user, loading, navigate])

  // Load users with free access
  const loadFreeAccessUsers = async () => {
    try {
      setIsLoadingFreeAccess(true)
      const { data, error } = await supabase
        .from('user_preferences')
        .select('user_id, email, has_free_access, created_at')
        .eq('has_free_access', true)
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data) {
        // Get trip counts for each user
        const usersWithTrips = await Promise.all(
          data.map(async (pref) => {
            const { count, error: countError } = await supabase
              .from('trips')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', pref.user_id)
            
            return {
              user_id: pref.user_id,
              email: pref.email,
              trip_count: countError ? 0 : (count || 0),
              granted_at: pref.created_at,
            }
          })
        )
        setFreeAccessUsers(usersWithTrips)
      }
    } catch (error) {
      console.error('Error loading free access users:', error)
    } finally {
      setIsLoadingFreeAccess(false)
    }
  }

  // Search for users by email or user_id
  const handleSearchUsers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    try {
      setIsSearching(true)
      const query = searchQuery.trim()
      const isEmailSearch = query.includes('@')

      let userResults: Array<{ user_id: string; email?: string; has_free_access?: boolean }> = []

      if (isEmailSearch) {
        // Search by email using database function to query auth.users
        const { data: authUsers, error: authError } = await supabase.rpc('admin_lookup_user_by_email', {
          search_email: query
        })

        if (authError) {
          console.error('Error searching auth.users:', authError)
          // Fallback: try user_preferences table
          const { data: prefsData, error: prefsError } = await supabase
            .from('user_preferences')
            .select('user_id, email, has_free_access')
            .ilike('email', `%${query}%`)
            .limit(20)

          if (prefsError) throw prefsError

          if (prefsData && prefsData.length > 0) {
            userResults = prefsData.map((pref: any) => ({
              user_id: pref.user_id,
              email: pref.email,
              has_free_access: pref.has_free_access || false,
            }))
          }
        } else if (authUsers && authUsers.length > 0) {
          // Found users in auth.users - get their preferences
          const userIds = authUsers.map((u: any) => u.user_id)
          const { data: prefsData } = await supabase
            .from('user_preferences')
            .select('user_id, email, has_free_access')
            .in('user_id', userIds)

          // Map auth users with their preferences
          userResults = authUsers.map((authUser: any) => {
            const pref = prefsData?.find((p: any) => p.user_id === authUser.user_id)
            return {
              user_id: authUser.user_id,
              email: authUser.email, // Use email from auth.users
              has_free_access: pref?.has_free_access || false,
            }
          })
        }
      } else {
        // Search by user_id (UUID format) - check trips table
        const { data: tripsData, error: tripsError } = await supabase
          .from('trips')
          .select('user_id')
          .ilike('user_id', `%${query}%`)
          .limit(10)

        if (tripsError) throw tripsError

        if (tripsData) {
          const uniqueUserIds = [...new Set(tripsData.map(t => t.user_id))]
          
          // Get user preferences for these user_ids to get email
          const { data: prefsData } = await supabase
            .from('user_preferences')
            .select('user_id, email, has_free_access')
            .in('user_id', uniqueUserIds)

          userResults = uniqueUserIds.map(id => {
            const pref = prefsData?.find(p => p.user_id === id)
            return {
              user_id: id,
              email: pref?.email,
              has_free_access: pref?.has_free_access || false,
            }
          })
        }
      }

      if (userResults.length > 0) {
        // Get trip counts
        const results = await Promise.all(
          userResults.map(async (user) => {
            const { count, error: countError } = await supabase
              .from('trips')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.user_id)

            return {
              user_id: user.user_id,
              email: user.email,
              has_free_access: user.has_free_access || false,
              trip_count: countError ? 0 : (count || 0),
            }
          })
        )

        setSearchResults(results)
      } else {
        setSearchResults([])
      }
    } catch (error) {
      console.error('Error searching users:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // Toggle free access for a user
  const handleToggleFreeAccess = async (userId: string, currentStatus: boolean, userEmail?: string) => {
    try {
      // If we don't have email, try to get it from auth.users via function
      let emailToStore = userEmail
      if (!emailToStore) {
        try {
          const { data: authUser } = await supabase.rpc('admin_lookup_user_by_id', {
            lookup_user_id: userId
          })
          if (authUser && authUser.length > 0) {
            emailToStore = authUser[0].email
          }
        } catch (_e) {
          // Function might not exist, that's okay
        }
      }

      // Get existing preferences to preserve other fields
      const { data: existingPrefs } = await supabase
        .from('user_preferences')
        .select('email, default_passport_country')
        .eq('user_id', userId)
        .single()

      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          email: emailToStore || existingPrefs?.email || null, // Store email from search or existing
          default_passport_country: existingPrefs?.default_passport_country || null, // Preserve existing
          has_free_access: !currentStatus,
        }, {
          onConflict: 'user_id',
        })

      if (error) throw error

      // Refresh lists
      await loadFreeAccessUsers()
      if (searchQuery.trim()) {
        await handleSearchUsers() // Refresh search results if search is active
      }
    } catch (error) {
      console.error('Error toggling free access:', error)
      alert('Failed to update free access. Please try again.')
    }
  }

  const calculateStats = (tripsData: Trip[], userCount: number) => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    
    const totalTrips = tripsData.length
    const activeTrips = tripsData.filter(t => !t.endDate).length
    const completedTrips = tripsData.filter(t => t.endDate).length
    
    // Unique countries visited
    const uniqueCountries = new Set(tripsData.map(t => t.destination)).size
    
    // Total days traveled (completed trips only)
    let totalDaysTraveled = 0
    tripsData.forEach(trip => {
      if (trip.endDate) {
        const start = new Date(trip.startDate)
        const end = new Date(trip.endDate)
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
        totalDaysTraveled += days
      }
    })
    
    // Trips this month
    const tripsThisMonth = tripsData.filter(t => {
      const startDate = new Date(t.startDate)
      return startDate.getFullYear() === currentYear && startDate.getMonth() === currentMonth
    }).length
    
    // Trips this year
    const tripsThisYear = tripsData.filter(t => {
      const startDate = new Date(t.startDate)
      return startDate.getFullYear() === currentYear
    }).length
    
    // Total Schengen days used across all users
    const schengenTrips = tripsData.filter(t => t.isSchengen)
    const totalSchengenDays = calculateSchengenDaysUsed(schengenTrips)

    setStats({
      totalUsers: userCount,
      activeUsers: userCount, // Users with trips
      totalTrips,
      activeTrips,
      completedTrips,
      uniqueCountries,
      totalDaysTraveled,
      tripsThisMonth,
      tripsThisYear,
      totalSchengenDays,
    })
  }

  // Get most visited countries across all users
  const getMostVisitedCountries = () => {
    const countryCounts: Record<string, number> = {}
    allTrips.forEach(trip => {
      countryCounts[trip.destination] = (countryCounts[trip.destination] || 0) + 1
    })
    return Object.entries(countryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([country, count]) => ({ country, count }))
  }

  // Get recent trips across all users
  const getRecentTrips = () => {
    return allTrips
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .slice(0, 10)
  }

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-white to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading admin analytics...</p>
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
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Button
                variant="ghost"
                onClick={() => navigate('/trips')}
                className="flex items-center gap-2"
                size="sm"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back to Trips</span>
              </Button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Admin Dashboard
                </h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-600" />
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{stats.totalUsers}</div>
              <p className="text-xs text-slate-500 mt-1">All registered users</p>
            </CardContent>
          </Card>

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
                {stats.activeTrips} active, {stats.completedTrips} completed (sitewide)
              </p>
            </CardContent>
          </Card>

          <Card className="border-cyan-200 bg-gradient-to-br from-cyan-50 to-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Globe className="h-4 w-4 text-cyan-600" />
                Countries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-cyan-600">{stats.uniqueCountries}</div>
              <p className="text-xs text-slate-500 mt-1">Unique destinations (all users)</p>
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
              <p className="text-xs text-slate-500 mt-1">Total days traveled (all users)</p>
            </CardContent>
          </Card>
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-600" />
                This Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.tripsThisMonth}</div>
              <p className="text-xs text-slate-500 mt-1">New trips this month (all users)</p>
            </CardContent>
          </Card>

          <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-600" />
                This Year
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-600">{stats.tripsThisYear}</div>
              <p className="text-xs text-slate-500 mt-1">Trips in {new Date().getFullYear()} (all users)</p>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Database className="h-4 w-4 text-amber-600" />
                Schengen Days
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{stats.totalSchengenDays}</div>
              <p className="text-xs text-slate-500 mt-1">Total Schengen zone days used</p>
            </CardContent>
          </Card>
        </div>

        {/* User Management Section */}
        <Card className="mb-8 border-slate-200">
          <CardHeader 
            className="cursor-pointer hover:bg-slate-50 transition-colors"
            onClick={() => setIsUserManagementOpen(!isUserManagementOpen)}
          >
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-600" />
                User Management - Free Access
              </div>
              {isUserManagementOpen ? (
                <ChevronUp className="h-5 w-5 text-purple-600" />
              ) : (
                <ChevronDown className="h-5 w-5 text-purple-600" />
              )}
            </CardTitle>
          </CardHeader>
          {isUserManagementOpen && (
          <CardContent className="space-y-6">
            {/* Search Users */}
            <div className="space-y-2">
              <Label htmlFor="user-search">Search by Email or User ID</Label>
              <div className="flex gap-2">
                <Input
                  id="user-search"
                  placeholder="Enter email address or user ID (UUID)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearchUsers()
                    }
                  }}
                />
                <Button
                  onClick={handleSearchUsers}
                  disabled={isSearching || !searchQuery.trim()}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Search for users by email address (e.g., user@example.com) or user ID (UUID). Email search requires the database function to be set up.
              </p>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-700">Search Results</h3>
                <div className="space-y-2">
                  {searchResults.map((result) => (
                    <div key={result.user_id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                      <div className="flex-1">
                        {result.email && (
                          <p className="text-sm font-medium text-slate-800">{result.email}</p>
                        )}
                        <p className="text-sm font-mono text-slate-600">{result.user_id}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {result.trip_count} {result.trip_count === 1 ? 'trip' : 'trips'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {result.has_free_access && (
                          <Badge className="bg-green-100 text-green-800 border-green-200">
                            <UserCheck className="h-3 w-3 mr-1" />
                            Free Access
                          </Badge>
                        )}
                        <Button
                          onClick={() => handleToggleFreeAccess(result.user_id, result.has_free_access, result.email)}
                          variant={result.has_free_access ? "destructive" : "default"}
                          size="sm"
                          className={result.has_free_access ? "" : "bg-green-600 hover:bg-green-700"}
                        >
                          {result.has_free_access ? (
                            <>
                              <UserX className="h-4 w-4 mr-1" />
                              Revoke
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-4 w-4 mr-1" />
                              Grant Free Access
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Users with Free Access */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Users with Free Access</h3>
                <Badge variant="secondary">{freeAccessUsers.length}</Badge>
              </div>
              {isLoadingFreeAccess ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                </div>
              ) : freeAccessUsers.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {freeAccessUsers.map((freeUser) => (
                    <div key={freeUser.user_id} className="flex items-center justify-between p-3 bg-white border border-green-200 rounded-lg">
                      <div className="flex-1">
                        {freeUser.email && (
                          <p className="text-sm font-medium text-slate-800">{freeUser.email}</p>
                        )}
                        <p className="text-sm font-mono text-slate-600">{freeUser.user_id}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {freeUser.trip_count} {freeUser.trip_count === 1 ? 'trip' : 'trips'} • 
                          Granted {new Date(freeUser.granted_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        onClick={() => handleToggleFreeAccess(freeUser.user_id, true, freeUser.email)}
                        variant="destructive"
                        size="sm"
                      >
                        <UserX className="h-4 w-4 mr-1" />
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">No users with free access</p>
              )}
            </div>
          </CardContent>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Most Visited Countries */}
          <Card className="border-slate-200">
            <CardHeader 
              className="cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => setIsMostVisitedOpen(!isMostVisitedOpen)}
            >
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-blue-600" />
                  Most Visited Countries
                </div>
                {isMostVisitedOpen ? (
                  <ChevronUp className="h-5 w-5 text-slate-600" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-slate-600" />
                )}
              </CardTitle>
            </CardHeader>
            {isMostVisitedOpen && (
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
            )}
          </Card>

          {/* Recent Trips */}
          <Card className="border-slate-200">
            <CardHeader 
              className="cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => setIsRecentTripsOpen(!isRecentTripsOpen)}
            >
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-cyan-600" />
                  Recent Trips
                </div>
                {isRecentTripsOpen ? (
                  <ChevronUp className="h-5 w-5 text-slate-600" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-slate-600" />
                )}
              </CardTitle>
            </CardHeader>
            {isRecentTripsOpen && (
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
            )}
          </Card>
        </div>
      </main>
    </div>
  )
}
