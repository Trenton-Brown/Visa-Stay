import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

function json(res: any, status: number, body: any) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readRawBody(req: any): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Allow', 'POST')
    return res.end('Method Not Allowed')
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!stripeSecretKey) return json(res, 500, { error: 'Missing STRIPE_SECRET_KEY' })
  if (!stripeWebhookSecret) return json(res, 500, { error: 'Missing STRIPE_WEBHOOK_SECRET' })
  if (!supabaseUrl) return json(res, 500, { error: 'Missing VITE_SUPABASE_URL' })
  if (!supabaseServiceRoleKey) return json(res, 500, { error: 'Missing SUPABASE_SERVICE_ROLE_KEY' })

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

  const sig = req.headers['stripe-signature']
  if (!sig || typeof sig !== 'string') return json(res, 400, { error: 'Missing stripe-signature header' })

  let event: Stripe.Event
  try {
    const raw = await readRawBody(req)
    event = stripe.webhooks.constructEvent(raw, sig, stripeWebhookSecret)
  } catch (err: any) {
    return json(res, 400, { error: `Webhook signature verification failed: ${err?.message || String(err)}` })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabase_user_id || session.client_reference_id || null
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null
        const subscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null

        if (!userId) break

        await supabaseAdmin.from('user_preferences').upsert(
          {
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
          },
          { onConflict: 'user_id' }
        )
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null
        const userIdFromMeta = sub.metadata?.supabase_user_id || null

        const priceId = sub.items?.data?.[0]?.price?.id || null
        const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null

        if (userIdFromMeta) {
          await supabaseAdmin.from('user_preferences').upsert(
            {
              user_id: userIdFromMeta,
              stripe_customer_id: customerId,
              stripe_subscription_id: sub.id,
              subscription_status: sub.status,
              current_period_end: currentPeriodEnd,
              price_id: priceId,
            },
            { onConflict: 'user_id' }
          )
          break
        }

        // Fallback: map by stripe_customer_id if metadata wasn't available
        if (customerId) {
          await supabaseAdmin
            .from('user_preferences')
            .update({
              stripe_subscription_id: sub.id,
              subscription_status: sub.status,
              current_period_end: currentPeriodEnd,
              price_id: priceId,
            })
            .eq('stripe_customer_id', customerId)
        }
        break
      }

      default:
        // Ignore other events
        break
    }
  } catch (err: any) {
    // Return 500 so Stripe retries (safer than silently dropping state updates).
    return json(res, 500, { error: err?.message || String(err) })
  }

  return json(res, 200, { received: true })
}

