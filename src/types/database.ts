// Database types for Supabase
export interface Database {
  public: {
    Tables: {
      trips: {
        Row: {
          id: string
          user_id: string
          destination: string
          passport_country: string
          start_date: string
          end_date: string | null
          notes: string | null
          tax_residency_notes: string | null
          is_schengen: boolean
          visa_data: Record<string, unknown> | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          destination: string
          passport_country: string
          start_date: string
          end_date?: string | null
          notes?: string | null
          tax_residency_notes?: string | null
          is_schengen?: boolean
          visa_data?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          destination?: string
          passport_country?: string
          start_date?: string
          end_date?: string | null
          notes?: string | null
          tax_residency_notes?: string | null
          is_schengen?: boolean
          visa_data?: Record<string, unknown> | null
          created_at?: string
          updated_at?: string
        }
      }
      destinations: {
        Row: {
          code: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          code: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          code?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
      }
      user_preferences: {
        Row: {
          user_id: string
          email: string | null
          default_passport_country: string | null
          has_free_access: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          email?: string | null
          default_passport_country?: string | null
          has_free_access?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          email?: string | null
          default_passport_country?: string | null
          has_free_access?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      visa_cache: {
        Row: {
          passport_code: string
          destination_code: string
          response_data: Record<string, unknown>
          cached_at: string
          expires_at: string
        }
        Insert: {
          passport_code: string
          destination_code: string
          response_data: Record<string, unknown>
          cached_at?: string
          expires_at?: string
        }
        Update: {
          passport_code?: string
          destination_code?: string
          response_data?: Record<string, unknown>
          cached_at?: string
          expires_at?: string
        }
      }
    }
  }
}

// Client-side trip interface (matches our app structure)
export interface Trip {
  id: string
  destination: string
  passportCountry: string
  startDate: string
  endDate?: string
  notes?: string
  taxResidencyNotes?: string
  isSchengen: boolean
  visaData?: Record<string, unknown> | null
}

// Helper function to convert database row to client Trip
export function dbRowToTrip(row: Database['public']['Tables']['trips']['Row']): Trip {
  return {
    id: row.id,
    destination: row.destination,
    passportCountry: row.passport_country,
    startDate: row.start_date,
    endDate: row.end_date || undefined,
    notes: row.notes || undefined,
    taxResidencyNotes: row.tax_residency_notes || undefined,
    isSchengen: row.is_schengen,
    visaData: row.visa_data || undefined,
  }
}

// Helper function to convert client Trip to database insert
export function tripToDbInsert(trip: Omit<Trip, 'id'>, userId: string): Database['public']['Tables']['trips']['Insert'] {
  return {
    user_id: userId,
    destination: trip.destination,
    passport_country: trip.passportCountry,
    start_date: trip.startDate,
    end_date: trip.endDate || null,
    notes: trip.notes || null,
    tax_residency_notes: trip.taxResidencyNotes || null,
    is_schengen: trip.isSchengen,
  }
}

