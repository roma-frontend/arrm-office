import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verifyJWT } from '@/lib/jwt';
import { logger } from '@/lib/logger';

const _isDev = process.env.NODE_ENV === 'development';

// Safe Stripe initialization - only create if key exists
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    logger.warn('[Stripe] STRIPE_SECRET_KEY not configured');
    return null;
  }
  return new Stripe(key, {
    apiVersion: '2026-02-25.clover',
  });
}

async function verifySuperadmin(req: NextRequest): Promise<boolean> {
  try {
    const cookieHeader = req.headers.get('cookie') || '';
    const jwtMatch = cookieHeader.match(/hr-auth-token=([^;]+)/);
    const jwt = jwtMatch ? jwtMatch[1] : null;

    if (!jwt) return false;

    const payload = await verifyJWT(jwt);
    if (!payload) return false;

    return payload.role === 'superadmin';
  } catch (error) {
    logger.error('[Stripe Auth] Error:', error);
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!(await verifySuperadmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      {
        error: 'Stripe not configured',
        message: 'STRIPE_SECRET_KEY environment variable is not set',
        metrics: {
          totalSubscriptions: 0,
          active: 0,
          trialing: 0,
          canceled: 0,
          pastDue: 0,
          mrr: 0,
          totalRevenue: 0,
          last30DaysRevenue: 0,
          growth: '0',
          trialEnding: 0,
        },
        subscriptions: [],
        recentTransactions: [],
      },
      { status: 200 },
    );
  }

  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');

    // Get charges (payments)
    const charges = await stripe.charges.list({ limit });

    // Get subscriptions
    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
      status: 'all',
      expand: ['data.customer', 'data.items.data.price'],
    });

    // Calculate metrics
    const now = Date.now();
    const lastMonth = now - 30 * 24 * 60 * 60 * 1000;

    const activeSubs = subscriptions.data.filter((s) => s.status === 'active');
    const trialingSubs = subscriptions.data.filter((s) => s.status === 'trialing');
    const canceledSubs = subscriptions.data.filter((s) => s.status === 'canceled');
    const pastDueSubs = subscriptions.data.filter((s) => s.status === 'past_due');

    // Calculate MRR
    const planPrices: Record<string, number> = {
      price_starter: 29,
      price_professional: 79,
      price_enterprise: 199,
    };

    let mrr = 0;
    activeSubs.forEach((sub) => {
      const priceId = sub.items.data[0]?.price?.id || '';
      const price = planPrices[priceId] || 79; // default to professional
      mrr += price;
    });

    // Calculate total revenue from charges
    const totalRevenue = charges.data
      .filter((c) => c.status === 'succeeded')
      .reduce((sum, c) => sum + (c.amount || 0), 0);

    // Last 30 days revenue
    const last30DaysRevenue = charges.data
      .filter((c) => c.status === 'succeeded' && c.created * 1000 > lastMonth)
      .reduce((sum, c) => sum + (c.amount || 0), 0);

    // Growth calculation
    const last60Days = now - 60 * 24 * 60 * 60 * 1000;
    const recentSubs = subscriptions.data.filter((s) => s.created * 1000 > lastMonth);
    const olderSubs = subscriptions.data.filter(
      (s) => s.created * 1000 > last60Days && s.created * 1000 <= lastMonth,
    );
    const growth =
      olderSubs.length > 0
        ? (((recentSubs.length - olderSubs.length) / olderSubs.length) * 100).toFixed(1)
        : '0.0';

    // Trial ending soon (within 7 days)
    const trialEnding = subscriptions.data.filter((sub) => {
      if (sub.status !== 'trialing' || !sub.trial_end) return false;
      const daysLeft = Math.ceil((sub.trial_end - now / 1000) / (60 * 60 * 24));
      return daysLeft >= 0 && daysLeft <= 7;
    });

    // Recent transactions
    const recentTransactions = charges.data.slice(0, 100).map((charge) => {
      const cardDetails = charge.payment_method_details?.card;
      return {
        id: charge.id,
        amount: (charge.amount || 0) / 100,
        currency: charge.currency.toUpperCase(),
        status: charge.status,
        customer: charge.billing_details?.email || charge.billing_details?.name || 'N/A',
        date: new Date(charge.created * 1000).toISOString(),
        description: charge.description || 'Subscription payment',
        // Card details for support
        cardLast4: cardDetails?.last4 || null,
        cardBrand: cardDetails?.brand || null,
        cardExp:
          cardDetails?.exp_month && cardDetails?.exp_year
            ? `${cardDetails.exp_month}/${cardDetails.exp_year}`
            : null,
        receiptUrl: charge.receipt_url,
      };
    });

    // Subscriptions with customer info
    const subscriptionList = subscriptions.data.map((sub) => {
      const customer = sub.customer as Stripe.Customer | Stripe.DeletedCustomer | string | null;
      const price = sub.items.data[0]?.price;
      const priceId = price?.id || '';
      const amount = price?.unit_amount ? price.unit_amount / 100 : 0;

      const customerEmail =
        typeof customer === 'object' && customer !== null && 'email' in customer
          ? (customer.email ?? 'N/A')
          : 'N/A';
      const customerName =
        typeof customer === 'object' && customer !== null && 'name' in customer
          ? (customer.name ?? 'N/A')
          : 'N/A';

      return {
        id: sub.id,
        status: sub.status,
        plan: price?.nickname || priceId || 'unknown',
        amount,
        customer: {
          email: customerEmail,
          name: customerName,
        },
        currentPeriodEnd:
          ('current_period_end' in sub ? (sub.current_period_end as number) : 0) * 1000,
        currentPeriodStart:
          ('current_period_start' in sub ? (sub.current_period_start as number) : 0) * 1000,
        cancelAtPeriodEnd: sub.cancel_at_period_end || false,
        trialEnd:
          'trial_end' in sub && sub.trial_end ? (sub.trial_end as number) * 1000 : undefined,
        created: sub.created * 1000,
      };
    });

    return NextResponse.json({
      success: true,
      metrics: {
        totalSubscriptions: subscriptions.data.length,
        active: activeSubs.length,
        trialing: trialingSubs.length,
        canceled: canceledSubs.length,
        pastDue: pastDueSubs.length,
        mrr,
        totalRevenue: totalRevenue / 100,
        last30DaysRevenue: last30DaysRevenue / 100,
        growth,
        trialEnding: trialEnding.length,
      },
      subscriptions: subscriptionList,
      recentTransactions,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch Stripe data';
    logger.error('[Stripe API] Error:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
