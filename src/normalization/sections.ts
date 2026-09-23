import type { TextBlock } from './text.js';

export type SectionKind = 'required' | 'preferred' | 'responsibilities' | 'about' | 'benefits' | 'other';

export interface ClassifiedLine {
    text: string;
    section: SectionKind;
    /** Heading under which the line appeared, when there was one. */
    heading: string | null;
}

const HEADING_RULES: [SectionKind, RegExp][] = [
    // Order matters: "preferred qualifications" must win over "qualifications".
    ['preferred', /nice[- ]to[- ]have|preferred|bonus|desirable|good to have|plus(es)?\b|advantage|would be great|extra credit|ideally/i],
    [
        'required',
        /requirement|qualification|what you('ll)? (need|bring)|must[- ]have|you (have|bring|are)|skills|who you are|about you|what we('re| are) looking for|you should have|competenc|experience|ideal candidate|to be successful|what it takes/i,
    ],
    ['responsibilities', /responsibilit|what you('ll)? do|the role|day[- ]to[- ]day|your (impact|mission)|in this role|key (duties|tasks)|duties|you will/i],
    ['benefits', /benefit|perks|what we offer|why (join|work)|compensation|we offer|package/i],
    ['about', /^about\b|who we are|our (mission|story|values)|company overview|equal opportunity|diversity/i],
];

/** Line-level phrases that mark an item as preferred even under a "Requirements" heading. */
export const PREFERRED_LINE = /\b(nice[- ]to[- ]have|preferred|is a (big )?plus|are a plus|a plus\b|bonus|desirable|advantageous|an advantage|ideally|good to have|would be (great|nice))\b/i;

export function classifyHeading(heading: string): SectionKind {
    for (const [kind, re] of HEADING_RULES) if (re.test(heading)) return kind;
    return 'other';
}

/**
 * Assign every text block to a section. Lines keep their heading so evidence can cite it.
 * Unknown headings map to "other"; nothing is guessed as "required" without a heading signal.
 */
export function classifyBlocks(blocks: TextBlock[]): ClassifiedLine[] {
    const out: ClassifiedLine[] = [];
    let current: SectionKind = 'other';
    let heading: string | null = null;
    for (const block of blocks) {
        if (block.type === 'heading') {
            heading = block.text;
            current = classifyHeading(block.text);
            continue;
        }
        let section = current;
        if ((section === 'required' || section === 'other') && PREFERRED_LINE.test(block.text)) section = 'preferred';
        out.push({ text: block.text, section, heading });
    }
    return out;
}

/** Lever gives explicit lists with their own titles; map them the same way. */
export function classifyNamedLists(lists: { title: string; items: string[] }[]): ClassifiedLine[] {
    const out: ClassifiedLine[] = [];
    for (const list of lists) {
        const kind = classifyHeading(list.title);
        for (const item of list.items) {
            let section = kind;
            if ((section === 'required' || section === 'other') && PREFERRED_LINE.test(item)) section = 'preferred';
            out.push({ text: item, section, heading: list.title });
        }
    }
    return out;
}
