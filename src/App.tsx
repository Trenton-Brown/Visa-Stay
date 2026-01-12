import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { Landing } from '@/pages/Landing'
import { Login } from '@/pages/Login'
import { Trips } from '@/pages/Trips'
import { Dashboard } from '@/pages/Dashboard'
import { Admin } from '@/pages/Admin'
import { PassportDestinationPage } from '@/pages/PassportDestinationPage'
import { Upgrade } from '@/pages/Upgrade'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { RequirePaid } from '@/components/RequirePaid'

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/upgrade" element={<Upgrade />} />
            <Route
              path="/trips"
              element={
                <RequirePaid>
                  <Trips />
                </RequirePaid>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RequirePaid>
                  <Dashboard />
                </RequirePaid>
              }
            />
            <Route
              path="/admin"
              element={
                <RequirePaid>
                  <Admin />
                </RequirePaid>
              }
            />
            <Route path="/passport/:passportCode/:destinationCode" element={<PassportDestinationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
