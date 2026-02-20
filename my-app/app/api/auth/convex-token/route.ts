import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ token: null });
  }

  const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);

  const token = await new SignJWT({
    sub: session.user.id,
    name: session.user.name,
    email: session.user.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .setIssuer(process.env.NEXTAUTH_URL!)
    .setAudience("convex")
    .sign(secret);

  return NextResponse.json({ token });
}