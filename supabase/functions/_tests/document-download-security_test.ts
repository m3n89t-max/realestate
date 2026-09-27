const functionFiles = [
  '../download-building-register/index.ts',
  '../download-cadastral-map/index.ts',
]

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

for (const relativePath of functionFiles) {
  Deno.test(`${relativePath} enforces authenticated, tenant-scoped document access`, async () => {
    const source = await Deno.readTextFile(
      new URL(relativePath, import.meta.url),
    )

    assert(
      /from ["']\.\.\/_shared\/document-download-auth\.ts["']/.test(source) &&
        source.includes('authorizeDocumentDownloadRequest('),
      'document download must use the shared user-or-owned-task authorization gate',
    )
    assert(
      /\.eq\(["']org_id["'], orgId\)/.test(source),
      'service-role project/task/document operations must be scoped by org_id',
    )
    assert(
      source.includes('assertNoSupabaseError('),
      'database and storage failures must be checked instead of silently succeeding',
    )
    assert(
      source.includes('markOwnedTaskFailed('),
      'exceptions must mark only the previously verified task as failed',
    )
    assert(
      !source.match(
        /console\.(?:log|warn|error)\([^\n]*(?:wmsUrl|staticUrl|serviceKey|apiKey|vworldKey)/,
      ),
      'logs must not include URLs or values that can contain API keys',
    )
  })
}
