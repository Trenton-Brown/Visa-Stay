import { useEffect, useState, type MouseEventHandler } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Loader2, AlertTriangle } from 'lucide-react'
import { PassportDestinationView } from '@/pages/PassportDestinationView'
import { checkVisaRequirements } from '@/lib/visaApi'
import { 
  getCachedDataForRoute, 
  generateSEOTitle, 
  generateSEODescription,
  isValidCountryCode,
  getCountryName 
} from '@/lib/ssg-helpers'
import { useAuth } from '@/contexts/AuthContext'
import type { VisaCheckResponse } from '@/lib/visaApi'

export function PassportDestinationPage() {
  const { passportCode, destinationCode } = useParams<{ passportCode: string; destinationCode: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const initialEmbedded = (() => {
    try {
      const script = document.getElementById('__PASSPORT_DESTINATION_DATA__')
      if (!script?.textContent) return null
      const parsed = JSON.parse(script.textContent || '{}')
      const matches =
        parsed?.visaData &&
        parsed?.passportCode === passportCode?.toLowerCase() &&
        parsed?.destinationCode === destinationCode?.toLowerCase()
      return matches ? parsed : null
    } catch {
      return null
    }
  })()

  const [visaData, setVisaData] = useState<VisaCheckResponse['data'] | null>(() => initialEmbedded?.visaData ?? null)
  const [isLoading, setIsLoading] = useState(() => !initialEmbedded?.visaData)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(() => initialEmbedded?.lastUpdated ?? null)

  useEffect(() => {
    const loadVisaData = async () => {
      if (!passportCode || !destinationCode) {
        setError('Invalid passport or destination code')
        setIsLoading(false)
        return
      }

      // Validate country codes
      if (!isValidCountryCode(passportCode) || !isValidCountryCode(destinationCode)) {
        setError('Invalid country code')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        // If we already have embedded data (SSR/SSG), don't refetch.
        if (visaData) {
          setIsLoading(false)
          return
        }

        // If not embedded, try to get from cache
        const cached = await getCachedDataForRoute(passportCode, destinationCode)
        
        if (cached && cached.response_data) {
          // response_data is the full VisaCheckResponse, extract the data part
          const visaDataForUI = cached.response_data.data || cached.response_data
          if (visaDataForUI) {
            setVisaData(visaDataForUI)
            setLastUpdated(cached.cached_at)
            setIsLoading(false)
            return
          }
        }

        // If not cached, fetch from API
        const passportName = getCountryName(passportCode)
        const destinationName = getCountryName(destinationCode)

        if (!passportName || !destinationName) {
          setError('Country not found')
          setIsLoading(false)
          return
        }

        const result = await checkVisaRequirements(passportName, destinationName)
        
        if (result?.data) {
          setVisaData(result.data)
          // Get the updated cache entry to get cached_at
          const updatedCache = await getCachedDataForRoute(passportCode, destinationCode)
          if (updatedCache) {
            setLastUpdated(updatedCache.cached_at)
          }
        } else {
          setError('No visa data available')
        }
      } catch (err: any) {
        console.error('Error loading visa data:', err)
        setError(err.message || 'Failed to load visa information')
      } finally {
        setIsLoading(false)
      }
    }

    loadVisaData()
  }, [passportCode, destinationCode, visaData])

  const handleTrackStay = () => {
    if (isAuthenticated) {
      // Navigate to trips page with pre-filled destination
      navigate('/trips', { 
        state: { 
          prefillDestination: visaData?.destination.name,
          prefillPassport: visaData?.passport.name 
        } 
      })
    } else {
      // Navigate to login, then redirect to trips
      navigate('/login', { 
        state: { 
          redirectTo: '/trips',
          prefillDestination: visaData?.destination.name,
          prefillPassport: visaData?.passport.name
        } 
      })
    }
  }

  const handleTrackStayClick: MouseEventHandler<HTMLAnchorElement> = (e) => {
    e.preventDefault()
    handleTrackStay()
  }

  // Set SEO metadata - MUST be before early returns to follow Rules of Hooks
  useEffect(() => {
    if (visaData) {
      const passportName = visaData.passport.name
      const destinationName = visaData.destination.name
      const seoTitle = generateSEOTitle(passportName, destinationName)
      const seoDescription = generateSEODescription(visaData)
      const canonicalUrl = `${window.location.origin}/passport/${passportCode}/${destinationCode}`

      document.title = seoTitle
      
      // Update or create meta description
      let metaDescription = document.querySelector('meta[name="description"]')
      if (!metaDescription) {
        metaDescription = document.createElement('meta')
        metaDescription.setAttribute('name', 'description')
        document.head.appendChild(metaDescription)
      }
      metaDescription.setAttribute('content', seoDescription)

      // Update or create canonical link
      let canonicalLink = document.querySelector('link[rel="canonical"]')
      if (!canonicalLink) {
        canonicalLink = document.createElement('link')
        canonicalLink.setAttribute('rel', 'canonical')
        document.head.appendChild(canonicalLink)
      }
      canonicalLink.setAttribute('href', canonicalUrl)
    } else {
      // Reset to default title if no data
      document.title = 'Visa Stay — Know before you go'
    }
  }, [visaData, passportCode, destinationCode])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-white to-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-slate-600">Loading visa information...</p>
        </div>
      </div>
    )
  }

  if (error || !visaData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-white to-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Error</h1>
          <p className="text-slate-600 mb-4">{error || 'Visa information not available'}</p>
          <Button onClick={() => navigate('/')} variant="outline">
            Return Home
          </Button>
        </div>
      </div>
    )
  }

  return (
    <PassportDestinationView
      appName="Visa Stay"
      passportCode={passportCode ?? ''}
      destinationCode={destinationCode ?? ''}
      visaData={visaData}
      lastUpdated={lastUpdated}
      trackStayHref="/trips"
      onTrackStayClick={handleTrackStayClick}
    />
  )
}
