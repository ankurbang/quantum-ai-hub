export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { systemPrompt, userPrompt, useWebSearch = false } = req.body || {};

    if (!systemPrompt || !userPrompt) {
      return res.status(400).json({
        error: "Missing systemPrompt or userPrompt",
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured",
      });
    }

    const payload = {
      systemInstruction: {
        role: "system",
        parts: [
          {
            text: systemPrompt,
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: userPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1200,
        temperature: 0.7,
      },
    };

    // Optional Google Search grounding
    if (useWebSearch) {
      payload.tools = [
        {
          googleSearch: {},
        },
      ];
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const responseText = await response.text();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse Gemini response:", responseText);

      return res.status(500).json({
        error: "Invalid response from Gemini",
        raw: responseText,
      });
    }

    if (!response.ok) {
      console.error("Gemini API Error:", data);

      return res.status(response.status).json({
        error: "Gemini API error",
        details: data,
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("\n") || "";

    return res.status(200).json({
      text,
      groundingMetadata:
        data?.candidates?.[0]?.groundingMetadata || null,
    });
  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
}
