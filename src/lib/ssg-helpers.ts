import { supabase } from './supabase'
import { countryCodeToName } from './countryCodes'
import type { VisaCheckResponse } from './visaApi'

export interface CacheEntry {
  passport_code: string
  destination_code: string
  response_data: VisaCheckResponse
  cached_at: string
  expires_at: string
}

/**
 * Query visa_cache table for all non-expired entries
 * Used during build time to generate static pages
 */
export async function getValidCacheEntries(): Promise<CacheEntry[]> {
  const { data, error } = await supabase
    .from('visa_cache')
    .select('passport_code, destination_code, response_data, cached_at, expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('cached_at', { ascending: false })

  if (error) {
    console.error('Error fetching cache entries:', error)
    return []
  }

  return (data || []) as CacheEntry[]
}

/**
 * Get cached data for a specific passport/destination combination
 */
export async function getCachedDataForRoute(
  passportCode: string,
  destinationCode: string
): Promise<CacheEntry | null> {
  const { data, error } = await supabase
    .from('visa_cache')
    .select('passport_code, destination_code, response_data, cached_at, expires_at')
    .eq('passport_code', passportCode.toUpperCase())
    .eq('destination_code', destinationCode.toUpperCase())
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !data) {
    return null
  }

  return data as CacheEntry
}

/**
 * Format date for display (e.g., "Last updated: January 15, 2024")
 */
export function formatLastUpdated(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Generate SEO title for a passport/destination combination
 */
export function generateSEOTitle(passportName: string, destinationName: string): string {
  return `How long can a ${passportName} passport stay in ${destinationName}? Tourist stay limits`
}

/**
 * Generate SEO description from visa data
 */
export function generateSEODescription(data: VisaCheckResponse['data']): string {
  const duration = data.visa_rules.primary_rule.duration || data.visa_rules.secondary_rule?.duration || ''
  const ruleName = data.visa_rules.primary_rule.name
  const status = data.visa_rules.primary_rule.color === 'green' 
    ? 'visa-free' 
    : data.visa_rules.primary_rule.color === 'red'
    ? 'visa required'
    : 'visa on arrival or eVisa'

  if (duration) {
    return `${data.passport.name} passport holders can stay in ${data.destination.name} for ${duration} (${status}). ${ruleName}`
  }
  return `${data.passport.name} passport holders traveling to ${data.destination.name}: ${status}. ${ruleName}`
}

/**
 * Validate country code exists in our mapping
 */
export function isValidCountryCode(code: string): boolean {
  return code.toUpperCase() in countryCodeToName
}

/**
 * Get country name from code
 */
export function getCountryName(code: string): string | undefined {
  return countryCodeToName[code.toUpperCase()]
}
