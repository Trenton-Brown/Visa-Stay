// Destination management - use countryCodeToName directly (no database needed)
// The visa_cache table already stores destination codes, so we don't need a separate destinations table
import { countryCodeToName } from './countryCodes'

// Get all available destinations from the country code mapping
// This is the complete list of all countries, sorted alphabetically
export async function initializeDestinations(): Promise<string[]> {
  // Simply return all country names from the comprehensive mapping
  // No API calls, no database queries needed
  return Object.values(countryCodeToName).sort()
}

// This function is no longer needed since we use countryCodeToName directly
// Kept for backwards compatibility but does nothing
export async function cacheDestinationFromVisaCheck(_name: string, _code: string): Promise<void> {
  // No-op: destination names come from countryCodeToName, not database
  // The visa_cache table already stores destination_code, which is sufficient
}

