export type ProjectDraftPayload = Record<string, unknown>

export type ProjectDraftWrite =
  | { operation: 'insert'; values: ProjectDraftPayload }
  | { operation: 'update'; projectId: string; values: ProjectDraftPayload }

export function buildProjectDraftWrite(
  projectId: string | null,
  values: ProjectDraftPayload,
  identity: { orgId: string; userId: string },
): ProjectDraftWrite {
  if (projectId) return { operation: 'update', projectId, values }
  return {
    operation: 'insert',
    values: { ...values, org_id: identity.orgId, created_by: identity.userId },
  }
}
