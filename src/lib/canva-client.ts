const CANVA_API = 'https://api.canva.com/rest/v1'

export interface CanvaToken {
  access_token: string
  refresh_token: string
  expires_at: number // epoch ms
  token_type: string
}

export interface CanvaAutofillData {
  [fieldName: string]: { type: 'text'; text: string } | { type: 'image'; asset_id: string }
}

export class CanvaClient {
  constructor(private accessToken: string) {}

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${CANVA_API}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Canva API ${path} failed (${res.status}): ${err}`)
    }
    return res.json() as Promise<T>
  }

  /**
   * 이미지 URL을 Canva Assets에 업로드 → asset_id 반환
   */
  async uploadAsset(imageUrl: string, name: string): Promise<string> {
    // 1. 이미지 데이터 가져오기
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imageUrl}`)
    const buffer = await imgRes.arrayBuffer()
    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'

    // 2. Canva Asset Upload (multipart)
    const form = new FormData()
    form.append('name', name)
    form.append('asset', new Blob([buffer], { type: contentType }), `${name}.jpg`)

    const res = await fetch(`${CANVA_API}/assets`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.accessToken}` },
      body: form,
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Canva asset upload failed (${res.status}): ${err}`)
    }
    const data = await res.json() as { asset: { id: string } }
    return data.asset.id
  }

  /**
   * Brand Template에 데이터를 채워 디자인 생성 → job_id 반환
   */
  async createAutofillJob(templateId: string, data: CanvaAutofillData): Promise<string> {
    const body = await this.request<{ job: { id: string } }>('/autofills', {
      method: 'POST',
      body: JSON.stringify({ brand_template_id: templateId, data }),
    })
    return body.job.id
  }

  /**
   * autofill job 폴링 → design_id 반환 (최대 60초)
   */
  async pollAutofillJob(jobId: string, maxWaitMs = 60_000): Promise<string> {
    const start = Date.now()
    while (Date.now() - start < maxWaitMs) {
      const data = await this.request<{
        job: { status: 'in_progress' | 'success' | 'failed'; result?: { design: { id: string } }; error?: { message: string } }
      }>(`/autofills/${jobId}`)

      if (data.job.status === 'success') {
        const designId = data.job.result?.design?.id
        if (!designId) throw new Error('Autofill succeeded but no design ID returned')
        return designId
      }
      if (data.job.status === 'failed') {
        throw new Error(`Autofill job failed: ${data.job.error?.message ?? 'unknown'}`)
      }
      // in_progress → 3초 대기
      await new Promise(r => setTimeout(r, 3000))
    }
    throw new Error('Autofill job timed out')
  }

  /**
   * 디자인을 PNG로 export → export job 폴링 → 다운로드 URL 반환
   */
  async exportDesign(designId: string, format: 'png' | 'pdf' = 'png'): Promise<string> {
    // export job 시작
    const exportRes = await this.request<{ job: { id: string } }>('/exports', {
      method: 'POST',
      body: JSON.stringify({ design_id: designId, format }),
    })
    const exportJobId = exportRes.job.id

    // 폴링
    const start = Date.now()
    while (Date.now() - start < 60_000) {
      const data = await this.request<{
        job: { status: 'in_progress' | 'success' | 'failed'; urls?: string[]; error?: { message: string } }
      }>(`/exports/${exportJobId}`)

      if (data.job.status === 'success') {
        const url = data.job.urls?.[0]
        if (!url) throw new Error('Export succeeded but no URL returned')
        return url
      }
      if (data.job.status === 'failed') {
        throw new Error(`Export job failed: ${data.job.error?.message ?? 'unknown'}`)
      }
      await new Promise(r => setTimeout(r, 3000))
    }
    throw new Error('Export job timed out')
  }
}

/**
 * Canva OAuth token 갱신
 */
export async function refreshCanvaToken(refreshToken: string): Promise<CanvaToken> {
  const res = await fetch('https://api.canva.com/rest/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.CANVA_CLIENT_ID!,
      client_secret: process.env.CANVA_CLIENT_SECRET!,
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number; token_type: string }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type,
  }
}

/**
 * Canva templates 환경변수 맵
 */
export const CANVA_TEMPLATES = {
  cover:       process.env.CANVA_TEMPLATE_COVER ?? '',
  location:    process.env.CANVA_TEMPLATE_LOCATION ?? '',
  composition: process.env.CANVA_TEMPLATE_COMPOSITION ?? '',
  investment:  process.env.CANVA_TEMPLATE_INVESTMENT ?? '',
  interior:    process.env.CANVA_TEMPLATE_INTERIOR ?? '',
  cta:         process.env.CANVA_TEMPLATE_CTA ?? '',
} as const

export type CanvaTemplateKey = keyof typeof CANVA_TEMPLATES
