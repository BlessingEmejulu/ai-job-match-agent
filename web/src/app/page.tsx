import Link from 'next/link';

import { OpportunityExplorer } from '@/components/OpportunityExplorer';
import { loadShowcase } from '@/lib/showcase';

export const revalidate = 3600;

function fmt(iso: string | null) {
    return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC' : 'an unknown date';
}

const PILLARS = [
    { title: 'Can you apply from here?', body: '“Remote – US”, “Home based – EMEA” and “Lagos, hybrid” mean different things. Each role says whether your country is included — and quotes the line that decided it.' },
    { title: 'What is truly required', body: 'Required, preferred and “any one of” skills are separated, so optional extras never count against you.' },
    { title: 'What to confirm first', body: 'Unknowns stay unknown. You see exactly which questions to put to the recruiter before you spend an evening on an application.' },
];

export default async function Home() {
    const showcase = await loadShowcase();
    const items = showcase.items;
    const stats = [
        { value: items.length, label: 'opportunities in this snapshot' },
        { value: new Set(items.map((i) => i.company)).size, label: 'employers represented' },
        { value: items.filter((i) => i.earlyCareerFit === 'suitable').length, label: 'early-career friendly roles' },
        { value: items.filter((i) => i.eligibility === 'explicitly_supported').length, label: 'with location evidence that fits' },
    ];

    return (
        <div className="space-y-20 sm:space-y-28">
            <section className="grid gap-12 lg:grid-cols-[1.25fr_1fr] lg:items-end">
                <div className="space-y-7">
                    <p className="text-xs font-medium uppercase tracking-[0.28em] text-gold">For African students, graduates &amp; early-career talent</p>
                    <h1 className="font-display text-[2.6rem] leading-[1.05] tracking-tight text-forest-deep sm:text-6xl">
                        Opportunities you can <em className="font-normal italic text-gold">actually</em> apply for.
                    </h1>
                    <p className="max-w-xl text-lg leading-relaxed text-ink-soft">
                        Live jobs and internships from verified employer boards — with honest location eligibility, the skills that are truly required, and what to confirm before you apply.
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                        <Link href="/live" className="rounded-full bg-forest px-6 py-3 text-sm font-medium text-paper shadow-soft transition hover:bg-forest-deep hover:shadow-lift">
                            Start a live search
                        </Link>
                        <a href="#showcase" className="rounded-full border border-line-strong px-6 py-3 text-sm font-medium text-ink transition hover:border-ink hover:bg-paper">
                            Browse the showcase
                        </a>
                    </div>
                </div>

                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line shadow-soft">
                    {stats.map((s) => (
                        <div key={s.label} className="bg-paper p-6 sm:p-7">
                            <dt className="text-xs leading-snug text-muted">{s.label}</dt>
                            <dd className="mt-3 font-display text-4xl text-forest-deep">{s.value}</dd>
                        </div>
                    ))}
                </dl>
            </section>

            <section aria-label="What you get" className="grid gap-10 border-y border-line py-12 sm:grid-cols-3 sm:gap-12">
                {PILLARS.map((p, i) => (
                    <div key={p.title} className="space-y-3">
                        <p className="font-display text-sm text-gold">0{i + 1}</p>
                        <h2 className="font-display text-xl text-ink">{p.title}</h2>
                        <p className="text-sm leading-relaxed text-muted">{p.body}</p>
                    </div>
                ))}
            </section>

            <section id="showcase" aria-labelledby="showcase-heading" className="scroll-mt-24 space-y-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-3">
                        <p className="text-xs font-medium uppercase tracking-[0.28em] text-gold">Showcase</p>
                        <h2 id="showcase-heading" className="font-display text-3xl tracking-tight text-forest-deep sm:text-4xl">
                            A recent search, ready to explore
                        </h2>
                    </div>
                    <p className="max-w-md text-sm leading-relaxed text-muted">
                        {showcase.provenance}, collected {fmt(showcase.runAt)}. <strong className="font-medium text-ink">Not a live search</strong> — postings may have changed or closed. Check the employer&apos;s page before applying.
                    </p>
                </div>
                {items.length ? (
                    <OpportunityExplorer items={items} />
                ) : (
                    <p className="rounded-3xl border border-dashed border-line-strong bg-paper p-12 text-center text-muted">No showcase results are available.</p>
                )}
            </section>
        </div>
    );
}
