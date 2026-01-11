import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { X, ExternalLink, AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface VisaResultsProps {
  data: {
    passport: {
      code: string
      name: string
    }
    destination: {
      code: string
      name: string
      continent?: string
      capital?: string
      currency?: string
      passport_validity?: string
      embassy_url?: string
    }
    mandatory_registration?: {
      name: string
      color: string
      link?: string
    }
    visa_rules: {
      primary_rule: {
        name: string
        duration?: string
        color: string
        link?: string
      }
      secondary_rule?: {
        name: string
        duration?: string
        color: string
        link?: string
      }
      exception_rule?: {
        name: string
        condition: string
        color: string
      }
    }
  }
  onClose: () => void
}

const colorMap: Record<string, { bg: string; text: string; label: string }> = {
  green: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    label: 'Visa-Free',
  },
  blue: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    label: 'Visa on Arrival / eVisa',
  },
  yellow: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    label: 'eTA / Registration',
  },
  red: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    label: 'Visa Required',
  },
}

export function VisaResults({ data, onClose }: VisaResultsProps) {
  const primaryColor = colorMap[data.visa_rules.primary_rule.color] || colorMap.blue
  const duration = data.visa_rules.primary_rule.duration || data.visa_rules.secondary_rule?.duration || ''

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border-2">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-2xl mb-2">
                Visa Requirements
              </CardTitle>
              <CardDescription>
                {data.passport.name} → {data.destination.name}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {/* Primary Visa Rule */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`${primaryColor.bg} ${primaryColor.text} px-4 py-2 rounded-lg font-semibold`}>
                {primaryColor.label}
              </div>
              {duration && (
                <Badge variant="outline" className="text-base">
                  {duration}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="text-lg font-medium text-slate-800">
                {data.visa_rules.primary_rule.name}
                {data.visa_rules.secondary_rule && ` / ${data.visa_rules.secondary_rule.name}`}
              </p>
            </div>
            {data.visa_rules.primary_rule.link && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(data.visa_rules.primary_rule.link, '_blank')}
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Apply for Visa
              </Button>
            )}
          </div>

          {/* Mandatory Registration */}
          {data.mandatory_registration && (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <h3 className="font-semibold text-yellow-900">Mandatory Registration Required</h3>
              </div>
              <p className="text-yellow-800">
                {data.mandatory_registration.name} is required before arrival.
              </p>
              {data.mandatory_registration.link && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(data.mandatory_registration!.link, '_blank')}
                  className="gap-2 border-yellow-300 text-yellow-800 hover:bg-yellow-100"
                >
                  <ExternalLink className="h-4 w-4" />
                  Complete Registration
                </Button>
              )}
            </div>
          )}

          {/* Exception Rule */}
          {data.visa_rules.exception_rule && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">Exception Rule</h3>
              </div>
              <p className="text-blue-800">
                <strong>{data.visa_rules.exception_rule.name}:</strong>{' '}
                {data.visa_rules.exception_rule.condition}
              </p>
            </div>
          )}

          {/* Destination Information */}
          <div className="border-t pt-4 space-y-2">
            <h3 className="font-semibold text-slate-800 mb-3">Destination Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {data.destination.capital && (
                <div>
                  <span className="text-slate-600">Capital:</span>{' '}
                  <span className="font-medium">{data.destination.capital}</span>
                </div>
              )}
              {data.destination.continent && (
                <div>
                  <span className="text-slate-600">Continent:</span>{' '}
                  <span className="font-medium">{data.destination.continent}</span>
                </div>
              )}
              {data.destination.currency && (
                <div>
                  <span className="text-slate-600">Currency:</span>{' '}
                  <span className="font-medium">{data.destination.currency}</span>
                </div>
              )}
              {data.destination.passport_validity && (
                <div>
                  <span className="text-slate-600">Passport Validity:</span>{' '}
                  <span className="font-medium">{data.destination.passport_validity}</span>
                </div>
              )}
            </div>
            {data.destination.embassy_url && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(data.destination.embassy_url, '_blank')}
                className="gap-2 mt-2"
              >
                <ExternalLink className="h-4 w-4" />
                Embassy Information
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

