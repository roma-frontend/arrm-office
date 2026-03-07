import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("google_access_token")?.value;
  const refreshToken = request.cookies.get("google_refresh_token")?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ connected: false });
  }

  // If we have an access token, verify it's still valid
  if (accessToken) {
    try {
      const res = await fetch(
        "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const profile = await res.json();
        return NextResponse.json({
          connected: true,
          email: profile.email,
        });
      }
    } catch {
      // Token might be expired, fall through to refresh
    }
  }

  // Try to refresh the token
  if (refreshToken) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (clientId && clientSecret) {
      try {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });

        if (tokenRes.ok) {
          const tokens = await tokenRes.json();
          const response = NextResponse.json({ connected: true });
          response.cookies.set("google_access_token", tokens.access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: tokens.expires_in || 3600,
          });
          return response;
        }
      } catch {
        // Refresh failed
      }
    }
  }

  return NextResponse.json({ connected: false });
}
