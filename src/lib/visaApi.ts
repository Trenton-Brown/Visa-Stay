// Visa API service with 30-day database caching (shared across all users)

const API_BASE_URL = 'https://visa-requirement.p.rapidapi.com'


interface VisaRule {
  name: string
  duration?: string
  color: string
  link?: string
}

export interface VisaCheckResponse {
  data: {
    passport: {
      code: string
      name: string
      currency_code?: string
    }
    destination: {
      code: string
      name: string
      continent?: string
      capital?: string
      currency_code?: string
      currency?: string
      exchange?: string
      passport_validity?: string
      phone_code?: string
      timezone?: string
      population?: number
      area_km2?: number
      embassy_url?: string
    }
    mandatory_registration?: {
      name: string
      color: string
      link?: string
    }
    visa_rules: {
      primary_rule: VisaRule
      secondary_rule?: VisaRule
      exception_rule?: {
        name: string
        condition: string
        color: string
      }
    }
  }
  meta: {
    version: string
    language: string
    generated_at: string
  }
}

import { countryNameToCode } from './countryCodes'
import { supabase } from './supabase'

export function getCountryCode(countryName: string): string {
  // Try direct lookup
  if (countryNameToCode[countryName]) {
    return countryNameToCode[countryName]
  }

  // Try to extract country from city, country format
  const parts = countryName.split(',')
  if (parts.length > 1) {
    const countryPart = parts[parts.length - 1].trim()
    if (countryNameToCode[countryPart]) {
      return countryNameToCode[countryPart]
    }
  }

  // Try partial match (case-insensitive)
  const lowerName = countryName.toLowerCase()
  for (const [name, code] of Object.entries(countryNameToCode)) {
    if (name.toLowerCase() === lowerName || 
        name.toLowerCase().includes(lowerName) ||
        lowerName.includes(name.toLowerCase())) {
      return code
    }
  }

  // Fallback: return first two letters uppercase (not ideal, but works for some)
  const fallbackCode = countryName.substring(0, 2).toUpperCase()
  return fallbackCode
}

/**
 * Get cached visa data from database
 * Returns null if not found or expired
 */
async function getCachedData(
  passportCode: string,
  destinationCode: string
): Promise<VisaCheckResponse | null> {
  try {
    const { data, error } = await supabase
      .from('visa_cache')
      .select('response_data, expires_at')
      .eq('passport_code', passportCode)
      .eq('destination_code', destinationCode)
      .single()


    if (error || !data) {
      return null
    }

    // Check if cache is still valid (not expired)
    const expiresAt = new Date(data.expires_at)
    const now = new Date()


    if (now >= expiresAt) {
      // Cache expired, delete it
      await supabase
        .from('visa_cache')
        .delete()
        .eq('passport_code', passportCode)
        .eq('destination_code', destinationCode)
      return null
    }

    // Return cached data
    return data.response_data as VisaCheckResponse
  } catch (error) {
    console.error('Error reading cache from database:', error)
    return null
  }
}

/**
 * Store visa data in database cache
 * Uses upsert to update if entry already exists
 */
async function setCachedData(
  passportCode: string,
  destinationCode: string,
  data: VisaCheckResponse
): Promise<void> {
  try {
    const { error } = await supabase
      .from('visa_cache')
      .upsert({
        passport_code: passportCode,
        destination_code: destinationCode,
        response_data: data as unknown as Record<string, unknown>,
        cached_at: new Date().toISOString(),
        // expires_at will be set automatically by the trigger
      }, {
        onConflict: 'passport_code,destination_code'
      })

    if (error) {
      console.error('Error setting cache in database:', error)
    }
  } catch (error) {
    console.error('Error setting cache:', error)
  }
}

export async function checkVisaRequirements(
  passportCountry: string,
  destinationCountry: string
): Promise<VisaCheckResponse> {
  // Convert country names to codes
  const passportCode = getCountryCode(passportCountry)
  const destinationCode = getCountryCode(destinationCountry)
  
  
  // Check database cache first (shared across all users)
  const cached = await getCachedData(passportCode, destinationCode)
  if (cached) {
    console.log(`Cache hit: ${passportCode} → ${destinationCode}`)
    return cached
  }

  console.log(`Cache miss: ${passportCode} → ${destinationCode}, fetching from API...`)

  // Make API call
  const apiKey = import.meta.env.VITE_RAPIDAPI_KEY
  if (!apiKey) {
    throw new Error('RapidAPI key is not configured. Please add VITE_RAPIDAPI_KEY to your .env.local file.')
  }

  const requestBody = {
    passport: passportCode,
    destination: destinationCode,
  }
  const requestUrl = `${API_BASE_URL}/v2/visa/check`

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': 'visa-requirement.p.rapidapi.com',
      'x-rapidapi-key': apiKey,
    },
    body: JSON.stringify(requestBody),
  })


  if (!response.ok) {
    let errorMessage = ''
    if (response.status === 401) {
      errorMessage = 'Invalid API key. Please check your RapidAPI key.'
    } else if (response.status === 404) {
      errorMessage = 'Visa information not found for this passport-destination combination.'
    } else if (response.status === 422) {
      errorMessage = 'Invalid passport or destination. Please check your selections.'
    } else {
      errorMessage = `API error: ${response.status} ${response.statusText}`
    }
    throw new Error(errorMessage)
  }

  const responseText = await response.text()
  const data = JSON.parse(responseText) as VisaCheckResponse

  // Cache the result in database (shared across all users)
  await setCachedData(passportCode, destinationCode, data)

  // Note: Destination names come from countryCodeToName mapping, not from database
  // The visa_cache table already stores destination_code, which is sufficient

  return data
}


