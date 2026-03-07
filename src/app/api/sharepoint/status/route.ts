import { NextRequest, NextResponse } from "next/server";
import { refreshSharePointToken } from "@/lib/sharepoint-sync";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("sharepoint_access_token")?.value;
  const refreshToken = request.cookies.get("sharepoint_refresh_token")?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ connected: false });
  }

  // Verify access token by calling Graph API
  if (accessToken) {
    try {
      const res = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const profile = await res.json();
        return NextResponse.json({
          connected: true,
          email: profile.mail || profile.userPrincipalName,
        });
      }
    } catch {
      // Token might be expired, fall through to refresh
    }
  }

  // Try to refresh the token
  if (refreshToken) {
    try {
      const tokens = await refreshSharePointToken(refreshToken);
      const response = NextResponse.json({ connected: true });

      response.cookies.set("sharepoint_access_token", tokens.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: tokens.expires_in || 3600,
      });

      if (tokens.refresh_token) {
        response.cookies.set(
          "sharepoint_refresh_token",
          tokens.refresh_token,
          {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 365,
          }
        );
      }

      return response;
    } catch {
      // Refresh failed
    }
  }

  return NextResponse.json({ connected: false });
}
