import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Converts Gemini-style schema (uppercase types, nullable) to Anthropic tool input_schema format
const geminiSchemaToAnthropicSchema = (schema: Record<string, unknown>): Record<string, unknown> => {
  const convert = (s: Record<string, unknown>): Record<string, unknown> => {
    if (!s || typeof s !== 'object') return s;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) {
      if (k === 'type' && typeof v === 'string') {
        result[k] = v.toLowerCase();
      } else if (k === 'nullable') {
        continue;
      } else if (typeof v === 'object' && v !== null) {
        result[k] = convert(v as Record<string, unknown>);
      } else {
        result[k] = v;
      }
    }
    return result;
  };
  return convert(schema);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY secret not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { systemPrompt, userPrompt, outputSchema } = await req.json() as {
      systemPrompt: string;
      userPrompt: string;
      outputSchema?: Record<string, unknown>;
    };

    const client = new Anthropic({ apiKey });
    const model = Deno.env.get('CLAUDE_MODEL') || 'claude-sonnet-4-6';

    let result: string;

    if (outputSchema) {
      const response = await client.messages.create({
        model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [{
          name: 'output_result',
          description: 'Output the structured analysis result exactly as specified.',
          input_schema: geminiSchemaToAnthropicSchema(outputSchema) as Anthropic.Tool['input_schema'],
        }],
        tool_choice: { type: 'tool', name: 'output_result' },
      });
      const toolUse = response.content.find(b => b.type === 'tool_use');
      result = JSON.stringify(toolUse && 'input' in toolUse ? (toolUse as { input: unknown }).input : {});
    } else {
      const response = await client.messages.create({
        model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      result = response.content[0].type === 'text' ? response.content[0].text : '';
    }

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
