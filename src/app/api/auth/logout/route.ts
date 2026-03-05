import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

/**
 * Logout API Route - Complete session termination
 * 1. Clears NextAuth session on server
 * 2. Clears session cookies
 * 3. Redirects to login page
 */
export async function POST(req: NextRequest) {
  try {
    console.log("[Logout API] Logout request received");

    // Get the redirect URL from query params
    const redirectUrl = req.nextUrl.searchParams.get("redirect") || "/login";

    // Get current session and invalidate it
    const session = await getServerSession(authOptions);
    console.log("[Logout API] Current session:", session?.user?.email);

    // Create response that redirects
    const response = NextResponse.redirect(new URL(redirectUrl, req.url), {
      status: 302,
    });

    // Clear NextAuth session cookie (the most important part)
    // NextAuth uses 'next-auth.session-token' or '__Secure-next-auth.session-token'
    response.cookies.set("next-auth.session-token", "", {
      maxAge: 0,
      path: "/",
      httpOnly: true,
    });
    response.cookies.set("__Secure-next-auth.session-token", "", {
      maxAge: 0,
      path: "/",
      httpOnly: true,
      secure: true,
    });

    // Also clear CSRF token
    response.cookies.set("next-auth.csrf-token", "", {
      maxAge: 0,
      path: "/",
      httpOnly: true,
    });
    response.cookies.set("__Secure-next-auth.csrf-token", "", {
      maxAge: 0,
      path: "/",
      httpOnly: true,
      secure: true,
    });

    // Clear callback URL
    response.cookies.set("next-auth.callback-url", "", {
      maxAge: 0,
      path: "/",
      httpOnly: true,
    });

    // Set no-cache headers
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");

    console.log("[Logout API] Session cookies cleared, redirecting to:", redirectUrl);

    return response;
  } catch (error) {
    console.error("[Logout API] Error during logout:", error);
    
    // Even on error, redirect to login
    return NextResponse.redirect(new URL("/login", req.url), { status: 302 });
  }
}

