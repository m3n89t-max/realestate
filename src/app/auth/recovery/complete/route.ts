import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const RECOVERY_MARKER = 'recovery_reset_authorized'

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return new NextResponse(null, { status: 403 })
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  const response = new NextResponse(null, { status: error ? 500 : 204 })
  response.cookies.set(RECOVERY_MARKER, '', { httpOnly: true, sameSite: 'lax', secure: true, path: '/reset-password', maxAge: 0 })
  return response
}
