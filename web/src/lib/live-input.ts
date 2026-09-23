import { z } from 'zod';

/** What the live-run form may send. Everything else is set by the server. */
const iso2 = z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((s) => s.toUpperCase());
const list = (max: number, itemMax: number) =>
    z
        .string()
        .max(max * (itemMax + 2))
        .transform((s) =>
            s
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, max)
                .map((x) => x.slice(0, itemMax)),
        );

export const liveFormSchema = z
    .object({
        roleKeywords: list(5, 60).prefault(''),
        countries: list(5, 3).pipe(z.array(iso2).min(1, 'Enter at least one country code')),
        workArrangements: z.array(z.enum(['remote', 'hybrid', 'onsite'])).max(3).default([]),
        seniorityLevels: z.array(z.enum(['internship', 'graduate', 'entry', 'junior', 'mid', 'senior', 'lead', 'executive'])).max(8).default([]),
        skills: list(25, 50).prefault(''),
        yearsExperience: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().min(0).max(40).optional()),
        desiredRoles: list(5, 60).prefault(''),
        candidateCountry: iso2.optional().or(z.literal('').transform(() => undefined)),
        studentStatus: z.enum(['enrolled', 'graduated', 'not_student']).optional().or(z.literal('').transform(() => undefined)),
    })
    .strict();

export type LiveForm = z.input<typeof liveFormSchema>;

export interface LiveCaps {
    maxResults: number;
}

/**
 * Build the Actor input. Match mode is used only when the visitor gave skills, experience and a
 * country; otherwise discover mode. Limits are fixed server-side, AI is never enabled from the
 * website, and only minimal, non-identifying profile fields are forwarded.
 */
export function buildActorInput(raw: unknown, caps: LiveCaps): { ok: true; input: Record<string, unknown>; mode: 'discover' | 'match' } | { ok: false; error: string } {
    const parsed = liveFormSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'form'}: ${i.message}`).join('; ') };
    const f = parsed.data;
    const canMatch = f.skills.length > 0 && f.yearsExperience !== undefined && !!f.candidateCountry;
    const input: Record<string, unknown> = {
        mode: canMatch ? 'match' : 'discover',
        roleKeywords: f.roleKeywords,
        countries: f.countries,
        workArrangements: f.workArrangements,
        seniorityLevels: f.seniorityLevels,
        includeUnknownEligibility: true,
        includeUnknownDeadline: true,
        maxResults: Math.max(1, Math.min(caps.maxResults, 25)),
        maxRequests: 40,
        maxRuntimeSeconds: 120,
        ai: { enabled: false, maxAnalyses: 0 },
    };
    if (canMatch) {
        input.candidateProfile = {
            skills: f.skills,
            yearsExperience: f.yearsExperience,
            desiredRoles: f.desiredRoles.length ? f.desiredRoles : f.roleKeywords.length ? f.roleKeywords : ['software engineer'],
            country: f.candidateCountry,
            ...(f.studentStatus ? { studentStatus: f.studentStatus } : {}),
        };
    }
    return { ok: true, input, mode: canMatch ? 'match' : 'discover' };
}
