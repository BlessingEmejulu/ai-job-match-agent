import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import Link from 'next/link';

import './globals.css';

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
    title: 'AI Job Match Agent — opportunities for African early-career talent',
    description:
        'Find jobs and internships on verified employer boards, see whether applicants in your country can apply, and understand how well each role matches your skills.',
};

export const viewport: Viewport = { themeColor: '#f6f2ea' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
    return (
        <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
            <body className="min-h-screen bg-ivory font-sans text-ink antialiased">
                <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:shadow-soft">
                    Skip to content
                </a>
                <header className="sticky top-0 z-40 border-b border-line/70 bg-ivory/85 backdrop-blur supports-[backdrop-filter]:bg-ivory/70">
                    <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
                        <Link href="/" className="group flex items-center gap-2.5">
                            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG mark, no optimisation needed */}
                            <img src="/brand/logo.svg" alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-[10px] shadow-soft transition group-hover:scale-[1.04]" />
                            <span className="font-display text-xl tracking-tight text-forest-deep">AI Job Match</span>
                            <span className="hidden text-[11px] font-medium uppercase tracking-[0.22em] text-gold sm:inline">Agent</span>
                        </Link>
                        <ul className="flex items-center gap-1 text-sm sm:gap-2">
                            <li>
                                <Link href="/" className="rounded-full px-3 py-1.5 text-ink-soft transition hover:bg-paper hover:text-ink">
                                    Showcase
                                </Link>
                            </li>
                            <li>
                                <Link href="/live" className="rounded-full bg-forest px-4 py-1.5 font-medium text-paper transition hover:bg-forest-deep">
                                    Live run
                                </Link>
                            </li>
                            <li className="hidden sm:block">
                                <a href="https://github.com/BlessingEmejulu/ai-job-match-agent" className="rounded-full px-3 py-1.5 text-ink-soft transition hover:bg-paper hover:text-ink">
                                    Source
                                </a>
                            </li>
                        </ul>
                    </nav>
                </header>

                <main id="main" className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 sm:pt-16">
                    {children}
                </main>

                <footer className="border-t border-line/70 bg-paper/60">
                    <div className="mx-auto grid max-w-6xl gap-6 px-5 py-12 text-sm text-muted sm:grid-cols-[1fr_2fr] sm:px-8">
                        <p className="font-display text-lg text-ink">AI Job Match Agent</p>
                        <p className="leading-relaxed">
                            Listings come from employers&apos; public Greenhouse and Lever job boards; always apply on the employer&apos;s own page. Eligibility labels describe what a posting says about location — they are not legal advice and do not confirm work authorization. Match scores describe relevance to the posting, not hiring chances.
                        </p>
                    </div>
                </footer>
            </body>
        </html>
    );
}
