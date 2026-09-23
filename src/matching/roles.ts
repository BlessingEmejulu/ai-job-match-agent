/** Title/role token handling shared by the Decide filter and the role-alignment score. */

const STOP = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'in', 'for', 'to', 'with', 'at', '-', '&', 'i', 'ii', 'iii', 'remote', 'hybrid']);

const EQUIV: Record<string, string> = {
    developer: 'engineer',
    dev: 'engineer',
    programmer: 'engineer',
    swe: 'engineer',
    engineering: 'engineer',
    analytics: 'analyst',
    analysis: 'analyst',
    designer: 'design',
    ui: 'design',
    ux: 'design',
    'front-end': 'frontend',
    'back-end': 'backend',
    'full-stack': 'fullstack',
    internship: 'intern',
    graduates: 'graduate',
    mgr: 'manager',
    ml: 'machine-learning',
};

export function roleTokens(text: string): string[] {
    const normalized = text
        .toLowerCase()
        .replace(/front[\s-]end/g, 'frontend')
        .replace(/back[\s-]end/g, 'backend')
        .replace(/full[\s-]stack/g, 'fullstack')
        .replace(/machine learning/g, 'machine-learning')
        .replace(/[^a-z0-9+#.\-\s]/g, ' ');
    return normalized
        .split(/\s+/)
        .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ''))
        .filter((t) => t && !STOP.has(t))
        .map((t) => EQUIV[t] ?? (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
        .map((t) => EQUIV[t] ?? t);
}

/** Fraction of the phrase's tokens present in the target text (0..1). */
export function phraseCoverage(phrase: string, target: string): number {
    const p = [...new Set(roleTokens(phrase))];
    if (!p.length) return 0;
    const t = new Set(roleTokens(target));
    return p.filter((x) => t.has(x)).length / p.length;
}

const SENIORITY_WORDS = new Set(['senior', 'sr', 'snr', 'junior', 'jr', 'lead', 'principal', 'staff', 'head', 'associate', 'entry', 'level']);

/**
 * Two-way role alignment: 70% how much of the desired role appears in the title, 30% how much of
 * the title's role words (seniority words excluded) the desired role explains. A one-word desired
 * role therefore cannot fully "match" a long, different title.
 */
export function roleAlignment(desired: string, title: string): number {
    const d = new Set(roleTokens(desired));
    const t = new Set(roleTokens(title).filter((x) => !SENIORITY_WORDS.has(x)));
    if (!d.size || !t.size) return 0;
    const overlap = [...d].filter((x) => t.has(x)).length;
    return 0.7 * (overlap / d.size) + 0.3 * (overlap / t.size);
}

/** A keyword matches when every one of its tokens appears in the title/department. */
export function keywordMatches(keyword: string, title: string, department: string | null): boolean {
    return phraseCoverage(keyword, `${title} ${department ?? ''}`) === 1;
}
