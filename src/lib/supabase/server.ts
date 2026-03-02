import { createServerClient, type CookieMethodsServer } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getCookieMethods(): CookieMethodsServer {
  return {
    async getAll() {
      const cookieStore = await cookies()
      return cookieStore.getAll()
    },
    async setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
      try {
        const cookieStore = await cookies()
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
        )
      } catch {
        // Server Component에서 쿠키 설정 무시
      }
    },
  }
}

export async function createClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: getCookieMethods() }
  )
}

export async function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: getCookieMethods() }
  )
}
