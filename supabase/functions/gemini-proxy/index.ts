const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY secret not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json() as {
      type?: string;
      text?: string;
      systemPrompt?: string;
      userPrompt?: string;
      responseSchema?: Record<string, unknown>;
    };

    if (body.type === 'embed') {
      const embeddingModel = 'text-embedding-004';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:embedContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          model: `models/${embeddingModel}`,
          content: { parts: [{ text: body.text ?? '' }] },
        }),
      });
      const data = await res.json() as { embedding?: { values?: number[] } };
      return new Response(JSON.stringify({ embedding: data.embedding?.values ?? null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default: generate content
    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const requestBody = {
      contents: [{ parts: [{ text: `${body.systemPrompt ?? ''}\n\n${body.userPrompt ?? ''}` }] }],
      ...(body.responseSchema ? { generationConfig: { responseMimeType: 'application/json', responseSchema: body.responseSchema } } : {}),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: `Gemini API ${res.status}: ${errText}` }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
