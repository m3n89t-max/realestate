import { AgentConfig } from './config';

// ============================================================
// Webhook Client — agent-protocol.md 준수
// ============================================================

const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000];

async function sendWebhook(config: AgentConfig, payload: Record<string, unknown>): Promise<any> {
    // 서버가 Authorization 전환을 완료할 때까지 body agent_key도 유지한다.
    const body = { ...payload, agent_key: config.agent_key };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(config.webhook_url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.agent_key}`,
                },
                body: JSON.stringify(body),
                redirect: 'manual',
            });
            if (res.status >= 300 && res.status < 400) {
                throw new Error('[HTTP_REDIRECT] 웹훅 redirect를 거부했습니다.');
            }

            if (!res.ok && res.status >= 500 && attempt < MAX_RETRIES) {
                console.warn(`[Webhook] 서버 오류 ${res.status}, ${attempt + 1}차 재시도...`);
                await sleep(BACKOFF_MS[attempt]);
                continue;
            }

            const responseBody = await res.json().catch(() => ({})) as Record<string, unknown>;
            if (!res.ok) {
                const message = typeof responseBody.error === 'string'
                    ? responseBody.error
                    : `웹훅 요청 실패 (${res.status})`;
                throw new Error(`[HTTP_${res.status}] ${message}`);
            }
            if (typeof responseBody.error === 'string') {
                throw new Error(responseBody.error);
            }
            return responseBody;
        } catch (err: any) {
            if (typeof err?.message === 'string' && err.message.startsWith('[HTTP_4')) {
                throw err;
            }
            if (attempt < MAX_RETRIES) {
                console.warn(`[Webhook] 네트워크 오류, ${attempt + 1}차 재시도: ${err.message}`);
                await sleep(BACKOFF_MS[attempt]);
            } else {
                console.error(`[Webhook] 최종 실패: ${err.message}`);
                throw err;
            }
        }
    }
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// Event Helpers
// ============================================================

export async function sendHeartbeat(config: AgentConfig, status: 'online' | 'busy' | 'offline') {
    return sendWebhook(config, {
        event: 'heartbeat',
        status,
        version: config.version,
    });
}

export async function sendTaskStarted(config: AgentConfig, taskId: string) {
    return sendWebhook(config, {
        event: 'task_started',
        task_id: taskId,
    });
}

export async function sendTaskProgress(
    config: AgentConfig,
    taskId: string,
    message: string,
    level: 'info' | 'warn' | 'error' = 'info',
    progressPct?: number
) {
    return sendWebhook(config, {
        event: 'task_progress',
        task_id: taskId,
        message,
        level,
        progress_pct: progressPct,
    });
}

export async function sendTaskCompleted(config: AgentConfig, taskId: string, result: Record<string, unknown>) {
    return sendWebhook(config, {
        event: 'task_completed',
        task_id: taskId,
        result,
    });
}

export async function sendTaskFailed(
    config: AgentConfig,
    taskId: string,
    errorCode: string,
    errorMessage: string,
    retry: boolean = true
) {
    return sendWebhook(config, {
        event: 'task_failed',
        task_id: taskId,
        error_code: errorCode,
        error_message: errorMessage,
        retry,
    });
}

export async function updateContent(config: AgentConfig, contentId: string, updates: Record<string, unknown>): Promise<void> {
    await sendWebhook(config, { event: 'update_content', content_id: contentId, updates });
}

export async function getContent(config: AgentConfig, contentId: string): Promise<any> {
    const res = await sendWebhook(config, { event: 'get_content', content_id: contentId });
    if (!res?.content) throw new Error(`[SEARCH_NOT_FOUND] 콘텐츠 없음: ${contentId}`);
    return res.content;
}

export async function getAssets(config: AgentConfig, projectId: string): Promise<any[]> {
    const res = await sendWebhook(config, { event: 'get_assets', project_id: projectId });
    return res?.assets ?? [];
}

export async function getPendingTasks(config: AgentConfig): Promise<any[]> {
    const res = await sendWebhook(config, { event: 'get_pending_tasks' });
    return res?.tasks ?? [];
}

export async function claimTaskViaWebhook(config: AgentConfig, taskId: string): Promise<boolean> {
    const res = await sendWebhook(config, { event: 'claim_task', task_id: taskId });
    return res?.claimed === true;
}

export interface SaveDocumentInput {
    taskId: string;
    projectId: string;
    documentType: 'building_register' | 'cadastral_map';
    fileName?: string;
    contentType?: 'image/png';
    fileBase64?: string;
    rawData?: Record<string, unknown>;
    summary?: string;
}

export async function saveDocument(
    config: AgentConfig,
    input: SaveDocumentInput
): Promise<{ document_id: string }> {
    const response = await sendWebhook(config, {
        event: 'save_document',
        task_id: input.taskId,
        project_id: input.projectId,
        document_type: input.documentType,
        file_name: input.fileName,
        content_type: input.contentType,
        file_base64: input.fileBase64,
        raw_data: input.rawData,
        summary: input.summary,
    });
    if (typeof response?.document_id !== 'string' || !response.document_id) {
        throw new Error('[UPLOAD_FAILED] 서버가 저장된 문서를 확인하지 못했습니다.');
    }
    return { document_id: response.document_id };
}
