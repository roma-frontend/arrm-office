import { NextRequest, NextResponse } from 'next/server';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

async function convexMutation(path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args }),
  });
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.errorMessage ?? 'Convex error');
  return data.value;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return new NextResponse(htmlPage('Missing token', 'No unsubscribe token provided.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  try {
    const result = await convexMutation('newsletter:unsubscribe', { token });

    if (!result?.success) {
      return new NextResponse(htmlPage('Not Found', 'Invalid or expired unsubscribe link.'), {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new NextResponse(
      htmlPage(
        'Unsubscribed',
        "You've been successfully unsubscribed from the Strata newsletter. We're sorry to see you go!",
      ),
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    );
  } catch {
    return new NextResponse(htmlPage('Error', 'Something went wrong. Please try again later.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

function htmlPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - Strata</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;padding:60px 20px;text-align:center;color:#1e293b;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:48px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="font-size:24px;margin:0 0 16px;">${title}</h1>
    <p style="font-size:16px;color:#475569;line-height:1.6;">${message}</p>
  </div>
</body>
</html>`;
}
