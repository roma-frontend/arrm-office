import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    return NextResponse.json({ rates: data.rates });
  } catch {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD', {
        next: { revalidate: 3600 },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      return NextResponse.json({ rates: data.rates });
    } catch {
      return NextResponse.json({ rates: {} });
    }
  }
}
