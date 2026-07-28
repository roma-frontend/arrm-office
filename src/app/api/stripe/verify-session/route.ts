import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2026-02-25.clover' });
}

/**
 * Verify a Stripe checkout session is real and completed.
 * Prevents users from accessing /checkout/success without paying.
 */
export async function GET(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ valid: false, error: 'Stripe not configured' }, { status: 503 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json({ valid: false, error: 'No session ID' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return NextResponse.json({
      valid: session.payment_status === 'paid' || session.mode === 'subscription',
      status: session.status,
      paymentStatus: session.payment_status,
    });
  } catch (err: unknown) {
    console.error(
      '[Stripe Verify] Session verification failed:',
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json({ valid: false, error: 'Invalid session' }, { status: 400 });
  }
}
