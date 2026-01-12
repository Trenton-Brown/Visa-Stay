import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

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
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!stripeSecretKey) return json(res, 500, { error: 'Missing STRIPE_SECRET_KEY' })
  if (!supabaseUrl || !supabaseAnonKey) return json(res, 500, { error: 'Missing Supabase env vars' })
  if (!supabaseServiceRoleKey) return json(res, 500, { error: 'Missing SUPABASE_SERVICE_ROLE_KEY' })

  const token = getBearerToken(req)
  if (!token) return json(res, 401, { error: 'Missing Authorization Bearer token' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const sessionId = body?.sessionId as string | undefined
  if (!sessionId || typeof sessionId !== 'string') return json(res, 400, { error: 'Missing sessionId' })

  // Validate the Supabase session (anon key client is enough for auth.getUser).
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey)
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token)
  if (userError || !userData?.user) return json(res, 401, { error: 'Invalid session' })

  const userId = userData.user.id

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

  // Retrieve the checkout session and its subscription.
  const session = await stripe.checkout.sessions.retrieve(sessionId)

  const sessionUserId = session.metadata?.supabase_user_id || session.client_reference_id || null
  if (sessionUserId && sessionUserId !== userId) {
    return json(res, 403, { error: 'Checkout session does not belong to this user' })
  }

  if (session.mode !== 'subscription') {
    return json(res, 400, { error: `Checkout session is not a subscription (mode=${session.mode})` })
  }

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null

  if (!customerId) return json(res, 400, { error: 'Checkout session missing customer' })
  if (!subscriptionId) return json(res, 400, { error: 'Checkout session missing subscription' })

  const sub = await stripe.subscriptions.retrieve(subscriptionId)
  const priceId = sub.items?.data?.[0]?.price?.id || null
  const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null

  await supabaseAdmin.from('user_preferences').upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: sub.status,
      current_period_end: currentPeriodEnd,
      price_id: priceId,
      email: userData.user.email || null,
    },
    { onConflict: 'user_id' }
  )

  return json(res, 200, { ok: true, subscription_status: sub.status, current_period_end: currentPeriodEnd })
}

