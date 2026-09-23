import { describe, expect, it } from 'vitest';

import { deadlineStatus, findDeadline, parseHumanDate, toIsoOrNull } from '../src/normalization/dates.js';
import { extractRequirements, extractStudentRequirement } from '../src/normalization/requirements.js';
import { classifyBlocks, type ClassifiedLine } from '../src/normalization/sections.js';
import { canonicalizeSkill, extractSkills } from '../src/normalization/skills.js';
import { cleanText, decodeEntities, htmlToBlocks } from '../src/normalization/text.js';
import { isSafePublicUrl } from '../src/normalization/urls.js';
import { NOW } from './fixtures/builders.js';

const skills = (t: string) => extractSkills(t).map((h) => h.skill);
const lines = (html: string): ClassifiedLine[] => classifyBlocks(htmlToBlocks(html));

describe('skills', () => {
    it('keeps Java and JavaScript apart', () => {
        expect(skills('Strong JavaScript skills')).toEqual(['JavaScript']);
        expect(skills('Java 17 and Spring Boot')).toEqual(['Java', 'Spring Boot']);
        expect(skills('Java, JavaScript')).toEqual(['Java', 'JavaScript']);
    });

    it('keeps React and React Native apart', () => {
        expect(skills('Experience with React Native')).toEqual(['React Native']);
        expect(skills('React and React Native')).toEqual(['React', 'React Native']);
    });

    it('matches ambiguous short names only in list context', () => {
        expect(skills('Python, Go, Rust')).toEqual(['Python', 'Go', 'Rust']);
        expect(skills("Let's go to market")).toEqual([]);
        expect(skills('R&D teams')).toEqual([]);
    });

    it('canonicalizes aliases conservatively', () => {
        expect(canonicalizeSkill('reactjs')).toBe('React');
        expect(canonicalizeSkill('postgres')).toBe('PostgreSQL');
        expect(canonicalizeSkill('React Testing Library')).toBe('React Testing Library');
        expect(canonicalizeSkill('Stakeholder mapping')).toBe('Stakeholder mapping');
    });
});

describe('text cleanup', () => {
    it('decodes escaped HTML, strips active content and invisible characters', () => {
        const escaped = '&lt;h3&gt;Requirements&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;/ul&gt;&lt;script&gt;alert(1)&lt;/script&gt;';
        const blocks = htmlToBlocks(escaped);
        expect(blocks).toEqual([
            { type: 'heading', text: 'Requirements' },
            { type: 'item', text: 'SQL' },
        ]);
        expect(decodeEntities('plain &amp; simple')).toBe('plain & simple');
        expect(cleanText('a​b  c\n\n\nd')).toBe('ab c\nd');
    });

    it('treats bold-only paragraphs as headings', () => {
        expect(htmlToBlocks('<p><strong>Nice to have</strong></p><ul><li>Docker</li></ul>')[0]).toEqual({ type: 'heading', text: 'Nice to have' });
    });
});

describe('requirements', () => {
    it('separates required and preferred skills', () => {
        const r = extractRequirements(
            lines('<h3>Requirements</h3><ul><li>2+ years with TypeScript and React</li><li>Git</li><li>GraphQL is a plus</li></ul><h3>Nice to have</h3><ul><li>Docker</li></ul>'),
        );
        expect(r.required.map((s) => s.skill)).toEqual(['TypeScript', 'React', 'Git']);
        expect(r.preferred.map((s) => s.skill)).toEqual(['GraphQL', 'Docker']);
        expect(r.experience.minYears).toBe(2);
        expect(r.sectionsAmbiguous).toBe(false);
    });

    it('treats "one of" / "e.g." lists as alternatives, not a checklist', () => {
        const r = extractRequirements(
            lines('<h3>What we are looking for</h3><ul><li>Code in one of Python, Rust, Golang or Java</li><li>CI/CD systems (e.g. GitHub Actions, Jenkins)</li></ul>'),
        );
        expect(r.required.map((s) => s.skill)).toEqual(['CI/CD']);
        expect(r.requiredAlternatives.map((g) => g.skills)).toEqual([
            ['Python', 'Rust', 'Go', 'Java'],
            ['GitHub Actions', 'Jenkins'],
        ]);
    });

    it('flags descriptions with no section structure', () => {
        const r = extractRequirements(lines('<p>You will write Python and SQL every day.</p>'));
        expect(r.sectionsAmbiguous).toBe(true);
        expect(r.required.map((s) => s.skill)).toEqual(['Python', 'SQL']);
    });

    it('reads experience ranges, minimums and "no experience required"', () => {
        const exp = (t: string) => extractRequirements(lines(`<h3>Requirements</h3><ul><li>${t}</li></ul>`)).experience;
        expect(exp('3-5 years of experience in data analysis')).toMatchObject({ minYears: 3, maxYears: 5 });
        expect(exp('At least two years experience')).toMatchObject({ minYears: 2 });
        expect(exp('No prior experience required')).toMatchObject({ minYears: 0 });
        expect(exp('Great attitude')).toMatchObject({ minYears: null });
    });

    it('detects student-only requirements from text or title', () => {
        expect(extractStudentRequirement(lines('<ul><li>Must be currently enrolled in a degree program</li></ul>')).required).toBe(true);
        expect(extractStudentRequirement([], 'Web3 Operations (for current university students)').required).toBe(true);
        expect(extractStudentRequirement(lines('<p>We love students and graduates.</p>')).required).toBe(false);
    });

    it('marks education as preferred when qualified', () => {
        const r = extractRequirements(lines('<h3>Requirements</h3><ul><li>BSc in Computer Science or equivalent experience</li></ul>'));
        expect(r.education).toMatchObject({ level: 'bachelor', requirement: 'preferred' });
    });
});

describe('dates and deadlines', () => {
    it('handles missing and invalid timestamps', () => {
        expect(toIsoOrNull(null)).toBeNull();
        expect(toIsoOrNull('not a date')).toBeNull();
        expect(toIsoOrNull(1_788_000_000_000)).toMatch(/^2026-/);
    });

    it('parses human dates only from deadline lines', () => {
        expect(parseHumanDate('Apply by 30 September 2026')).toBe('2026-09-30');
        expect(parseHumanDate('Deadline: Sept 30, 2026')).toBe('2026-09-30');
        expect(findDeadline(null, lines('<p>Founded on 1 March 2015.</p>')).deadline).toBeNull();
        expect(findDeadline(null, lines('<p>Closing date: 2026-10-15</p>'))).toMatchObject({ deadline: '2026-10-15', origin: 'description' });
    });

    it('prefers the structured deadline field', () => {
        expect(findDeadline('2026-10-01T00:00:00Z', lines('<p>Apply by 1 December 2026</p>'))).toMatchObject({ deadline: '2026-10-01', origin: 'structured_field' });
    });

    it('only expires a deadline once the day has passed everywhere', () => {
        // NOW is 2026-09-23T12:00Z. The 23rd is still open everywhere; the 22nd ended in UTC-12 at 11:59:59Z.
        expect(deadlineStatus('2026-09-23', NOW)).toBe('closing_soon');
        expect(deadlineStatus('2026-09-22', new Date('2026-09-23T11:00:00Z'))).toBe('closing_soon');
        expect(deadlineStatus('2026-09-22', NOW)).toBe('expired');
        expect(deadlineStatus('2026-09-20', NOW)).toBe('expired');
        expect(deadlineStatus('2026-09-26', NOW)).toBe('closing_soon');
        expect(deadlineStatus('2026-12-01', NOW)).toBe('open');
        expect(deadlineStatus(null, NOW)).toBe('unknown');
    });
});

describe('safe URLs', () => {
    it.each([
        ['https://jobs.lever.co/x/1', true],
        ['http://jobs.lever.co/x/1', false],
        ['https://127.0.0.1/x', false],
        ['https://169.254.169.254/latest/meta-data', false],
        ['https://localhost/x', false],
        ['https://metadata.google.internal/x', false],
        ['https://user:pass@example.com/', false],
        ['https://example.com:8443/', false],
        ['javascript:alert(1)', false],
    ])('%s -> %s', (url, ok) => expect(isSafePublicUrl(url)).toBe(ok));
});
