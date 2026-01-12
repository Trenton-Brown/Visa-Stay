import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

type SubscriptionStatus = {
  hasFreeAccess: boolean
  subscriptionStatus: string | null
  currentPeriodEnd: string | null
  isPaid: boolean
}

export function useSubscriptionStatus() {
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SubscriptionStatus>({
    hasFreeAccess: false,
    subscriptionStatus: null,
    currentPeriodEnd: null,
    isPaid: false,
  })

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated || !user) {
      setData({ hasFreeAccess: false, subscriptionStatus: null, currentPeriodEnd: null, isPaid: false })
      setLoading(false)
      return
    }

    let isCancelled = false
    const run = async () => {
      setLoading(true)
      const { data: pref, error } = await supabase
        .from('user_preferences')
        .select('has_free_access, subscription_status, current_period_end')
        .eq('user_id', user.id)
        .maybeSingle()

      if (isCancelled) return

      if (error) {
        // If prefs row doesn't exist yet, treat as unpaid.
        setData({ hasFreeAccess: false, subscriptionStatus: null, currentPeriodEnd: null, isPaid: false })
        setLoading(false)
        return
      }

      const hasFreeAccess = Boolean(pref?.has_free_access)
      const subscriptionStatus = pref?.subscription_status ?? null
      const currentPeriodEnd = (pref?.current_period_end as string | null) ?? null
      const currentPeriodEndMs = currentPeriodEnd ? new Date(currentPeriodEnd).getTime() : null

      const isPaid =
        hasFreeAccess ||
        (subscriptionStatus != null &&
          ['active', 'trialing'].includes(subscriptionStatus) &&
          currentPeriodEndMs != null &&
          currentPeriodEndMs > Date.now())

      setData({ hasFreeAccess, subscriptionStatus, currentPeriodEnd, isPaid })
      setLoading(false)
    }

    run()
    return () => {
      isCancelled = true
    }
  }, [authLoading, isAuthenticated, user])

  return useMemo(
    () => ({
      loading,
      ...data,
    }),
    [loading, data]
  )
}

