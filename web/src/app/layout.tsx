import type { Metadata } from 'next';
import Link from 'next/link';

import './globals.css';

export const metadata: Metadata = {
    title: 'AI Job Match Agent — opportunities for African early-career talent',
    description:
        'Find jobs and internships on verified employer boards, see whether applicants in your country can apply, and understand how well each role matches your skills.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
    return (
        <html lang="en">
            <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
                <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-white focus:px-3 focus:py-2">
                    Skip to content
                </a>
                <header className="border-b border-slate-200 bg-white">
                    <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
                        <Link href="/" className="font-semibold text-teal-900">
                            AI Job Match Agent
                        </Link>
                        <ul className="flex gap-4 text-sm">
                            <li>
                                <Link href="/" className="hover:underline">
                                    Showcase
                                </Link>
                            </li>
                            <li>
                                <Link href="/live" className="hover:underline">
                                    Live run
                                </Link>
                            </li>
                            <li>
                                <a href="https://github.com/BlessingEmejulu/ai-job-match-agent" className="hover:underline">
                                    Source
                                </a>
                            </li>
                        </ul>
                    </nav>
                </header>
                <main id="main" className="mx-auto max-w-6xl px-4 py-6">
                    {children}
                </main>
                <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-slate-600">
                    Listings come from employers&apos; public Greenhouse and Lever job boards. Always apply on the employer&apos;s own page. Eligibility labels describe what the posting says about location; they are not legal advice and do not confirm work authorization. Match scores describe relevance, not hiring chances.
                </footer>
            </body>
        </html>
    );
}
