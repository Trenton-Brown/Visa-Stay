import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { countries } from '@/lib/countries'
import { supabase } from '@/lib/supabase'
import { Trip, dbRowToTrip, tripToDbInsert } from '@/types/database'
import { checkVisaRequirements } from '@/lib/visaApi'
import { initializeDestinations } from '@/lib/destinations'
import { Combobox } from '@/components/ui/combobox'
import { isSchengenCountry, calculateRemainingDays, calculateSchengenDaysUsed, calculateRemainingSchengenDays } from '@/lib/schengen'
import { formatLocalDate, parseToLocalDayStart } from '@/lib/date'
import { Plus, MapPin, Calendar, LogOut, Trash2, Edit2, Globe, Loader2, AlertCircle, ExternalLink, Info, Clock, Lock, Unlock, CheckCircle2, Home, FileText } from 'lucide-react'

export function Trips() {
  const { user, logout, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [trips, setTrips] = useState<Trip[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTripId, setEditingTripId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [visaData, setVisaData] = useState<Record<string, any>>({})
  const [visaLoading, setVisaLoading] = useState<Record<string, boolean>>({})
  const requestedTripsRef = useRef<Set<string>>(new Set())
  const [destinations, setDestinations] = useState<string[]>([])
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(false)
  const [defaultPassport, setDefaultPassport] = useState<string | null>(null)
  const [isPassportLocked, setIsPassportLocked] = useState(true)
  const [formData, setFormData] = useState({
    destination: '',
    passportCountry: '',
    startDate: '',
    endDate: '',
    notes: '',
    taxResidencyNotes: '',
  })

  useEffect(() => {
    if (loading) return
    
    if (!isAuthenticated || !user) {
      navigate('/login')
      return
    }

    // Load trips from Supabase
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
          const tripsData = data.map(dbRowToTrip).filter((trip: Trip | undefined): trip is Trip => trip !== undefined)
          // Sort: active trips (no end_date) first, then completed trips
          // Within each group, sort by start_date descending (most recent first)
          tripsData.sort((a: Trip, b: Trip) => {
            const aIsActive = !a.endDate
            const bIsActive = !b.endDate
            
            // Active trips come before completed trips
            if (aIsActive && !bIsActive) return -1
            if (!aIsActive && bIsActive) return 1
            
            // Within same group, sort by start_date descending
            return parseToLocalDayStart(b.startDate).getTime() - parseToLocalDayStart(a.startDate).getTime()
          })
          setTrips(tripsData)
          
          // Populate visaData state from stored visa_data in trips
          // Handle both formats: full response (with data/meta) or just data part
          const initialVisaData: Record<string, any> = {}
          tripsData.forEach(trip => {
            if (trip.visaData) {
              // If it's a full response with 'data' property, extract just the data part for UI
              // Otherwise, use it as-is (might be old format with just data)
              const visaDataForUI = (trip.visaData as any).data || trip.visaData
              initialVisaData[trip.id] = visaDataForUI
            }
          })
          if (Object.keys(initialVisaData).length > 0) {
            setVisaData(prev => ({ ...prev, ...initialVisaData }))
          }
        }
      } catch (error) {
        console.error('Error fetching trips:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTrips()
  }, [isAuthenticated, user, loading, navigate])

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

  // Load user's default passport preference
  useEffect(() => {
    if (!user) return

    const loadDefaultPassport = async () => {
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('default_passport_country')
          .eq('user_id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
          console.error('Error loading default passport:', error)
          return
        }

        if (data?.default_passport_country) {
          setDefaultPassport(data.default_passport_country)
          setFormData((prev) => ({ ...prev, passportCountry: data.default_passport_country }))
        }
      } catch (error) {
        console.error('Error loading default passport:', error)
      }
    }

    loadDefaultPassport()
  }, [user])

  // Handle prefill from PassportDestinationPage
  useEffect(() => {
    const state = location.state as { prefillDestination?: string; prefillPassport?: string } | null
    if (state?.prefillDestination || state?.prefillPassport) {
      setFormData(prev => ({
        ...prev,
        destination: state.prefillDestination || prev.destination,
        passportCountry: state.prefillPassport || prev.passportCountry,
      }))
      setIsDialogOpen(true)
      // Clear the state to prevent re-prefilling on re-renders
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const fetchVisaInfo = useCallback(async (tripId: string, passportCountry: string, destination: string, existingVisaData?: any) => {
    // Skip if already requested
    if (requestedTripsRef.current.has(tripId)) {
      return
    }

    // If trip already has visa data stored, use it instead of fetching
    if (existingVisaData) {
      // Handle both formats: full response (with data/meta) or just data part
      const visaDataForUI = (existingVisaData as any).data || existingVisaData
      setVisaData((prev) => ({ ...prev, [tripId]: visaDataForUI }))
      return
    }

    // Mark as requested
    requestedTripsRef.current.add(tripId)
    setVisaLoading((prev) => ({ ...prev, [tripId]: true }))

    try {
      const result = await checkVisaRequirements(passportCountry, destination)
      // Store full response in state (UI expects data part, so we'll extract it when rendering)
      setVisaData((prev) => ({ ...prev, [tripId]: result.data }))
      
      // Store FULL visa response (including meta) back to the trip in the database
      if (user) {
        const fullResponse = result as unknown as Record<string, unknown>
        const { error: updateError } = await supabase
          .from('trips')
          .update({ visa_data: fullResponse })
          .eq('id', tripId)
          .eq('user_id', user.id)
        
        if (updateError) {
          console.error(`Error storing visa_data for trip ${tripId}:`, updateError)
        } else {
          // Update the trip in state to include visaData (store full response)
          setTrips(prevTrips => 
            prevTrips.map(trip => 
              trip.id === tripId 
                ? { ...trip, visaData: fullResponse }
                : trip
            )
          )
        }
      }
    } catch (error) {
      console.error(`Error fetching visa info for trip ${tripId}:`, error)
      // Remove from requested set on error so it can be retried
      requestedTripsRef.current.delete(tripId)
    } finally {
      setVisaLoading((prev) => ({ ...prev, [tripId]: false }))
    }
  }, [])

  // Fetch visa info when trips change
  useEffect(() => {
    if (trips.length > 0) {
      trips.forEach((trip: Trip) => {
        // Only fetch if not already requested
        if (!requestedTripsRef.current.has(trip.id)) {
          fetchVisaInfo(trip.id, trip.passportCountry, trip.destination, trip.visaData)
        }
      })
    }
  }, [trips, fetchVisaInfo])

  // Save default passport preference
  const saveDefaultPassport = async (passportCountry: string) => {
    if (!user) {
      return
    }

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            email: user.email, // Store email for admin lookup
            default_passport_country: passportCountry,
          },
          {
            onConflict: 'user_id',
          }
        )


      if (error) throw error
      setDefaultPassport(passportCountry)
    } catch (error) {
      console.error('Error saving default passport:', error)
    }
  }

  const handleAddTrip = async () => {
    if (!formData.destination || !formData.passportCountry || !formData.startDate || !user) {
      return
    }

    try {
      // Save as default passport if not already set
      if (!defaultPassport && formData.passportCountry) {
        await saveDefaultPassport(formData.passportCountry)
      }

      // Determine if destination is in Schengen zone
      const isSchengen = isSchengenCountry(formData.destination)

      // Fetch visa data for this trip (will be stored in DB)
      // Store the FULL API response (including meta) in the database
      let visaDataToStore: Record<string, unknown> | null = null
      try {
        const visaResult = await checkVisaRequirements(formData.passportCountry, formData.destination)
        // Store the FULL response (data + meta) in the database
        visaDataToStore = visaResult as unknown as Record<string, unknown>
        // For UI state, use just the data part (UI expects visa.visa_rules format)
        const visaDataForUI = visaResult.data as Record<string, unknown>
        // Also populate visaData state immediately (UI expects data part)
        if (editingTripId) {
          setVisaData((prev) => ({ ...prev, [editingTripId]: visaDataForUI }))
        }
      } catch (error) {
        console.error('Error fetching visa data for trip:', error)
        // Continue without visa data - it can be fetched later
      }

      if (editingTripId) {
        // Update existing trip
        const { data, error } = await supabase
          .from('trips')
          .update({
            destination: formData.destination,
            passport_country: formData.passportCountry,
            start_date: formData.startDate,
            end_date: formData.endDate || null,
            notes: formData.notes || null,
            tax_residency_notes: formData.taxResidencyNotes || null,
            is_schengen: isSchengen,
            visa_data: visaDataToStore,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingTripId)
          .eq('user_id', user.id)
          .select()
          .single()


        if (error) throw error

        if (data) {
          const updatedTrip = dbRowToTrip(data)
          setTrips(trips.map((trip) => (trip.id === editingTripId ? updatedTrip : trip)))
          // Update visaData state (extract data part for UI if it's full response)
          if (visaDataToStore) {
            const visaDataForUI = (visaDataToStore as any).data || visaDataToStore
            setVisaData((prev) => ({ ...prev, [editingTripId]: visaDataForUI }))
          }
        }
        setEditingTripId(null)
      } else {
        // Add new trip
        const tripInsert = tripToDbInsert(
          {
            destination: formData.destination,
            passportCountry: formData.passportCountry,
            startDate: formData.startDate,
            endDate: formData.endDate || undefined,
            notes: formData.notes || undefined,
            taxResidencyNotes: formData.taxResidencyNotes || undefined,
            isSchengen: isSchengen,
          },
          user.id
        )


        // Add visa_data to the insert
        const tripInsertWithVisa = {
          ...tripInsert,
          visa_data: visaDataToStore,
        }


        const { data, error } = await supabase
          .from('trips')
          .insert(tripInsertWithVisa)
          .select()
          .single()


        if (error) throw error

        if (data) {
          const newTrip = dbRowToTrip(data)
          setTrips([newTrip, ...trips])
          // Update visaData state (extract data part for UI if it's full response)
          if (visaDataToStore) {
            const visaDataForUI = (visaDataToStore as any).data || visaDataToStore
            setVisaData((prev) => ({ ...prev, [newTrip.id]: visaDataForUI }))
          }
        }
      }


      // Reset form but keep default passport
      setFormData({ 
        destination: '', 
        passportCountry: defaultPassport || '', 
        startDate: '', 
        endDate: '', 
        notes: '',
        taxResidencyNotes: ''
      })
      setIsPassportLocked(true)
      setIsDialogOpen(false)
    } catch (error) {
      console.error('Error saving trip:', error)
      alert('Failed to save trip. Please try again.')
    }
  }

  const handleEditTrip = (trip: Trip) => {
    setFormData({
      destination: trip.destination,
      passportCountry: trip.passportCountry,
      startDate: trip.startDate,
      endDate: trip.endDate || '',
      notes: trip.notes || '',
      taxResidencyNotes: trip.taxResidencyNotes || '',
    })
    setEditingTripId(trip.id)
    // When editing, unlock passport so they can change it if needed
    setIsPassportLocked(false)
    setIsDialogOpen(true)
  }

  const handleCancelEdit = () => {
    setFormData({ 
      destination: '', 
      passportCountry: defaultPassport || '', 
      startDate: '', 
      endDate: '', 
      notes: '',
      taxResidencyNotes: ''
    })
    setEditingTripId(null)
    setIsPassportLocked(true)
    setIsDialogOpen(false)
  }

  const handlePassportChange = (value: string) => {
    setFormData({ ...formData, passportCountry: value })
    // Save as default when user changes it (if unlocked)
    if (!isPassportLocked && value) {
      saveDefaultPassport(value)
    }
  }

  const togglePassportLock = () => {
    setIsPassportLocked(!isPassportLocked)
    // If locking and there's a default, restore it
    if (!isPassportLocked && defaultPassport) {
      setFormData({ ...formData, passportCountry: defaultPassport })
    }
  }

  const handleDeleteTrip = async (id: string) => {
    if (!user) return

    if (!confirm('Are you sure you want to delete this trip?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('trips')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) throw error

      setTrips(trips.filter((trip) => trip.id !== id))
    } catch (error) {
      console.error('Error deleting trip:', error)
      alert('Failed to delete trip. Please try again.')
    }
  }

  const handleMarkComplete = async (trip: Trip) => {
    if (!user) return

    // Set end date to today
    const today = new Date().toISOString().split('T')[0] // Format as YYYY-MM-DD

    try {
      const { data, error } = await supabase
        .from('trips')
        .update({ end_date: today })
        .eq('id', trip.id)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) throw error

      if (data) {
        setTrips(trips.map((t) => (t.id === trip.id ? dbRowToTrip(data) : t)))
      }
    } catch (error) {
      console.error('Error marking trip as complete:', error)
      alert('Failed to update trip. Please try again.')
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-white to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-white to-white">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
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
              <p className="text-sm text-slate-600">Welcome back, {user?.name || user?.email}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={() => navigate('/dashboard')}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
                size="sm"
              >
                Dashboard
              </Button>
              {/* Admin button - only visible to trenton.brown99 */}
              {user?.email?.includes('trenton.brown99') && (
                <Button
                  onClick={() => navigate('/admin')}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                  size="sm"
                >
                  Admin
                </Button>
              )}
              <Button
                onClick={() => navigate('/')}
                variant="outline"
                size="sm"
                title="Home"
              >
                <Home className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleLogout}
                variant="outline"
                size="sm"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-4xl font-bold tracking-tight mb-2 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                  My Trips
                </h2>
                <p className="text-slate-600">Manage your upcoming and past trips</p>
              </div>
              <Dialog 
                open={isDialogOpen} 
                onOpenChange={(open: boolean) => {
                  setIsDialogOpen(open)
                  if (open && !editingTripId) {
                    // Reset form with default passport when opening for new trip
                    setFormData({ 
                      destination: '', 
                      passportCountry: defaultPassport || '', 
                      startDate: '', 
                      endDate: '', 
                      notes: '',
                      taxResidencyNotes: ''
                    })
                    setIsPassportLocked(true)
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 gap-2">
                    <Plus className="h-4 w-4" />
                    Add Trip
                  </Button>
                </DialogTrigger>
                <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingTripId ? 'Edit Trip' : 'Add New Trip'}</DialogTitle>
                  <DialogDescription>
                    {editingTripId 
                      ? "Update your trip details or add an end date if you know when you're leaving."
                      : 'Add a new trip to track your travel plans and visa requirements.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="passportCountry">Passport Country *</Label>
                      {defaultPassport && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={togglePassportLock}
                          className="h-8 px-2 text-xs"
                        >
                          {isPassportLocked ? (
                            <>
                              <Unlock className="h-3 w-3 mr-1" />
                              Unlock
                            </>
                          ) : (
                            <>
                              <Lock className="h-3 w-3 mr-1" />
                              Lock
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    <div className="relative">
                      <Select
                        value={formData.passportCountry}
                        onValueChange={handlePassportChange}
                        disabled={isPassportLocked && !!defaultPassport}
                      >
                        <SelectTrigger className={isPassportLocked && defaultPassport ? "bg-slate-50" : ""}>
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
                      {isPassportLocked && defaultPassport && (
                        <div className="absolute right-10 top-1/2 -translate-y-1/2 pointer-events-none">
                          <Lock className="h-4 w-4 text-slate-400" />
                        </div>
                      )}
                    </div>
                    {defaultPassport && isPassportLocked && (
                      <p className="text-xs text-slate-500">
                        Using your default passport. Click "Unlock" to change it.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="destination">Destination *</Label>
                    {isLoadingDestinations ? (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading destinations...</span>
                      </div>
                    ) : (
                      <Combobox
                        options={destinations}
                        value={formData.destination}
                        onValueChange={(value: string) => setFormData({ ...formData, destination: value })}
                        placeholder="Search and select destination..."
                        searchPlaceholder="Search destinations..."
                        emptyMessage="No destinations found."
                        portalled={false}
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Start Date *</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={formData.startDate}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, startDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate">End Date (Optional)</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={formData.endDate}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, endDate: e.target.value })}
                        placeholder="Leave blank if unknown"
                      />
                    </div>
                  </div>
                  
                  {/* Tax Residency Information Section */}
                  <div className="pt-4 border-t">
                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3 mb-4">
                      <div className="flex items-start gap-2 mb-2">
                        <FileText className="h-4 w-4 text-slate-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-slate-900 mb-1">
                            Tax Residency Information
                          </p>
                          <p className="text-xs text-slate-700 mb-3">
                            Tax residency rules vary by country and can affect your tax obligations. Check the OECD portal for specific requirements.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            className="w-full text-xs mb-2"
                            onClick={() => window.open('https://www.oecd.org/en/networks/global-forum-tax-transparency/resources/aeoi-implementation-portal/tax-residency.html', '_blank')}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View Tax Residency Rules
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="taxResidencyNotes">Tax Residency Notes (Optional)</Label>
                        <span className={`text-xs ${(formData.taxResidencyNotes || '').length > 2000 ? 'text-red-600' : (formData.taxResidencyNotes || '').length > 1500 ? 'text-orange-600' : 'text-slate-500'}`}>
                          {(formData.taxResidencyNotes || '').length} / 2000
                        </span>
                      </div>
                      <Textarea
                        id="taxResidencyNotes"
                        placeholder="Add any tax residency considerations for this trip (e.g., key dates, thresholds, or links)..."
                        value={formData.taxResidencyNotes || ''}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                          const value = e.target.value
                          if (value.length <= 2000) {
                            setFormData({ ...formData, taxResidencyNotes: value })
                          }
                        }}
                        rows={4}
                        maxLength={2000}
                        className={(formData.taxResidencyNotes || '').length > 2000 ? 'border-red-300 focus-visible:ring-red-500' : ''}
                      />
                      {(formData.taxResidencyNotes || '').length > 1500 && (
                        <p className="text-xs text-slate-500">
                          {(formData.taxResidencyNotes || '').length >= 2000 
                            ? 'Character limit reached. Consider summarizing key points or adding links instead.'
                            : 'Approaching character limit. Consider summarizing key points.'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="notes">Other Notes (Optional)</Label>
                      <span className={`text-xs ${(formData.notes || '').length > 2000 ? 'text-red-600' : (formData.notes || '').length > 1500 ? 'text-orange-600' : 'text-slate-500'}`}>
                        {(formData.notes || '').length} / 2000
                      </span>
                    </div>
                    <Textarea
                      id="notes"
                      placeholder="Add any other notes about your trip..."
                      value={formData.notes || ''}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                        const value = e.target.value
                        if (value.length <= 2000) {
                          setFormData({ ...formData, notes: value })
                        }
                      }}
                      rows={4}
                      maxLength={2000}
                      className={(formData.notes || '').length > 2000 ? 'border-red-300 focus-visible:ring-red-500' : ''}
                    />
                    {(formData.notes || '').length > 1500 && (
                      <p className="text-xs text-slate-500">
                        {(formData.notes || '').length >= 2000 
                          ? 'Character limit reached.'
                          : 'Approaching character limit.'}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    * Required fields. You can add the end date later by editing the trip.
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddTrip}
                    className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                  >
                    {editingTripId ? 'Update Trip' : 'Add Trip'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </div>
            
            {/* Schengen Days Tally */}
            {(() => {
              const schengenTrips = trips.filter(t => t.isSchengen)
              if (schengenTrips.length > 0) {
                const used = calculateSchengenDaysUsed(schengenTrips)
                const remaining = calculateRemainingSchengenDays(schengenTrips)
                return (
                  <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 mb-6">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                            <Globe className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-800">Schengen Zone Days</h3>
                            <p className="text-sm text-slate-600">90 days in any 180-day period</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-blue-600">{used}</p>
                            <p className="text-xs text-slate-600">Days Used</p>
                          </div>
                          <div className="h-12 w-px bg-slate-300"></div>
                          <div className="text-center">
                            <p className={`text-2xl font-bold ${remaining < 30 ? 'text-red-600' : remaining < 60 ? 'text-yellow-600' : 'text-green-600'}`}>
                              {remaining}
                            </p>
                            <p className="text-xs text-slate-600">Days Remaining</p>
                          </div>
                        </div>
                      </div>
                      {remaining < 30 && (
                        <div className="mt-3 pt-3 border-t border-blue-200">
                          <div className="flex items-center gap-2 text-sm text-red-700">
                            <AlertCircle className="h-4 w-4" />
                            <span>Warning: Less than 30 days remaining in Schengen zone</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              }
              return null
            })()}
          </div>

          {/* Trips Grid */}
          {trips.length === 0 ? (
            <Card className="border-2 border-dashed border-slate-300">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <MapPin className="h-12 w-12 text-slate-400 mb-4" />
                <h3 className="text-xl font-semibold text-slate-700 mb-2">No trips yet</h3>
                <p className="text-slate-600 text-center mb-6">
                  Start planning your next adventure by adding your first trip
                </p>
                <Button
                  onClick={() => setIsDialogOpen(true)}
                  className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Your First Trip
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {trips.map((trip) => {
                if (!trip) return null
                const visa = visaData[trip.id]
                const isLoadingVisa = visaLoading[trip.id]
                const colorMap: Record<string, { bg: string; text: string; label: string }> = {
                  green: { bg: 'bg-green-100', text: 'text-green-800', label: 'Visa-Free' },
                  blue: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'VOA/eVisa' },
                  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'eTA' },
                  red: { bg: 'bg-red-100', text: 'text-red-800', label: 'Visa Required' },
                }
                const primaryColor = visa?.visa_rules?.primary_rule?.color 
                  ? colorMap[visa.visa_rules.primary_rule.color] || colorMap.blue
                  : null
                const duration = visa?.visa_rules?.primary_rule?.duration || visa?.visa_rules?.secondary_rule?.duration

                const isCompleted = !!trip.endDate
                const endDate = trip.endDate ? parseToLocalDayStart(trip.endDate) : null
                const today = new Date()
                today.setHours(0, 0, 0, 0)
                const isCompletedToday = endDate && endDate.getTime() === today.getTime()

                // Calculate remaining days for card color
                let remainingDays: number | null = null
                let isOverstayed = false
                let overstayDays = 0
                
                if (!isCompleted && visa) {
                  // Check if trip is currently active (today is within trip dates or trip is open-ended)
                  const tripStart = parseToLocalDayStart(trip.startDate)
                  tripStart.setHours(0, 0, 0, 0)
                  const tripEnd = trip.endDate ? parseToLocalDayStart(trip.endDate) : today
                  tripEnd.setHours(23, 59, 59, 999)
                  const isTripActive = today >= tripStart && today <= tripEnd
                  
                  if (trip.isSchengen) {
                    const schengenTrips = trips.filter(t => t.isSchengen)
                    const used = calculateSchengenDaysUsed(schengenTrips)
                    remainingDays = calculateRemainingSchengenDays(schengenTrips)
                    
                    // For Schengen, check if we've exceeded 90 days and trip is active
                    if (isTripActive && used > 90) {
                      isOverstayed = true
                      overstayDays = used - 90
                    }
                  } else {
                    remainingDays = calculateRemainingDays(trip.startDate, duration)
                    
                    // For non-Schengen, check if visa has expired
                    if (duration && isTripActive) {
                      // Parse duration to get visa end date
                      const durationMatch = duration.match(/(\d+)\s*(day|days|month|months)/i)
                      if (durationMatch) {
                        const amount = parseInt(durationMatch[1])
                        const unit = durationMatch[2].toLowerCase()
                        let totalDays = unit.includes('month') ? amount * 30 : amount
                        
                        const start = parseToLocalDayStart(trip.startDate)
                        const visaEndDate = new Date(start)
                        visaEndDate.setDate(visaEndDate.getDate() + totalDays)
                        visaEndDate.setHours(23, 59, 59, 999)
                        
                        // Check if today is past the visa end date
                        if (today > visaEndDate) {
                          isOverstayed = true
                          overstayDays = Math.ceil((today.getTime() - visaEndDate.getTime()) / (1000 * 60 * 60 * 24))
                        }
                      }
                    }
                  }
                }

                // Determine card color based on remaining days
                let cardBorderClass = 'border-blue-100'
                let cardBgClass = ''
                let warningMessage = ''
                
                if (!isCompleted && remainingDays !== null) {
                  if (isOverstayed) {
                    // Overstayed - Red
                    cardBorderClass = 'border-red-400'
                    cardBgClass = 'bg-red-50/50'
                    warningMessage = `⚠️ You have overstayed by ${overstayDays} day${overstayDays !== 1 ? 's' : ''}`
                  } else if (remainingDays <= 7) {
                    // 1 week or less - Orange
                    cardBorderClass = 'border-orange-400'
                    cardBgClass = 'bg-orange-50/50'
                  } else if (remainingDays <= 14) {
                    // 2 weeks or less - Yellow
                    cardBorderClass = 'border-yellow-400'
                    cardBgClass = 'bg-yellow-50/50'
                  }
                }

                return (
                  <Card key={trip.id} className={`border-2 shadow-md hover:shadow-lg transition-shadow ${cardBorderClass} ${cardBgClass} ${
                    isCompleted 
                      ? 'border-green-200 bg-green-50/30' 
                      : ''
                  }`}>
                    <CardHeader>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className={`text-xl mb-0 ${isCompleted ? 'text-slate-600 line-through' : 'text-slate-800'}`}>
                              {trip.destination}
                            </CardTitle>
                            {isCompleted && (
                              <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Complete
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-slate-600 text-sm mb-2">
                            <Globe className="h-4 w-4" />
                            <span>{trip.passportCountry} passport</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-600 text-sm">
                            <Calendar className="h-4 w-4" />
                            <span>
                              {formatLocalDate(trip.startDate)} 
                              {trip.endDate 
                                ? ` - ${formatLocalDate(trip.endDate)}`
                                : ' - Open-ended'}
                            </span>
                          </div>
                          {isCompletedToday && (
                            <div className="flex items-center gap-2 text-slate-500 text-xs mt-1">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Completed today</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {!trip.endDate && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleMarkComplete(trip)}
                              className="text-slate-600 hover:text-slate-700 hover:bg-slate-50"
                              title="Mark as complete (set end date to today)"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditTrip(trip)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteTrip(trip.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {!trip.endDate && (
                        <div className="mb-3">
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
                            Open-ended trip
                          </Badge>
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Overstay Warning */}
                      {warningMessage && (
                        <div className="bg-red-100 border-2 border-red-400 rounded-md p-3 mb-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-red-700 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-semibold text-red-900">{warningMessage}</p>
                              <p className="text-xs text-red-700 mt-1">Please take immediate action to resolve your visa status.</p>
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Visa Information */}
                      {isLoadingVisa ? (
                        <div className="flex items-center gap-2 text-slate-600 text-sm">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading visa info...</span>
                        </div>
                      ) : visa ? (
                        <div className="space-y-2">
                          {/* Primary Visa Rule */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {primaryColor && (
                              <Badge className={`${primaryColor.bg} ${primaryColor.text} border-0`}>
                                {primaryColor.label}
                              </Badge>
                            )}
                            {duration && (
                              <Badge variant="outline">{duration}</Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium text-slate-800">
                            {visa.visa_rules.primary_rule.name}
                            {visa.visa_rules.secondary_rule && ` / ${visa.visa_rules.secondary_rule.name}`}
                          </p>
                          
                          {/* Remaining Days */}
                          {(() => {
                            if (trip.isSchengen) {
                              const schengenTrips = trips.filter(t => t.isSchengen)
                              const remaining = calculateRemainingSchengenDays(schengenTrips)
                              return (
                                <div className="mt-2 flex items-center gap-2 text-xs">
                                  <Clock className="h-3 w-3 text-slate-600" />
                                  <span className="text-slate-600">
                                    <span className="font-semibold">{remaining}</span> Schengen days remaining
                                  </span>
                                </div>
                              )
                            } else {
                              const remaining = calculateRemainingDays(trip.startDate, duration)
                              if (remaining !== null) {
                                return (
                                  <div className="mt-2 flex items-center gap-2 text-xs">
                                    <Clock className={`h-3 w-3 ${remaining < 7 ? 'text-red-600' : remaining < 30 ? 'text-yellow-600' : 'text-green-600'}`} />
                                    <span className={remaining < 7 ? 'text-red-600 font-semibold' : remaining < 30 ? 'text-yellow-600' : 'text-slate-600'}>
                                      <span className="font-semibold">{remaining}</span> days remaining
                                    </span>
                                  </div>
                                )
                              }
                            }
                            return null
                          })()}

                          {/* Mandatory Registration */}
                          {visa.mandatory_registration && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <p className="text-xs font-semibold text-yellow-900">
                                    {visa.mandatory_registration.name} Required
                                  </p>
                                  {visa.mandatory_registration.link && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-xs text-yellow-800 hover:text-yellow-900 hover:bg-yellow-100 mt-1"
                                      onClick={() => window.open(visa.mandatory_registration.link, '_blank')}
                                    >
                                      <ExternalLink className="h-3 w-3 mr-1" />
                                      Register
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Exception Rule */}
                          {visa.visa_rules.exception_rule && (
                            <div className="bg-blue-50 border border-blue-200 rounded-md p-2">
                              <div className="flex items-start gap-2">
                                <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <p className="text-xs font-semibold text-blue-900">
                                    {visa.visa_rules.exception_rule.name}
                                  </p>
                                  <p className="text-xs text-blue-800 mt-0.5">
                                    {visa.visa_rules.exception_rule.condition}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Visa Application Links */}
                          {(visa.visa_rules.primary_rule.link || visa.visa_rules.secondary_rule?.link) && (
                            <div className="space-y-2">
                              {visa.visa_rules.primary_rule.link && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full text-xs"
                                  onClick={() => window.open(visa.visa_rules.primary_rule.link, '_blank')}
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  {visa.visa_rules.primary_rule.name === 'eVisa' ? 'Apply for eVisa' : 
                                   visa.visa_rules.primary_rule.name === 'Visa on arrival' ? 'Visa on Arrival Info' :
                                   'Apply for Visa'}
                                </Button>
                              )}
                              {visa.visa_rules.secondary_rule?.link && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full text-xs"
                                  onClick={() => window.open(visa.visa_rules.secondary_rule.link, '_blank')}
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  {visa.visa_rules.secondary_rule.name === 'eVisa' ? 'Apply for eVisa' : 
                                   visa.visa_rules.secondary_rule.name === 'Visa on arrival' ? 'Visa on Arrival Info' :
                                   `Apply for ${visa.visa_rules.secondary_rule.name}`}
                                </Button>
                              )}
                            </div>
                          )}

                          {/* Embassy Link */}
                          {visa?.destination?.embassy_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-xs text-slate-700 hover:text-slate-900"
                              onClick={() => window.open(visa?.destination?.embassy_url, '_blank')}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Embassy Information
                            </Button>
                          )}

                          {/* Destination Info */}
                          {(visa?.destination?.passport_validity || visa?.destination?.currency) && (
                            <div className="pt-2 border-t text-xs text-slate-600 space-y-1">
                              {visa?.destination?.passport_validity && (
                                <p>
                                  <span className="font-medium">Passport Validity:</span>{' '}
                                  {visa.destination.passport_validity}
                                </p>
                              )}
                              {visa?.destination?.currency && (
                                <p>
                                  <span className="font-medium">Currency:</span> {visa.destination.currency}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic">
                          Visa information unavailable
                        </div>
                          )}

                      {/* Tax Residency Notes */}
                      {trip.taxResidencyNotes && (
                        <div className="pt-3 border-t">
                          <p className="text-xs font-semibold text-slate-900 mb-2">Tax Residency Information</p>
                          <p className="text-sm text-slate-600 whitespace-pre-wrap">{trip.taxResidencyNotes}</p>
                        </div>
                      )}

                      {/* Other Notes */}
                      {trip.notes && (
                        <div className="pt-3 border-t">
                          <p className="text-xs font-semibold text-slate-900 mb-2">Other Notes</p>
                          <p className="text-sm text-slate-600 whitespace-pre-wrap">{trip.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

