import { NextRequest, NextResponse } from 'next/server';

const responseBody = {
    error: 'Credentials are configured only in the local agent.',
    code: 'LOCAL_AGENT_CONFIGURATION_REQUIRED',
} as const;

function localAgentOnlyResponse() {
    return NextResponse.json(responseBody, {
        status: 410,
        headers: { 'Cache-Control': 'no-store' },
    });
}

// SaaS processes must never read or persist automation credentials. All methods
// deliberately fail closed and direct callers to the local agent instead.
export async function GET() {
    return localAgentOnlyResponse();
}

export async function POST(_request?: NextRequest) {
    return localAgentOnlyResponse();
}

export async function DELETE(_request?: NextRequest) {
    return localAgentOnlyResponse();
}
