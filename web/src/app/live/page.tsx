import { AccessForm } from '@/components/AccessForm';
import { LiveRunner } from '@/components/LiveRunner';
import { liveEnabled } from '@/lib/config';
import { currentSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function LivePage() {
    const enabled = liveEnabled();
    const session = enabled.ok ? await currentSession() : null;

    return (
        <div className="space-y-12">
            <header className="max-w-2xl space-y-4">
                <p className="text-xs font-medium uppercase tracking-[0.28em] text-gold">Live search</p>
                <h1 className="font-display text-4xl leading-tight tracking-tight text-forest-deep sm:text-5xl">Search the boards, right now.</h1>
                <p className="text-lg leading-relaxed text-ink-soft">
                    Runs a small, real search on Apify — usually well under a minute. Results come straight from employers&apos; boards at the moment you search, and you can watch each stage as it happens.
                </p>
            </header>
            {!enabled.ok ? (
                <p role="status" className="rounded-3xl border border-amber-wash bg-amber-wash/60 p-8 text-sm leading-relaxed text-amber-ink">
                    Live searches are not configured on this deployment yet. The site owner needs to set: {enabled.missing.join(', ')}.
                </p>
            ) : session ? (
                <LiveRunner />
            ) : (
                <AccessForm />
            )}
        </div>
    );
}
