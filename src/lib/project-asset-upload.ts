export type UploadableFile = Pick<File, 'name' | 'size' | 'type'>

export type AssetUploadResult = { file: File; success: boolean; error?: string; retryable?: boolean }

export interface ProjectAssetUploadOperations {
  makePath(file: File): string
  upload(path: string, file: File): Promise<boolean>
  publicUrl(path: string): string
  registerAsset(input: { file: File; url: string }): Promise<{ assetId: string; isCover: boolean } | null>
  deleteStorage(path: string): Promise<boolean>
}

const uploadFailure = '파일을 올리지 못했습니다.'
const cleanupFailure = '파일 정보를 저장하지 못했고 업로드 파일도 정리하지 못했습니다. 매물 상세에서 확인해 주세요.'

/** Uploads in selection order. The database RPC atomically chooses the first cover. */
export async function uploadProjectAssets(
  files: File[],
  operations: ProjectAssetUploadOperations,
): Promise<AssetUploadResult[]> {
  const results: AssetUploadResult[] = []

  for (const file of files) {
    let path = ''
    let url = ''
    let stored = false
    try {
      path = operations.makePath(file)
      if (!await operations.upload(path, file)) {
        results.push({ file, success: false, error: uploadFailure })
        continue
      }
      stored = true

      url = operations.publicUrl(path)
      // The RPC allocates the next project-wide order while holding the project lock.
      const registered = await operations.registerAsset({ file, url })
      if (!registered) {
        const removed = await operations.deleteStorage(path).catch(() => false)
        results.push({ file, success: false, error: removed ? '파일 정보를 저장하지 못했습니다.' : cleanupFailure, retryable: removed })
        continue
      }
      results.push({ file, success: true })
    } catch {
      // Every input receives a result, including unexpected network/client exceptions.
      const cleaned = stored && path ? await operations.deleteStorage(path).catch(() => false) : true
      results.push({ file, success: false, error: cleaned ? uploadFailure : cleanupFailure, retryable: cleaned })
    }
  }

  return results
}
