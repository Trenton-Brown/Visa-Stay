import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus'

export function RequirePaid({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const { loading: subLoading, isPaid } = useSubscriptionStatus()
  const location = useLocation()

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-white to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ redirectTo: location.pathname }} />
  }

  if (!isPaid) {
    return <Navigate to="/upgrade" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}

