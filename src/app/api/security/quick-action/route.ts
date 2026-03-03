import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { fetchMutation } from "convex/nextjs";
import { Id } from "@/convex/_generated/dataModel";

/**
 * Quick Security Action API
 * Allows superadmin to quickly suspend/unsuspend users from notifications
 */
export async function POST(req: NextRequest) {
  try {
    const { action, userId, adminId, reason, duration } = await req.json();

    if (!action || !userId || !adminId) {
      return NextResponse.json(
        { error: "Missing required fields: action, userId, adminId" },
        { status: 400 }
      );
    }

    // Validate action type
    if (!["suspend", "unsuspend"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'suspend' or 'unsuspend'" },
        { status: 400 }
      );
    }

    let result;

    if (action === "suspend") {
      if (!reason) {
        return NextResponse.json(
          { error: "Reason is required for suspension" },
          { status: 400 }
        );
      }

      result = await fetchMutation(api.users.suspendUser, {
        adminId: adminId as Id<"users">,
        userId: userId as Id<"users">,
        reason,
        duration: duration || 24, // Default 24 hours
      });

      return NextResponse.json({
        success: true,
        message: `User suspended for ${duration || 24} hours`,
        data: result,
      });
    } else {
      // unsuspend
      result = await fetchMutation(api.users.unsuspendUser, {
        adminId: adminId as Id<"users">,
        userId: userId as Id<"users">,
      });

      return NextResponse.json({
        success: true,
        message: "User unsuspended successfully",
        data: result,
      });
    }
  } catch (error: any) {
    console.error("[Quick Action API Error]:", error);
    return NextResponse.json(
      { error: error.message || "Failed to perform action" },
      { status: 500 }
    );
  }
}
