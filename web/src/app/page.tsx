import Link from 'next/link';

import { OpportunityExplorer } from '@/components/OpportunityExplorer';
import { loadShowcase } from '@/lib/showcase';

export const revalidate = 3600;

function fmt(iso: string | null) {
    return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC' : 'unknown date';
}

export default async function Home() {
    const showcase = await loadShowcase();

    return (
        <div className="space-y-6">
            <section className="space-y-2">
                <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Find opportunities you can actually apply for</h1>
                <p className="max-w-3xl text-slate-700">
                    For African students, graduates and early-career tech professionals: jobs and internships from verified employer boards, whether applicants in your country are eligible — with the exact wording from the posting — which skills are required versus preferred, and what to confirm before you apply.
                </p>
                <p className="text-sm">
                    <Link href="/live" className="font-medium text-teal-800 underline">
                        Start a live run with your own roles and skills
                    </Link>{' '}
                    (access code required).
                </p>
            </section>

            <section aria-labelledby="showcase-heading" className="space-y-3">
                <div>
                    <h2 id="showcase-heading" className="text-lg font-semibold">
                        Showcase results
                    </h2>
                    <p className="text-sm text-slate-700">
                        {showcase.provenance}, collected {fmt(showcase.runAt)}. This is <strong>not a live search</strong>: postings may have changed or closed since then. Check the employer&apos;s page before applying.
                    </p>
                </div>
                {showcase.items.length ? (
                    <OpportunityExplorer items={showcase.items} />
                ) : (
                    <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">No showcase results are available.</p>
                )}
            </section>
        </div>
    );
}
