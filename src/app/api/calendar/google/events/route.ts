import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("google_access_token")?.value;
  const refreshToken = request.cookies.get("google_refresh_token")?.value;

  let token = accessToken;

  // Try refresh if access token missing
  if (!token && refreshToken) {
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
          token = tokens.access_token;
        }
      } catch {
        // refresh failed
      }
    }
  }

  if (!token) {
    return NextResponse.json({ events: [], connected: false });
  }

  const { searchParams } = request.nextUrl;
  const timeMin = searchParams.get("timeMin");
  const timeMax = searchParams.get("timeMax");

  if (!timeMin || !timeMax) {
    return NextResponse.json(
      { error: "timeMin and timeMax are required" },
      { status: 400 }
    );
  }

  try {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      if (res.status === 401) {
        return NextResponse.json({ events: [], connected: false });
      }
      throw new Error(`Google API error: ${res.status}`);
    }

    const data = await res.json();

    const events = (data.items || []).map((item: any) => ({
      id: item.id,
      title: item.summary || "(No title)",
      description: item.description || "",
      startDate: item.start?.date || item.start?.dateTime?.split("T")[0] || "",
      endDate: item.end?.date || item.end?.dateTime?.split("T")[0] || "",
      startTime: item.start?.dateTime || null,
      endTime: item.end?.dateTime || null,
      allDay: !!item.start?.date,
      location: item.location || "",
      htmlLink: item.htmlLink || "",
    }));

    // Set refreshed token cookie if we refreshed
    const response = NextResponse.json({ events, connected: true });
    if (!accessToken && token) {
      response.cookies.set("google_access_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 3600,
      });
    }
    return response;
  } catch (error) {
    console.error("Google Calendar events fetch error:", error);
    return NextResponse.json({ events: [], connected: true, error: "fetch_failed" });
  }
}
