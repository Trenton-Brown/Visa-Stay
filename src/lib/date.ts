/**
 * Parse a date string that is either:
 * - "YYYY-MM-DD" (typical for HTML date inputs / DATE columns)
 * - an ISO timestamp (e.g. "YYYY-MM-DDT00:00:00.000Z")
 *
 * Returns a Date at local midnight to avoid timezone off-by-one issues.
 */
export function parseToLocalDayStart(dateInput: string): Date {
  const normalized = dateInput.length >= 10 ? dateInput.slice(0, 10) : dateInput
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) {
    const year = Number(m[1])
    const monthIndex = Number(m[2]) - 1
    const day = Number(m[3])
    return new Date(year, monthIndex, day, 0, 0, 0, 0)
  }

  const d = new Date(dateInput)
  d.setHours(0, 0, 0, 0)
  return d
}

export function formatLocalDate(dateInput: string): string {
  return parseToLocalDayStart(dateInput).toLocaleDateString()
}

