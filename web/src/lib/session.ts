import 'server-only';

import { cookies } from 'next/headers';

import { liveConfig, SESSION_COOKIE } from './config';
import { type SessionData, verifySession } from './signing';

export async function currentSession(): Promise<SessionData | null> {
    const cfg = liveConfig();
    if (cfg.sessionSecret.length < 32) return null;
    return verifySession((await cookies()).get(SESSION_COOKIE)?.value, cfg.sessionSecret);
}
