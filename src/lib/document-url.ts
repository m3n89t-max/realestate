export const DOCUMENTS_BUCKET = 'documents'
export const DOCUMENT_SIGNED_URL_TTL_SECONDS = 300

export type SignedUrlCreator = (path: string) => Promise<string | null>

export interface DocumentWithFile {
  file_url?: string | null
  [key: string]: unknown
}

function isStoragePath(value: string): boolean {
  return !/^(https?:|data:|blob:)/i.test(value)
}

/**
 * documents 버킷이 private이므로 저장된 값은 공개 URL이 아니라 객체 경로다.
 * 화면에 내려보내기 전에 짧은 만료의 서명 URL로 바꾸고, 발급 실패는 링크를 숨긴다.
 */
export async function resolveDocumentFileUrls<T extends DocumentWithFile>(
  documents: T[],
  createSignedUrl: SignedUrlCreator,
): Promise<Array<T & { file_url: string | null }>> {
  return Promise.all(
    documents.map(async (document) => {
      const current = typeof document.file_url === 'string' ? document.file_url : null
      if (!current) return { ...document, file_url: null }
      if (!isStoragePath(current)) return { ...document, file_url: current }
      const signed = await createSignedUrl(current)
      return { ...document, file_url: signed ?? null }
    }),
  )
}

export function makeSupabaseSignedUrlCreator(
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>
    }
  },
): SignedUrlCreator {
  return async (path) => {
    const { data, error } = await storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(path, DOCUMENT_SIGNED_URL_TTL_SECONDS)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  }
}
