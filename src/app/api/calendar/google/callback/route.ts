import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/calendar-sync";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?google_calendar=error`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(`/settings?google_calendar=error`, request.url)
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code, "google");
    
    // Store tokens securely (in production, save to database)
    const response = NextResponse.redirect(
      new URL("/settings?google_calendar=connected", request.url)
    );
    
    // Set HTTP-only cookies
    response.cookies.set("google_access_token", tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: tokens.expires_in || 3600,
    });
    
    if (tokens.refresh_token) {
      response.cookies.set("google_refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    }
    
    return response;
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return NextResponse.redirect(
      new URL(`/dashboard?error=token_exchange_failed`, request.url)
    );
  }
}
