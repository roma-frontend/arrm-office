import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { Resend } from 'resend';
import { resolvePlanFromPriceId } from '@/lib/stripe-config';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';
import { sendTelegramNotification } from '@/lib/telegram';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2026-02-25.clover' });
}

// Safe Resend initialization
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const resend = getResend();
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || '';

// ── Processed event IDs cache (in-memory deduplication) ──────────────────────
const processedEvents = new Map<string, number>();
const EVENT_CACHE_TTL = 24 * 60 * 60 * 1000;

function isEventProcessed(eventId: string): boolean {
  const now = Date.now();
  for (const [id, ts] of processedEvents.entries()) {
    if (now - ts > EVENT_CACHE_TTL) processedEvents.delete(id);
  }
  return processedEvents.has(eventId);
}

function markEventProcessed(eventId: string) {
  processedEvents.set(eventId, Date.now());
}

// ── HTTP helpers to avoid Convex type instantiation issues ───────────────────
async function convexMutation(fn: string, args: Record<string, unknown>) {
  await fetch(`${convexUrl}/api/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
}

// ── Send notification email to manager ────────────────────────────────────────
async function notifyManager({
  email,
  plan,
  subscriptionId,
  trialEnd,
}: {
  email: string;
  plan: string;
  subscriptionId: string;
  trialEnd?: number;
}) {
  if (!resend) return; // Resend not configured

  const managerEmail = process.env.MANAGER_EMAIL;
  if (!managerEmail) return;

  const planLabels: Record<string, string> = {
    starter: 'Starter ($29/mo)',
    professional: 'Professional ($79/mo)',
    enterprise: 'Enterprise ($199/mo)',
  };

  const trialEndStr = trialEnd
    ? new Date(trialEnd).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'notifications@yourdomain.com',
    to: managerEmail,
    subject: `🎉 New subscription: ${planLabels[plan] ?? plan} — ${email}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#1e293b;margin-bottom:8px;">New Subscription 🎉</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#64748b;">Customer</td><td style="padding:8px 0;font-weight:600;"><a href="mailto:${email}">${email}</a></td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Plan</td><td style="padding:8px 0;font-weight:600;">${planLabels[plan] ?? plan}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Trial ends</td><td style="padding:8px 0;">${trialEndStr}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;">Subscription</td><td style="padding:8px 0;font-family:monospace;font-size:12px;">${subscriptionId}</td></tr>
      </table>
    </div>`,
  });
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    logger.warn('[Stripe Webhook] Not configured, skipping');
    return NextResponse.json({ received: true, skipped: true });
  }

  const body = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';

  if (!webhookSecret) {
    logger.warn('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ received: true, skipped: true });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: unknown) {
    logger.error(
      '[Stripe Webhook] Signature failed:',
      err instanceof Error ? err.message : String(err),
    );
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: { stripe: 'webhook_signature' },
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (isEventProcessed(event.id)) {
    logger.log('[Stripe Webhook] ⏭️ Duplicate skipped:', event.id);
    return NextResponse.json({ received: true, dedup: true });
  }
  markEventProcessed(event.id);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.log('[Stripe] ✅ checkout.session.completed:', session.id);

        if (session.mode === 'subscription' && session.subscription) {
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price'] });
          const priceId = sub.items.data[0]?.price?.id ?? '';
          const plan = (session.metadata?.plan as string) ?? resolvePlanFromPriceId(priceId);

          if (!plan) {
            logger.error('[Stripe] ❌ Unknown plan:', priceId);
            Sentry.captureException(new Error(`Unknown plan: ${priceId}`), {
              tags: { stripe: 'unknown_plan' },
              extra: { sessionId: session.id, priceId },
            });
            break;
          }

          await convexMutation('subscriptions/upsertSubscription', {
            organizationId:
              session.metadata?.organizationId ||
              (typeof session.client_reference_id === 'string'
                ? session.client_reference_id
                : '') ||
              undefined,
            stripeCustomerId:
              typeof sub.customer === 'string'
                ? sub.customer
                : (sub.customer as Stripe.Customer | Stripe.DeletedCustomer).id,
            stripeSubscriptionId: sub.id,
            stripeSessionId: session.id,
            plan,
            status: sub.status,
            email: session.customer_email ?? session.customer_details?.email ?? undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            currentPeriodStart: (sub as any).current_period_start * 1000,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            currentPeriodEnd: (sub as any).current_period_end * 1000,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            trialEnd: sub.trial_end ? (sub.trial_end as number) * 1000 : undefined,
          });

          logger.log('[Stripe] ✅ Subscription saved:', sub.id, plan);

          const customerEmail = session.customer_email ?? session.customer_details?.email;
          if (customerEmail) {
            await notifyManager({
              email: customerEmail,
              plan,
              subscriptionId: sub.id,
              trialEnd: sub.trial_end ? (sub.trial_end as number) * 1000 : undefined,
            });
            await sendTelegramNotification(
              `💳 <b>Новая подписка Stripe</b>\n\n📧 ${customerEmail}\n📦 План: ${plan}\n🆔 ${sub.id}`,
            );
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        logger.log('[Stripe] 🔄 subscription.updated:', sub.id);
        await convexMutation('subscriptions/updateSubscriptionStatus', {
          stripeSubscriptionId: sub.id,
          status: sub.status,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          currentPeriodStart: (sub as any).current_period_start * 1000,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          currentPeriodEnd: (sub as any).current_period_end * 1000,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        logger.log('[Stripe] ❌ subscription.deleted:', sub.id);
        await convexMutation('subscriptions/updateSubscriptionStatus', {
          stripeSubscriptionId: sub.id,
          status: 'canceled',
          cancelAtPeriodEnd: false,
        });
        await sendTelegramNotification(`❌ <b>Подписка отменена</b>\n\n🆔 ${sub.id}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sub = (invoice as any).subscription;
        const subId = typeof sub === 'string' ? sub : sub?.id;
        logger.log('[Stripe] ⚠️ invoice.payment_failed:', invoice.id);
        if (subId) {
          await convexMutation('subscriptions/updateSubscriptionStatus', {
            stripeSubscriptionId: subId,
            status: 'past_due',
            cancelAtPeriodEnd: false,
          });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sub = (invoice as any).subscription;
        const subId = typeof sub === 'string' ? sub : sub?.id;
        logger.log('[Stripe] 💰 invoice.payment_succeeded:', invoice.id);
        if (subId) {
          await convexMutation('subscriptions/updateSubscriptionStatus', {
            stripeSubscriptionId: subId,
            status: 'active',
            cancelAtPeriodEnd: false,
            currentPeriodStart: invoice.period_start ? invoice.period_start * 1000 : undefined,
            currentPeriodEnd: invoice.period_end ? invoice.period_end * 1000 : undefined,
          });
        }
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as Stripe.Subscription;
        logger.log('[Stripe] ⏳ trial_will_end:', sub.id);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        logger.log('[Stripe] 💸 charge.refunded:', charge.id);
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        logger.log('[Stripe] ❌ payment_intent.payment_failed:', intent.id);
        Sentry.captureException(new Error(`Payment intent failed: ${intent.id}`), {
          tags: { stripe: 'payment_intent_failed' },
          extra: { intentId: intent.id, amount: intent.amount },
        });
        break;
      }

      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        const sub = event.data.object as Stripe.Subscription;
        logger.log(`[Stripe] ${event.type}:`, sub.id);
        await convexMutation('subscriptions/updateSubscriptionStatus', {
          stripeSubscriptionId: sub.id,
          status: event.type === 'customer.subscription.paused' ? 'canceled' : 'active',
          cancelAtPeriodEnd: false,
        });
        break;
      }

      default:
        logger.log('[Stripe Webhook] Unhandled:', event.type);
        break;
    }
  } catch (err: unknown) {
    logger.error(
      '[Stripe Webhook] Handler error:',
      err instanceof Error ? err.message : String(err),
    );
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: { stripe: 'webhook_handler' },
      extra: { eventType: event.type, eventId: event.id },
    });
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
