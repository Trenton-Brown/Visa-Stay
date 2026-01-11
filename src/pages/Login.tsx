import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { LogIn } from 'lucide-react'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const { login, signUp } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    try {
      if (isSignUp) {
        await signUp(email, password)
        // Supabase may require email confirmation, so show a message
        alert('Account created! Please check your email to confirm your account, then sign in.')
        setIsSignUp(false)
      } else {
        await login(email, password)
        navigate('/trips')
      }
    } catch (err: any) {
      setError(err.message || (isSignUp ? 'Sign up failed. Please try again.' : 'Login failed. Please try again.'))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-white to-white flex items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-xl border-2 border-blue-100">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-4">
            <LogIn className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-3xl bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            Welcome Back
          </CardTitle>
          <CardDescription className="text-base">
            Sign in to manage your trips
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                className="h-11"
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 h-11"
              size="lg"
            >
              {isSignUp ? 'Sign Up' : 'Sign In'}
            </Button>
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp)
                  setError('')
                }}
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

