// Standard Response Envelope Helper - Deno/ESM compatible

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export interface ApiMeta {
  timestamp: string
  task_id?: string
  org_id?: string
  version?: string
}

export interface ApiResponse<T = unknown> {
  data: T | null
  error: string | null
  meta: ApiMeta
}

export function ok<T>(data: T, meta?: Partial<ApiMeta>): Response {
  const body: ApiResponse<T> = {
    data,
    error: null,
    meta: { timestamp: new Date().toISOString(), ...meta },
  }
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
}

export function err(message: string, status = 400, meta?: Partial<ApiMeta>): Response {
  const body: ApiResponse = {
    data: null,
    error: message,
    meta: { timestamp: new Date().toISOString(), ...meta },
  }
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}
