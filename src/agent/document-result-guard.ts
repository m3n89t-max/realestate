// 서류 수집 작업의 "거짓 성공" 방지 경계.
// worker.ts 와 분리해 Electron 네이티브 의존성 없이 테스트할 수 있게 한다.

export const DOCUMENT_TASK_TYPES = new Set([
    'building_register',
    'download_building_register',
    'download_cadastral_map',
]);

/**
 * 서류 작업은 서버가 실제로 저장한 document_id 를 돌려준 경우에만 완료 보고할 수 있다.
 * 에이전트는 Storage/DB 에 직접 쓰지 않으므로, 이 값이 없으면 저장이 일어나지 않았다는 뜻이다.
 */
export function requireSavedDocumentResult(
    taskType: string,
    result: Record<string, unknown>
): void {
    if (!DOCUMENT_TASK_TYPES.has(taskType)) return;
    const documentId = result?.document_id;
    if (typeof documentId !== 'string' || documentId.length === 0) {
        throw new Error('[UPLOAD_FAILED] 서버에서 저장된 문서를 확인하지 못했습니다.');
    }
}
