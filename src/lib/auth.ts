/** Normalizes the only profile field collected during signup. */
export function normalizeSignupName(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized.length > 0 ? normalized : null
}

/** Only allow internal, absolute paths after an auth callback. */
export function sanitizeAuthNext(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  try {
    const decoded = decodeURIComponent(value)
    if (decoded.includes('\\') || decoded.startsWith('//')) return '/dashboard'
  } catch {
    return '/dashboard'
  }
  return value
}

export type AuthCallbackFlow = 'pkce' | 'token_hash'

/** Recovery cookies are only issued after the matching callback flow has succeeded. */
export function shouldIssueRecoveryMarker(input: { flow: AuthCallbackFlow; successful: boolean; next: string; type?: string | null; hasRecoveryPreflight?: boolean }): boolean {
  if (!input.successful || input.next !== '/reset-password') return false
  return input.flow === 'pkce'
    ? input.hasRecoveryPreflight === true
    : input.type === 'recovery'
}
