import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { message, context, lang } = await req.json();

    const systemPrompt = `You are a smart reply assistant for a corporate HR chat app.
Generate exactly 3 short, natural, professional reply suggestions for the given message.
Language: ${lang === "ru" ? "Russian" : lang === "hy" ? "Armenian" : "English"}.
Rules:
- Each reply must be SHORT (2-8 words max)
- Replies should cover different intents: agree/acknowledge, ask for more info, decline/postpone
- Return ONLY a JSON array of 3 strings, nothing else
- Example: ["Понял, спасибо!", "Можете уточнить?", "Сделаю позже"]`;

    const userPrompt = `Message to reply to: "${message}"${context ? `\nRecent context: ${context}` : ""}`;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    if (!groqRes.ok) {
      throw new Error(`Groq API error: ${groqRes.status}`);
    }

    const data = await groqRes.json();
    const text = data.choices?.[0]?.message?.content ?? "[]";

    // Parse JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    const replies: string[] = match ? JSON.parse(match[0]) : ["👍 OK", "Понял!", "Позже"];

    return NextResponse.json({ replies: replies.slice(0, 3) });
  } catch (err) {
    console.error("Smart reply error:", err);
    // Fallback replies
    return NextResponse.json({
      replies: ["👍", "Понял, спасибо!", "Можете уточнить?"],
    });
  }
}
