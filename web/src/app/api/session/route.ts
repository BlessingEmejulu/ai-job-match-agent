import { cookies } from 'next/headers';

import { liveConfig, liveEnabled, sameOrigin, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/config';
import { getCounterStore } from '@/lib/ratelimit';
import { newSession, safeEqual, sign } from '@/lib/signing';

export async function POST(request: Request) {
    if (!liveEnabled().ok) return Response.json({ error: 'Live runs are not configured on this deployment.' }, { status: 503 });
    if (!sameOrigin(request)) return Response.json({ error: 'Cross-origin request refused.' }, { status: 403 });
    const store = getCounterStore();
    if (!store) return Response.json({ error: 'Rate limiting is not configured; live runs are disabled.' }, { status: 503 });

    const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]!.trim().slice(0, 64);
    if ((await store.incr(`login:${ip}`, 3600)) > 10) return Response.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });

    const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
    const code = typeof body?.code === 'string' ? body.code.slice(0, 200) : '';
    const cfg = liveConfig();
    if (!safeEqual(code, cfg.accessCode)) return Response.json({ error: 'Incorrect access code.' }, { status: 401 });

    const session = newSession(SESSION_TTL_SECONDS);
    (await cookies()).set(SESSION_COOKIE, sign(session, cfg.sessionSecret), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: SESSION_TTL_SECONDS,
    });
    return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
    if (!sameOrigin(request)) return Response.json({ error: 'Cross-origin request refused.' }, { status: 403 });
    (await cookies()).delete(SESSION_COOKIE);
    return Response.json({ ok: true });
}
