import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { Landing } from '@/pages/Landing'
import { Login } from '@/pages/Login'
import { Trips } from '@/pages/Trips'
import { Dashboard } from '@/pages/Dashboard'
import { Admin } from '@/pages/Admin'
import { PassportDestinationPage } from '@/pages/PassportDestinationPage'
import { ErrorBoundary } from '@/components/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/trips" element={<Trips />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/passport/:passportCode/:destinationCode" element={<PassportDestinationPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
