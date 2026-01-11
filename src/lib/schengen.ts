// List of Schengen zone countries
export const SCHENGEN_COUNTRIES = [
  'Austria',
  'Belgium',
  'Croatia',
  'Czech Republic',
  'Denmark',
  'Estonia',
  'Finland',
  'France',
  'Germany',
  'Greece',
  'Hungary',
  'Iceland',
  'Italy',
  'Latvia',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Malta',
  'Netherlands',
  'Norway',
  'Poland',
  'Portugal',
  'Slovakia',
  'Slovenia',
  'Spain',
  'Sweden',
  'Switzerland',
]

// Check if a destination is in the Schengen zone
export function isSchengenCountry(destination: string): boolean {
  // Extract country name from "City, Country" format
  const countryName = destination.includes(',') 
    ? destination.split(',').pop()?.trim() || destination
    : destination

  return SCHENGEN_COUNTRIES.some(
    (schengen) => countryName.toLowerCase().includes(schengen.toLowerCase()) ||
                  schengen.toLowerCase().includes(countryName.toLowerCase())
  )
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function parseDateInputToLocalDayStart(dateInput: string): Date {
  // HTML date inputs and our stored trip dates are typically "YYYY-MM-DD".
  // In JS, `new Date('YYYY-MM-DD')` is parsed as UTC, which can shift the local day.
  // Build the Date in local time instead to avoid off-by-one.
  const normalized = dateInput.length >= 10 ? dateInput.slice(0, 10) : dateInput
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) {
    const year = Number(m[1])
    const monthIndex = Number(m[2]) - 1
    const day = Number(m[3])
    return new Date(year, monthIndex, day, 0, 0, 0, 0)
  }
  return startOfLocalDay(new Date(dateInput))
}

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Calculate days between two dates (inclusive of both dates)
export function daysBetween(startDate: Date, endDate: Date): number {
  const diffTime = endDate.getTime() - startDate.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// Calculate remaining days for a regular visa
export function calculateRemainingDays(
  startDate: string,
  duration: string | undefined
): number | null {
  if (!duration) return null

  // Parse duration string (e.g., "30 days", "90 days", "6 months")
  const durationMatch = duration.match(/(\d+)\s*(day|days|month|months)/i)
  if (!durationMatch) return null

  const amount = parseInt(durationMatch[1])
  const unit = durationMatch[2].toLowerCase()

  let totalDays: number
  if (unit.includes('month')) {
    totalDays = amount * 30 // Approximate months as 30 days
  } else {
    totalDays = amount
  }

  const start = new Date(startDate)
  const today = new Date()
  const end = new Date(start)
  end.setDate(end.getDate() + totalDays)

  if (today > end) return 0 // Already expired
  if (today < start) return totalDays // Not started yet

  return daysBetween(today, end)
}

// Calculate Schengen days used in the last 180 days (rolling window)
export function calculateSchengenDaysUsed(
  trips: Array<{ startDate: string; endDate?: string; isSchengen: boolean }>,
  referenceDate: Date = new Date()
): number {
  const ref = startOfLocalDay(referenceDate)

  // Official rule: 180-day period INCLUDING today => 180 calendar days total.
  // Inclusive window start is today - 179 days.
  const windowStart = startOfLocalDay(new Date(ref))
  windowStart.setDate(windowStart.getDate() - 179)

  // Get all Schengen trips
  const schengenTrips = trips.filter((trip) => trip.isSchengen)
  
  if (schengenTrips.length === 0) return 0

  // Create an array of all days spent in Schengen within the 180-day window
  const daysSet = new Set<string>()

  for (const trip of schengenTrips) {
    const tripStart = parseDateInputToLocalDayStart(trip.startDate)
    const tripEnd = trip.endDate ? parseDateInputToLocalDayStart(trip.endDate) : ref

    // Only process trips that overlap with the 180-day window
    if (tripEnd < windowStart || tripStart > ref) continue

    const effectiveStart = tripStart > windowStart ? tripStart : windowStart
    const effectiveEnd = tripEnd < ref ? tripEnd : ref

    const currentDate = new Date(effectiveStart)
    while (currentDate <= effectiveEnd) {
      daysSet.add(toLocalDateKey(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }
  }

  return daysSet.size
}

// Calculate remaining Schengen days (90 days total in 180-day period)
export function calculateRemainingSchengenDays(
  trips: Array<{ startDate: string; endDate?: string; isSchengen: boolean }>,
  referenceDate: Date = new Date()
): number {
  const used = calculateSchengenDaysUsed(trips, referenceDate)
  return Math.max(0, 90 - used)
}

