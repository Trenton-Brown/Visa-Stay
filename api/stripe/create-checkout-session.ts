import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const PRICE_MONTHLY = 'price_1SoYqrQcj37z6ydVlpt9vLDN'
const PRICE_YEARLY = 'price_1SoYrlQcj37z6ydVkSupTxsO'

function getBearerToken(req: any): string | null {
  const header = req?.headers?.authorization || req?.headers?.Authorization
  if (!header || typeof header !== 'string') return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

function json(res: any, status: number, body: any) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST')
    return res.end('Method Not Allowed')
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  const webhookBaseUrl = process.env.VITE_BASE_URL || 'https://visastay.app'

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!stripeSecretKey) return json(res, 500, { error: 'Missing STRIPE_SECRET_KEY' })
  if (!supabaseUrl || !supabaseAnonKey) return json(res, 500, { error: 'Missing Supabase env vars' })
  if (!supabaseServiceRoleKey) return json(res, 500, { error: 'Missing SUPABASE_SERVICE_ROLE_KEY' })

  const token = getBearerToken(req)
  if (!token) return json(res, 401, { error: 'Missing Authorization Bearer token' })

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })

  // Use anon client only to validate the access token.
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey)
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token)
  if (userError || !userData?.user) return json(res, 401, { error: 'Invalid session' })

  const user = userData.user
  const email = user.email || undefined

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const priceId = body?.priceId as string | undefined

  if (!priceId || (priceId !== PRICE_MONTHLY && priceId !== PRICE_YEARLY)) {
    return json(res, 400, { error: 'Invalid priceId' })
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

  // Fetch existing preferences (if any)
  const { data: pref } = await supabaseAdmin
    .from('user_preferences')
    .select('has_free_access, stripe_customer_id, subscription_status, current_period_end')
    .eq('user_id', user.id)
    .maybeSingle()

  const hasFreeAccess = Boolean(pref?.has_free_access)
  const status = pref?.subscription_status || null
  const currentPeriodEnd = pref?.current_period_end ? new Date(pref.current_period_end).getTime() : null
  const isPaid =
    hasFreeAccess || (status && ['active', 'trialing'].includes(status) && currentPeriodEnd && currentPeriodEnd > Date.now())

  if (isPaid) {
    return json(res, 200, { alreadyPaid: true, url: `${webhookBaseUrl}/trips` })
  }

  let customerId = pref?.stripe_customer_id || null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id

    // Ensure a row exists and store the customer id for webhook mapping.
    await supabaseAdmin
      .from('user_preferences')
      .upsert({ user_id: user.id, email: user.email || null, stripe_customer_id: customerId }, { onConflict: 'user_id' })
  }

  const successUrl = `${webhookBaseUrl}/trips`
  const cancelUrl = `${webhookBaseUrl}/`

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: user.id,
    metadata: { supabase_user_id: user.id },
    subscription_data: {
      metadata: { supabase_user_id: user.id },
    },
  })

  if (!session.url) return json(res, 500, { error: 'Stripe session missing URL' })
  return json(res, 200, { url: session.url })
}

