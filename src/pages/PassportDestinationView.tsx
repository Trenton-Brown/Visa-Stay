import type React from 'react'
import { Calendar, AlertTriangle } from 'lucide-react'
import { VisaResultsInline } from '@/components/VisaResultsInline'

type VisaData = {
  passport: { name: string }
  destination: { name: string }
  visa_rules: {
    primary_rule: { name: string; color: string; duration?: string }
    secondary_rule?: { name: string; color: string; duration?: string }
  }
}

function formatLastUpdated(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

interface PassportDestinationViewProps {
  appName: string
  passportCode: string
  destinationCode: string
  visaData: VisaData
  lastUpdated: string | null
  trackStayHref: string
  onTrackStayClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
}

export function PassportDestinationView(props: PassportDestinationViewProps) {
  const { appName, passportCode, destinationCode, visaData, lastUpdated, trackStayHref, onTrackStayClick } = props

  const passportName = visaData.passport.name
  const destinationName = visaData.destination.name

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/50 via-white to-white">
      {/* Navigation */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <img
                src="/logo-wordmark.png"
                alt={appName}
                className="h-[41px] w-auto max-w-[133px] object-contain"
                loading="eager"
                decoding="async"
              />
              <span className="sr-only">{appName}</span>
            </a>
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2"
            >
              Home
            </a>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold text-slate-800">
              {passportName} → {destinationName}
            </h1>
            <p className="text-lg text-slate-600">Tourist visa requirements and stay limits</p>
          </div>

          {/* Last Updated & Disclaimer */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
            {lastUpdated && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar className="h-4 w-4" />
                <span>Last updated: {formatLastUpdated(lastUpdated)}</span>
              </div>
            )}
            <div className="flex items-start gap-2 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>Tourist stays only. No tax or residency advice.</span>
            </div>
          </div>

          {/* Visa Results */}
          <VisaResultsInline data={visaData as any} />

          {/* Track This Stay CTA */}
          <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg p-6 text-center text-white">
            <h2 className="text-2xl font-bold mb-2">Ready to track your stay?</h2>
            <p className="mb-4 text-blue-100">Add this trip to your travel tracker and get alerts for visa limits and stay duration</p>
            <a
              href={trackStayHref}
              onClick={onTrackStayClick}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-white text-blue-600 hover:bg-blue-50 px-6 py-3"
              data-passport={passportCode}
              data-destination={destinationCode}
            >
              Track This Stay
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}

