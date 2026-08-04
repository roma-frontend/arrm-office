import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { isValidEmail } from '@/lib/stripe-config';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { verifyJWT } from '@/lib/jwt';
import { logger } from '@/lib/logger';

async function verifyAdmin(req: NextRequest): Promise<boolean> {
  try {
    const cookieHeader = req.headers.get('cookie') || '';
    const jwtMatch = cookieHeader.match(/hr-auth-token=([^;]+)/);
    const jwt = jwtMatch ? jwtMatch[1] : null;
    if (!jwt) return false;
    const payload = await verifyJWT(jwt);
    if (!payload) return false;
    return payload.role === 'admin' || payload.role === 'superadmin';
  } catch {
    return false;
  }
}

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2026-02-25.clover' });
}

const PLANS: Record<string, { priceId: string; name: string }> = {
  starter: { priceId: process.env.STRIPE_PRICE_STARTER!, name: 'Starter' },
  professional: { priceId: process.env.STRIPE_PRICE_PROFESSIONAL!, name: 'Professional' },
  enterprise: { priceId: process.env.STRIPE_PRICE_ENTERPRISE!, name: 'Enterprise' },
};

export const POST = withCsrfProtection(async (req: NextRequest) => {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe not configured', message: 'STRIPE_SECRET_KEY is not set' },
      { status: 503 },
    );
  }

  try {
    const { plan, email, organizationId } = (await req.json()) as {
      plan?: string;
      email?: string;
      organizationId?: string;
    };

    if (!plan || !PLANS[plan]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Validate email if provided
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const priceId = PLANS[plan].priceId;
    if (!priceId || priceId.startsWith('prod_')) {
      logger.error(
        `[Stripe Checkout] Invalid price ID for plan "${plan}": "${priceId}". Must be a price_... ID, not a prod_... ID.`,
      );
      return NextResponse.json(
        {
          error: `Stripe price ID for plan "${plan}" is not configured correctly. Expected a price_... ID.`,
        },
        { status: 500 },
      );
    }

    const origin =
      req.headers.get('origin') ?? process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: PLANS[plan].priceId,
          quantity: 1,
        },
      ],
      customer_email: email ?? undefined,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      subscription_data: {
        trial_period_days: 14,
        metadata: { plan, organizationId: organizationId ?? '' },
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: `${origin}/#pricing`,
      metadata: { plan, organizationId: organizationId ?? '' },
      client_reference_id: organizationId ?? undefined,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Checkout failed';
    logger.error('[Stripe Checkout]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
