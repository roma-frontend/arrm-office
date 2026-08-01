import { NextRequest, NextResponse } from 'next/server';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

async function convexMutation(path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  const data = (await res.json()) as { status: string; errorMessage?: string; value?: unknown };
  if (data.status === 'error') throw new Error(data.errorMessage ?? 'Convex error');
  return data.value;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      name?: string;
      language?: string;
      topics?: string[];
    };
    const { email, name, language, topics } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const result = await convexMutation('newsletter:subscribe', {
      email,
      name: name || undefined,
      language: language || 'en',
      topics: topics || undefined,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
