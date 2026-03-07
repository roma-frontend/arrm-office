import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set("google_access_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  });

  response.cookies.set("google_refresh_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
  });

  return response;
}
