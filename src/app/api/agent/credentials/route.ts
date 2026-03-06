import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ============================================================
// 로컬 자격증명 저장 경로 (서버에 저장 안 함)
// %APPDATA%/RealEstateAIOS/credentials.json
// ============================================================

export interface PlatformCredential {
    id?: string;
    email?: string;
    pw: string;
    saved_at: string;
}

export interface CredentialsStore {
    naver?: PlatformCredential;
    google?: PlatformCredential;
    instagram?: PlatformCredential;
    kakao?: PlatformCredential;
    [key: string]: PlatformCredential | undefined;
}

function getCredentialsPath(): string {
    const appDataPath = process.env.APPDATA
        || path.join(os.homedir(), 'AppData', 'Roaming');
    const dir = path.join(appDataPath, 'RealEstateAIOS');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'credentials.json');
}

function readCredentials(): CredentialsStore {
    const filePath = getCredentialsPath();
    if (!fs.existsSync(filePath)) return {};
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
        return {};
    }
}

function writeCredentials(store: CredentialsStore): void {
    fs.writeFileSync(getCredentialsPath(), JSON.stringify(store, null, 2), 'utf-8');
}

// 비밀번호 마스킹 (앞 2자리만 보임)
function mask(value: string | undefined): string {
    if (!value) return '';
    if (value.length <= 2) return '**';
    return value.slice(0, 2) + '*'.repeat(Math.min(value.length - 2, 6));
}

// ============================================================
// GET — 저장된 플랫폼 목록 (값 마스킹)
// ============================================================
export async function GET() {
    const store = readCredentials();

    const masked: Record<string, { id?: string; email?: string; pw_masked: string; saved_at: string; has_creds: boolean }> = {};

    for (const [platform, cred] of Object.entries(store)) {
        if (!cred) continue;
        masked[platform] = {
            id: cred.id ? mask(cred.id) : undefined,
            email: cred.email ? mask(cred.email) : undefined,
            pw_masked: mask(cred.pw),
            saved_at: cred.saved_at,
            has_creds: true,
        };
    }

    return NextResponse.json({ data: masked });
}

// ============================================================
// POST — 자격증명 저장
// Body: { platform: 'naver' | 'google' | 'instagram' | 'kakao', id?, email?, pw }
// ============================================================
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { platform, id, email, pw } = body;

        if (!platform || !pw) {
            return NextResponse.json({ error: 'platform과 pw는 필수입니다.' }, { status: 400 });
        }

        const store = readCredentials();
        store[platform] = {
            id,
            email,
            pw,
            saved_at: new Date().toISOString(),
        };
        writeCredentials(store);

        return NextResponse.json({ success: true, platform });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// ============================================================
// DELETE — 특정 플랫폼 자격증명 삭제
// Body: { platform: 'naver' | ... }
// ============================================================
export async function DELETE(req: NextRequest) {
    try {
        const body = await req.json();
        const { platform } = body;

        if (!platform) {
            return NextResponse.json({ error: 'platform이 필요합니다.' }, { status: 400 });
        }

        const store = readCredentials();
        delete store[platform];
        writeCredentials(store);

        return NextResponse.json({ success: true, platform });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
