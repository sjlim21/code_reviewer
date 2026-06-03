import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-requested-with, content-type, x-hub-signature-256',
}

async function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const expected = 'sha256=' + Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('')
  return signature === expected
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.text()
    const signature = req.headers.get('x-hub-signature-256') ?? ''
    const event = req.headers.get('x-github-event') ?? 'push'

    if (!['push', 'pull_request'].includes(event)) {
      return new Response(JSON.stringify({ message: 'Event ignored' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = JSON.parse(body)
    const projectId = payload.project_id as string | undefined

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'project_id required in payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: project, error } = await supabase
      .from('projects')
      .select('id, name, webhook_secret')
      .eq('id', projectId)
      .single()

    if (error || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (project.webhook_secret && signature) {
      const valid = await verifyGitHubSignature(body, signature, project.webhook_secret)
      if (!valid) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const { data: run, error: runError } = await supabase
      .from('analysis_runs')
      .insert({
        project_id: projectId,
        status: 'pending',
        trigger_type: 'ci',
        source_type: 'github',
        total_files: 0,
        analyzed_files: 0,
        issues_found: 0,
      })
      .select()
      .single()

    if (runError) {
      return new Response(JSON.stringify({ error: 'Failed to create analysis run' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        message: 'Analysis run created',
        run_id: run.id,
        project: project.name,
        commit: payload.after ?? payload.pull_request?.head?.sha ?? 'unknown',
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
