import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { createClient } from '@supabase/supabase-js'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { PassportDestinationView } from '../src/pages/PassportDestinationView'

// Load environment variables from .env and .env.local
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
config({ path: join(__dirname, '..', '.env') })
config({ path: join(__dirname, '..', '.env.local') })

const distPath = join(process.cwd(), 'dist')

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)')
}
const supabase = createClient(supabaseUrl, supabaseAnonKey)

const appName = process.env.VITE_APP_NAME || 'Visa Stay'
const baseUrl = process.env.VITE_BASE_URL || process.env.VITE_APP_URL || 'https://visastay.app'
const ogImageUrl = process.env.VITE_OG_IMAGE_URL || `${baseUrl}/og-image.png`

const apiKey = process.env.VITE_RAPIDAPI_KEY

type CacheEntry = {
  passport_code: string
  destination_code: string
  response_data: any
  cached_at: string
  expires_at: string
}

function isRenderableVisaData(v: any): boolean {
  return Boolean(
    v &&
      v.passport &&
      typeof v.passport.name === 'string' &&
      v.destination &&
      typeof v.destination.name === 'string' &&
      v.visa_rules &&
      v.visa_rules.primary_rule &&
      typeof v.visa_rules.primary_rule.color === 'string'
  )
}

function contentTypeForPath(p: string): string {
  const ext = extname(p)
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.json':
      return 'application/json; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

function safeSend(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', headers['Content-Type'] || 'text/plain; charset=utf-8')
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.end(body)
}

function extractAssetsFromIndex(): { script: string; css: string } | null {
  const indexPath = join(distPath, 'index.html')
  if (!existsSync(indexPath)) return null
  const html = readFileSync(indexPath, 'utf-8')
  const scriptMatch = html.match(/<script[^>]+src="([^"]+)"[^>]*>/)
  const cssMatch = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/)
  return {
    script: scriptMatch ? scriptMatch[1] : '/assets/index.js',
    css: cssMatch ? cssMatch[1] : '/assets/index.css',
  }
}

function generateHTMLFromVisaData(passportCode: string, destinationCode: string, visaData: any, cachedAt: string, assets: { script: string; css: string } | null): string {
  const passportName = visaData.passport?.name || passportCode
  const destinationName = visaData.destination?.name || destinationCode
  const duration = visaData.visa_rules?.primary_rule?.duration || visaData.visa_rules?.secondary_rule?.duration || ''
  const ruleName = visaData.visa_rules?.primary_rule?.name || ''
  const status =
    visaData.visa_rules?.primary_rule?.color === 'green'
      ? 'visa-free'
      : visaData.visa_rules?.primary_rule?.color === 'red'
        ? 'visa required'
        : 'visa on arrival or eVisa'

  const title = `How long can a ${passportName} passport stay in ${destinationName}? Tourist stay limits`
  const description = duration
    ? `${passportName} passport holders can stay in ${destinationName} for ${duration} (${status}). ${ruleName}`
    : `${passportName} passport holders traveling to ${destinationName}: ${status}. ${ruleName}`

  const canonicalUrl = `${baseUrl}/passport/${passportCode}/${destinationCode}`
  const scriptSrc = assets?.script || '/assets/index.js'
  const cssHref = assets?.css || '/assets/index.css'

  const renderedApp = renderToString(
    React.createElement(PassportDestinationView, {
      appName,
      passportCode,
      destinationCode,
      visaData,
      lastUpdated: cachedAt,
      trackStayHref: '/trips',
    })
  )

  const visaStatus =
    visaData.visa_rules?.primary_rule?.color === 'green'
      ? 'Visa-free'
      : visaData.visa_rules?.primary_rule?.color === 'red'
        ? 'Visa required'
        : 'Visa on arrival or eVisa'

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: title,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${description}${duration ? ` Maximum stay duration: ${duration}.` : ''} Visa status: ${visaStatus}.`,
        },
      },
    ],
  }
  const jsonLdString = JSON.stringify(jsonLd).replace(/</g, '\\u003c')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta name="description" content="${description.replace(/"/g, '&quot;')}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta property="og:description" content="${description.replace(/"/g, '&quot;')}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${ogImageUrl}" />
    <meta property="og:site_name" content="${appName.replace(/"/g, '&quot;')}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta name="twitter:description" content="${description.replace(/"/g, '&quot;')}" />
    <meta name="twitter:image" content="${ogImageUrl}" />
    <link rel="stylesheet" crossorigin href="${cssHref}">
    <script type="application/json" id="__PASSPORT_DESTINATION_DATA__">
${JSON.stringify({ passportCode, destinationCode, visaData, lastUpdated: cachedAt }, null, 2)}
    </script>
    <script type="application/ld+json" id="json-ld-seo">${jsonLdString}</script>
  </head>
  <body>
    <div id="root">${renderedApp}</div>
    <script type="module" crossorigin src="${scriptSrc}"></script>
  </body>
</html>`
}

async function getValidCache(passportCode: string, destinationCode: string): Promise<CacheEntry | null> {
  const { data, error } = await supabase
    .from('visa_cache')
    .select('passport_code, destination_code, response_data, cached_at, expires_at')
    .eq('passport_code', passportCode.toUpperCase())
    .eq('destination_code', destinationCode.toUpperCase())
    .gt('expires_at', new Date().toISOString())
    .single()
  if (error || !data) return null
  return data as CacheEntry
}

async function fetchVisaAndCache(passportCode: string, destinationCode: string): Promise<{ visaData: any; cachedAt: string } | null> {
  if (!apiKey) return null
  const requestUrl = `https://visa-requirement.p.rapidapi.com/v2/visa/check`
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': 'visa-requirement.p.rapidapi.com',
      'x-rapidapi-key': apiKey,
    },
    body: JSON.stringify({ passport: passportCode.toUpperCase(), destination: destinationCode.toUpperCase() }),
  })
  if (!response.ok) return null
  const json = await response.json()
  const visaData = json?.data || json
  if (!isRenderableVisaData(visaData)) {
    return null
  }

  const cachedAt = new Date().toISOString()
  await supabase.from('visa_cache').upsert(
    {
      passport_code: passportCode.toUpperCase(),
      destination_code: destinationCode.toUpperCase(),
      response_data: json,
      cached_at: cachedAt,
    },
    { onConflict: 'passport_code,destination_code' }
  )
  return { visaData, cachedAt }
}

async function handlePassportRoute(passportCode: string, destinationCode: string, res: ServerResponse, assets: { script: string; css: string } | null) {
  const routeDir = join(distPath, 'passport', passportCode, destinationCode)
  const indexPath = join(routeDir, 'index.html')

  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, 'utf-8')
    safeSend(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' })
    return
  }

  const cached = await getValidCache(passportCode, destinationCode)
  if (cached?.response_data) {
    const visaData = cached.response_data?.data || cached.response_data
    if (!isRenderableVisaData(visaData)) {
      safeSend(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' })
      return
    }
    const html = generateHTMLFromVisaData(passportCode, destinationCode, visaData, cached.cached_at, assets)
    mkdirSync(routeDir, { recursive: true })
    writeFileSync(indexPath, html, 'utf-8')
    safeSend(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' })
    return
  }

  const fetched = await fetchVisaAndCache(passportCode, destinationCode)
  if (fetched) {
    const html = generateHTMLFromVisaData(passportCode, destinationCode, fetched.visaData, fetched.cachedAt, assets)
    mkdirSync(routeDir, { recursive: true })
    writeFileSync(indexPath, html, 'utf-8')
    safeSend(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' })
    return
  }

  safeSend(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' })
}

function normalizePassportPath(urlPath: string): { passportCode: string; destinationCode: string } | null {
  const parts = urlPath.split('?')[0].split('#')[0].split('/').filter(Boolean)
  if (parts.length < 3) return null
  if (parts[0] !== 'passport') return null
  const passportCode = (parts[1] || '').toLowerCase()
  const destinationCode = (parts[2] || '').toLowerCase()
  if (!passportCode || !destinationCode) return null
  return { passportCode, destinationCode }
}

const assets = extractAssetsFromIndex()
const port = Number(process.env.PORT || 4173)

createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const urlPath = req.url || '/'

    const passportMatch = normalizePassportPath(urlPath)
    if (passportMatch) {
      await handlePassportRoute(passportMatch.passportCode, passportMatch.destinationCode, res, assets)
      return
    }

    // Static file handling
    const fsPath = join(distPath, urlPath.split('?')[0])
    if (existsSync(fsPath) && !fsPath.endsWith('/')) {
      const buf = readFileSync(fsPath)
      res.statusCode = 200
      res.setHeader('Content-Type', contentTypeForPath(fsPath))
      res.end(buf)
      return
    }

    // SPA fallback
    const indexPath = join(distPath, 'index.html')
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, 'utf-8')
      safeSend(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' })
      return
    }

    safeSend(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' })
  } catch (e: any) {
    safeSend(res, 500, e?.message || 'Server error', { 'Content-Type': 'text/plain; charset=utf-8' })
  }
}).listen(port, () => {
  console.log(`On-demand SSG server running on http://localhost:${port}`)
})

