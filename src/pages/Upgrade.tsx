import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus'
import { supabase } from '@/lib/supabase'

const PRICE_MONTHLY = 'price_1SoYqrQcj37z6ydVlpt9vLDN'
const PRICE_YEARLY = 'price_1SoYrlQcj37z6ydVkSupTxsO'

export function Upgrade() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useAuth()
  const { isPaid, loading } = useSubscriptionStatus()
  const [isStartingCheckout, setIsStartingCheckout] = useState<'monthly' | 'yearly' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const autoStartedRef = useRef(false)

  if (!loading && isPaid) {
    navigate('/trips', { replace: true })
  }

  const preselectedPlan = (location.state as any)?.plan as 'monthly' | 'yearly' | undefined

  useEffect(() => {
    if (autoStartedRef.current) return
    if (loading) return
    if (isPaid) return
    if (!preselectedPlan) return

    // If not logged in, bounce to login first (and keep the plan selection).
    if (!isAuthenticated) {
      autoStartedRef.current = true
      navigate('/login', { replace: true, state: { redirectTo: '/upgrade', plan: preselectedPlan } })
      return
    }

    // Logged in + unpaid: auto-start checkout for the selected plan.
    autoStartedRef.current = true
    if (preselectedPlan === 'monthly') startCheckout(PRICE_MONTHLY, 'monthly')
    if (preselectedPlan === 'yearly') startCheckout(PRICE_YEARLY, 'yearly')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isPaid, isAuthenticated, preselectedPlan, navigate])

  const startCheckout = async (priceId: string, plan: 'monthly' | 'yearly') => {
    setError(null)

    if (!isAuthenticated) {
      navigate('/login', { replace: true, state: { redirectTo: '/upgrade' } })
      return
    }

    setIsStartingCheckout(plan)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        navigate('/login', { replace: true, state: { redirectTo: '/upgrade' } })
        return
      }

      const resp = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId }),
      })

      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Failed to start checkout')

      const url = json?.url as string | undefined
      if (!url) throw new Error('Checkout URL missing')

      window.location.assign(url)
    } catch (err: any) {
      setError(err?.message || 'Failed to start checkout')
      setIsStartingCheckout(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-white to-white flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-2xl shadow-xl border-2 border-blue-100">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            Upgrade to Visa Stay
          </CardTitle>
          <CardDescription className="text-base">
            Unlock Trips + unlimited searches
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-md">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-5 bg-white">
              <p className="text-xl font-semibold mb-1">Monthly</p>
              <p className="text-slate-600 mb-4">$3 / month</p>
              <Button
                className="w-full bg-slate-800 hover:bg-slate-900"
                size="lg"
                disabled={isStartingCheckout !== null}
                onClick={() => startCheckout(PRICE_MONTHLY, 'monthly')}
              >
                {isStartingCheckout === 'monthly' ? 'Starting…' : 'Continue'}
              </Button>
            </div>

            <div className="border-2 border-blue-200 rounded-lg p-5 bg-gradient-to-br from-blue-50 to-cyan-50">
              <p className="text-xl font-semibold mb-1">Yearly</p>
              <p className="text-slate-600 mb-4">$30 / year</p>
              <Button
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                size="lg"
                disabled={isStartingCheckout !== null}
                onClick={() => startCheckout(PRICE_YEARLY, 'yearly')}
              >
                {isStartingCheckout === 'yearly' ? 'Starting…' : 'Continue'}
              </Button>
              <p className="text-xs text-slate-600 mt-2 text-center">Best value</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={() => navigate('/')}>
              Back
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

