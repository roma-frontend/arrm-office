import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { signJWT } from "@/lib/jwt";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;

async function convexMutation(path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
  });
  const data = await res.json();
  if (data.status === "error") throw new Error(data.errorMessage ?? "Convex error");
  return data.value;
}

async function convexQuery(path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
  });
  const data = await res.json();
  if (data.status === "error") return null;
  return data.value;
}

/**
 * POST /api/auth/oauth-session
 * Called after Google OAuth sync to create a JWT session for the user.
 * This replaces window.location.reload() — no page reload needed.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, name, avatarUrl } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();

    // 1. Find user by email directly via query
    const userResult = await convexQuery("users:getUserByEmail", { email: emailLower });

    if (!userResult) {
      return NextResponse.json({ error: "User not found in database" }, { status: 404 });
    }

    // 2. Create session via mutation (bypasses password — OAuth is trusted)
    const sessionToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sessionExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    await convexMutation("auth:login", {
      email: emailLower,
      password: "",
      sessionToken,
      sessionExpiry,
      isFaceLogin: true, // skip password check
    });

    const result = userResult;

    // Create JWT — getUserByEmail returns Convex doc with _id field
    const jwt = await signJWT({
      userId: result._id,
      name: result.name,
      email: result.email,
      role: result.role,
      organizationId: result.organizationId,
      department: result.department,
      position: result.position,
      employeeType: result.employeeType,
      avatar: result.avatarUrl ?? avatarUrl,
    });

    // Set cookies
    const cookieStore = await cookies();
    cookieStore.set("hr-auth-token", jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });
    cookieStore.set("hr-session-token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    // Log the OAuth login
    try {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      const auditEnabled = await convexQuery("security:getSetting", { key: "audit_logging" });
      if (auditEnabled) {
        await convexMutation("security:logLoginAttempt", {
          email: emailLower,
          userId: result._id,
          organizationId: result.organizationId,
          success: true,
          method: "google",
          ip,
          userAgent: req.headers.get("user-agent") ?? undefined,
          riskScore: 5, // Google OAuth is trusted
          riskFactors: [],
        });
      }
    } catch {}

    return NextResponse.json({
      success: true,
      session: {
        userId: result._id,
        name: result.name,
        email: result.email,
        role: result.role,
        organizationId: result.organizationId,
        department: result.department,
        position: result.position,
        employeeType: result.employeeType,
        avatar: result.avatarUrl ?? avatarUrl,
      },
    });
  } catch (error: any) {
    console.error("OAuth session error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create OAuth session" },
      { status: 500 }
    );
  }
}
