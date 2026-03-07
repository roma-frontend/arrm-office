import { NextResponse } from "next/server";
import { getSharePointAuthUrl } from "@/lib/sharepoint-sync";

export async function GET() {
  try {
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/sharepoint/callback`;
    const authUrl = getSharePointAuthUrl(redirectUri);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("SharePoint auth error:", error);
    return NextResponse.redirect(
      new URL(
        `/settings?sharepoint=error`,
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      )
    );
  }
}
