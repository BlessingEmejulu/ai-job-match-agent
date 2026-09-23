import { AccessForm } from '@/components/AccessForm';
import { LiveRunner } from '@/components/LiveRunner';
import { liveEnabled } from '@/lib/config';
import { currentSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function LivePage() {
    const enabled = liveEnabled();
    const session = enabled.ok ? await currentSession() : null;

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-semibold">Live run</h1>
            <p className="max-w-3xl text-sm text-slate-700">
                Starts a real, small run of the AI Job Match Agent on Apify (up to a few minutes). Results come straight from the employers&apos; boards at run time.
            </p>
            {!enabled.ok ? (
                <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    Live runs are not configured on this deployment. The site owner needs to set: {enabled.missing.join(', ')}.
                </p>
            ) : session ? (
                <LiveRunner />
            ) : (
                <AccessForm />
            )}
        </div>
    );
}
