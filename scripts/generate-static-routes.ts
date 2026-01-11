import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { PassportDestinationView } from '../src/pages/PassportDestinationView'

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '..', '.env')
config({ path: envPath })

// Also try .env.local
const envLocalPath = join(__dirname, '..', '.env.local')
config({ path: envLocalPath })

// Load environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface CacheEntry {
  passport_code: string
  destination_code: string
  response_data: any
  cached_at: string
  expires_at: string
}

/**
 * Extract asset references from the main index.html
 */
function extractAssetsFromIndex(distPath: string): { script: string; css: string } | null {
  const indexPath = join(distPath, 'index.html')
  if (!existsSync(indexPath)) {
    return null
  }

  const html = readFileSync(indexPath, 'utf-8')
  const scriptMatch = html.match(/<script[^>]+src="([^"]+)"[^>]*>/)
  const cssMatch = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/)
  
  return {
    script: scriptMatch ? scriptMatch[1] : '/assets/index.js',
    css: cssMatch ? cssMatch[1] : '/assets/index.css',
  }
}

/**
 * Generate HTML for a passport/destination route
 */
function generateHTML(entry: CacheEntry, baseUrl: string, assets: { script: string; css: string } | null): string {
  const { passport_code, destination_code, response_data, cached_at } = entry
  const data = response_data?.data
  
  if (!data) {
    console.warn(`Skipping ${passport_code}/${destination_code} - no data`)
    return ''
  }

  const passportName = data.passport?.name || passport_code
  const destinationName = data.destination?.name || destination_code
  const duration = data.visa_rules?.primary_rule?.duration || data.visa_rules?.secondary_rule?.duration || ''
  const ruleName = data.visa_rules?.primary_rule?.name || ''
  const status = data.visa_rules?.primary_rule?.color === 'green' 
    ? 'visa-free' 
    : data.visa_rules?.primary_rule?.color === 'red'
    ? 'visa required'
    : 'visa on arrival or eVisa'

  const title = `How long can a ${passportName} passport stay in ${destinationName}? Tourist stay limits`
  const description = duration
    ? `${passportName} passport holders can stay in ${destinationName} for ${duration} (${status}). ${ruleName}`
    : `${passportName} passport holders traveling to ${destinationName}: ${status}. ${ruleName}`

  const canonicalUrl = `${baseUrl}/passport/${passport_code.toLowerCase()}/${destination_code.toLowerCase()}`
  const appName = process.env.VITE_APP_NAME || 'Visa Stay'
  const ogImageUrl = process.env.VITE_OG_IMAGE_URL || `${baseUrl}/og-image.png`
  
  // Use asset paths from main index.html, or fallback to defaults
  const scriptSrc = assets?.script || '/assets/index.js'
  const cssHref = assets?.css || '/assets/index.css'

  // Pre-render the visible page content so bots/AI (no-JS) can index it.
  const renderedApp = renderToString(
    React.createElement(PassportDestinationView, {
      appName,
      passportCode: passport_code.toLowerCase(),
      destinationCode: destination_code.toLowerCase(),
      visaData: data,
      lastUpdated: cached_at,
      trackStayHref: '/trips',
    })
  )

  const visaStatus =
    data.visa_rules?.primary_rule?.color === 'green'
      ? 'Visa-free'
      : data.visa_rules?.primary_rule?.color === 'red'
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
${JSON.stringify({ passportCode: passport_code.toLowerCase(), destinationCode: destination_code.toLowerCase(), visaData: data, lastUpdated: cached_at }, null, 2)}
    </script>
    <script type="application/ld+json" id="json-ld-seo">${jsonLdString}</script>
  </head>
  <body>
    <div id="root">${renderedApp}</div>
    <script type="module" crossorigin src="${scriptSrc}"></script>
  </body>
</html>`
}

/**
 * Main function to generate static routes
 */
async function generateStaticRoutes() {
  console.log('Starting static route generation...')

  // Query valid cache entries
  const { data, error } = await supabase
    .from('visa_cache')
    .select('passport_code, destination_code, response_data, cached_at, expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('cached_at', { ascending: false })

  if (error) {
    console.error('Error fetching cache entries:', error)
    process.exit(1)
  }

  const entries = (data || []) as CacheEntry[]
  console.log(`Found ${entries.length} valid cache entries`)

  if (entries.length === 0) {
    console.log('No valid cache entries found. Skipping static generation.')
    return
  }

  // Determine output directory (dist folder)
  const distPath = join(process.cwd(), 'dist')
  const baseUrl = process.env.VITE_BASE_URL || process.env.VITE_APP_URL || 'https://visastay.app'

  // Extract asset references from main index.html
  const assets = extractAssetsFromIndex(distPath)
  if (!assets) {
    console.warn('Warning: Could not find dist/index.html. Using default asset paths.')
  }

  let generatedCount = 0

  for (const entry of entries) {
    const passportCode = entry.passport_code.toLowerCase()
    const destinationCode = entry.destination_code.toLowerCase()
    const routeDir = join(distPath, 'passport', passportCode, destinationCode)
    
    try {
      // Create directory if it doesn't exist
      mkdirSync(routeDir, { recursive: true })
      
      // Generate HTML
      const html = generateHTML(entry, baseUrl, assets)
      
      if (html) {
        // Write index.html
        const indexPath = join(routeDir, 'index.html')
        writeFileSync(indexPath, html, 'utf-8')
        generatedCount++
        
        if (generatedCount % 10 === 0) {
          console.log(`Generated ${generatedCount}/${entries.length} pages...`)
        }
      }
    } catch (err) {
      console.error(`Error generating page for ${passportCode}/${destinationCode}:`, err)
    }
  }

  console.log(`✅ Generated ${generatedCount} static pages`)
}

// Run if called directly
generateStaticRoutes().catch((error) => {
  console.error('Error generating static routes:', error)
  process.exit(1)
})

export { generateStaticRoutes }
