// api/backend.js — Quantum AI Hub proxy handler
// Fixes: v1beta endpoint, CORS headers, robust error handling

export default async function handler(req, res) {
  // ── CORS ────────────────────────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  console.log("METHOD:", req.method);

  // ── DEBUG / HEALTH CHECK ────────────────────────────────────────────────────
  if (req.method === "GET") {
    return res.status(200).json({
      status: "Backend alive",
      timestamp: new Date().toISOString(),
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      // FIX: was pointing at v1 — gemini-2.5-flash requires v1beta
      geminiEndpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      receivedMethod: req.method,
    });
  }

  // ── VALIDATE BODY ───────────────────────────────────────────────────────────
  try {
    const { systemPrompt, userPrompt, useWebSearch = false } = req.body || {};

    if (!systemPrompt || !userPrompt) {
      return res.status(400).json({
        error: "Missing systemPrompt or userPrompt",
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured in Vercel environment variables.",
      });
    }

    // ── BUILD GEMINI PAYLOAD ──────────────────────────────────────────────────
    const payload = {
      systemInstruction: {
        role: "system",
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1200,
        temperature: 0.7,
      },
    };

    // Only attach Google Search grounding when explicitly requested
    if (useWebSearch) {
      payload.tools = [{ googleSearch: {} }];
    }

    // ── CALL GEMINI ───────────────────────────────────────────────────────────
    // FIX: was /v1/ — gemini-2.5-flash is only available on /v1beta/
    const GEMINI_URL =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    console.log("Sending request to Gemini v1beta...");

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log("Gemini status:", response.status);

    // ── PARSE RESPONSE ────────────────────────────────────────────────────────
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return res.status(500).json({
        error: "Gemini returned non-JSON response",
        raw: responseText.slice(0, 500), // truncate for safety
      });
    }

    if (!response.ok) {
      console.error("Gemini API error:", JSON.stringify(data));
      return res.status(response.status).json({
        error: "Gemini API error",
        details: data,
      });
    }

    // ── EXTRACT TEXT ──────────────────────────────────────────────────────────
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("\n") || "";

    // Gemini sometimes wraps JSON in markdown fences — strip them for agents
    const cleanText = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    return res.status(200).json({
      text: cleanText,
      groundingMetadata: data?.candidates?.[0]?.groundingMetadata || null,
    });

  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
}
