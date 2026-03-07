import { NextRequest, NextResponse } from "next/server";
import {
  fetchSharePointListItems,
  refreshSharePointToken,
} from "@/lib/sharepoint-sync";
import type { SharePointSyncResult } from "@/lib/sharepoint-sync";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

async function convexMutation(path: string, args: Record<string, unknown>) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
  });
  const data = await res.json();
  if (data.status === "error")
    throw new Error(data.errorMessage ?? "Convex error");
  return data.value;
}

export async function POST(request: NextRequest) {
  try {
    const { adminId, organizationId } = await request.json();

    if (!adminId || !organizationId) {
      return NextResponse.json(
        { error: "adminId and organizationId are required" },
        { status: 400 }
      );
    }

    // Get access token from cookies (try refresh if expired)
    let accessToken = request.cookies.get("sharepoint_access_token")?.value;
    const refreshToken = request.cookies.get(
      "sharepoint_refresh_token"
    )?.value;

    if (!accessToken && !refreshToken) {
      return NextResponse.json(
        { error: "Not connected to SharePoint" },
        { status: 401 }
      );
    }

    // Try to refresh token if access token is missing
    let newTokens: {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    } | null = null;
    if (!accessToken && refreshToken) {
      try {
        newTokens = await refreshSharePointToken(refreshToken);
        accessToken = newTokens.access_token;
      } catch {
        return NextResponse.json(
          { error: "SharePoint token expired, please reconnect" },
          { status: 401 }
        );
      }
    }

    // Fetch employees from SharePoint
    const employees = await fetchSharePointListItems(accessToken!);

    const result: SharePointSyncResult = {
      created: 0,
      updated: 0,
      deactivated: 0,
      errors: [],
    };

    // Upsert each employee
    for (const emp of employees) {
      try {
        const upsertResult = await convexMutation(
          "sharepointSync:upsertSharePointUser",
          {
            adminId,
            organizationId,
            email: emp.email,
            name: emp.name,
            department: emp.department,
            position: emp.position,
            phone: emp.phone,
            location: emp.location,
            employeeType: emp.employeeType,
          }
        );

        if (upsertResult.action === "created") {
          result.created++;
        } else {
          result.updated++;
        }
      } catch (err) {
        result.errors.push(
          `Failed to sync ${emp.email}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Deactivate users no longer in SharePoint
    try {
      const activeEmails = employees.map((e) => e.email);
      const deactivateResult = await convexMutation(
        "sharepointSync:deactivateSharePointUsers",
        {
          adminId,
          organizationId,
          activeEmails,
        }
      );
      result.deactivated = deactivateResult.deactivated;
    } catch (err) {
      result.errors.push(
        `Failed to deactivate: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Log the sync
    try {
      await convexMutation("sharepointSync:logSync", {
        organizationId,
        triggeredBy: adminId,
        created: result.created,
        updated: result.updated,
        deactivated: result.deactivated,
        errors: result.errors.length,
      });
    } catch {
      // Non-critical — don't fail the sync if logging fails
    }

    // Build response (optionally set refreshed cookies)
    const response = NextResponse.json(result);

    if (newTokens) {
      response.cookies.set(
        "sharepoint_access_token",
        newTokens.access_token,
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: newTokens.expires_in || 3600,
        }
      );
      if (newTokens.refresh_token) {
        response.cookies.set(
          "sharepoint_refresh_token",
          newTokens.refresh_token,
          {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 365,
          }
        );
      }
    }

    return response;
  } catch (error) {
    console.error("SharePoint sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
