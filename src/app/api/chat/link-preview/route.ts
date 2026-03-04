import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "No URL" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HROfficeBot/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Fetch failed");
    const html = await res.text();

    const getMeta = (prop: string): string | undefined => {
      const patterns = [
        new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"),
        new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
      ];
      for (const re of patterns) {
        const m = html.match(re);
        if (m?.[1]) return m[1].trim();
      }
    };

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    const preview = {
      url,
      title: getMeta("title") ?? titleMatch?.[1]?.trim(),
      description: getMeta("description"),
      image: getMeta("image"),
      siteName: getMeta("site_name") ?? new URL(url).hostname.replace("www.", ""),
    };

    return NextResponse.json(preview, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ url, siteName: new URL(url).hostname });
  }
}
