export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { systemPrompt, userPrompt, useWebSearch } = req.body;

  // Validate required parameters
  if (!systemPrompt || !userPrompt) {
    return res.status(400).json({ error: 'Missing systemPrompt or userPrompt payload strings.' });
  }

  try {
    // Structure payload matching Google's Gemini Developer API structure
    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        maxOutputTokens: 1200
      }
    };

    // Dynamically inject Google Search grounding if requested by the frontend agent
    if (useWebSearch) {
      body.tools = [{ googleSearch: {} }];
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API native structural error:', errorData);
      return res.status(response.status).json({ 
        error: 'Gemini API operational error',
        details: errorData 
      });
    }

    const data = await response.json();
    
    // Extract text block output from the response mapping
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return res.status(200).json({ text });
  } catch (error) {
    console.error('Server execution error:', error);
    return res.status(500).json({ 
      error: 'Internal edge route error',
      message: error.message 
    });
  }
}