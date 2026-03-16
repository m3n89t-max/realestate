import { AgentConfig } from './config';

// ============================================================
// Webhook Client — agent-protocol.md 준수
// ============================================================

const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000];

async function sendWebhook(config: AgentConfig, payload: Record<string, unknown>): Promise<any> {
    const body = { ...payload, agent_key: config.agent_key };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(config.webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok && res.status >= 500 && attempt < MAX_RETRIES) {
                console.warn(`[Webhook] 서버 오류 ${res.status}, ${attempt + 1}차 재시도...`);
                await sleep(BACKOFF_MS[attempt]);
                continue;
            }

            return await res.json();
        } catch (err: any) {
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

export async function getPendingTasks(config: AgentConfig): Promise<any[]> {
    const res = await sendWebhook(config, { event: 'get_pending_tasks' });
    return res?.tasks ?? [];
}

export async function claimTaskViaWebhook(config: AgentConfig, taskId: string): Promise<boolean> {
    const res = await sendWebhook(config, { event: 'claim_task', task_id: taskId });
    return res?.claimed === true;
}

export async function sendDocumentUploaded(
    config: AgentConfig,
    projectId: string,
    documentType: string,
    fileUrl: string,
    fileName: string,
    rawText?: string
) {
    return sendWebhook(config, {
        event: 'document_uploaded',
        project_id: projectId,
        document_type: documentType,
        file_url: fileUrl,
        file_name: fileName,
        raw_text: rawText || '',
    });
}
