import { z } from 'zod';

/**
 * Hard ceilings. The Apify input schema enforces the same maximums so the Console form and the
 * runtime agree. Anything above these is rejected rather than silently clamped.
 */
export const LIMITS = {
    maxResults: { default: 20, max: 100 },
    maxRequests: { default: 60, max: 200 },
    maxRuntimeSeconds: { default: 180, max: 600 },
    aiMaxAnalyses: { default: 10, max: 25 },
} as const;

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'apprenticeship', 'temporary'] as const;
export const SENIORITY_LEVELS = ['internship', 'graduate', 'entry', 'junior', 'mid', 'senior', 'lead', 'executive'] as const;
export const WORK_ARRANGEMENTS = ['remote', 'hybrid', 'onsite'] as const;
export const EDUCATION_LEVELS = ['secondary', 'diploma', 'bachelor', 'master', 'doctorate', 'bootcamp', 'other'] as const;
export const STUDENT_STATUSES = ['enrolled', 'graduated', 'not_student'] as const;

const iso2 = z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'Use ISO 3166-1 alpha-2 country codes, e.g. "NG", "KE", "GH".')
    .transform((s) => s.toUpperCase());

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const candidateProfileSchema = z
    .object({
        skills: z.array(shortText(60)).min(1, 'Add at least one skill.').max(60),
        yearsExperience: z.number().min(0).max(60),
        desiredRoles: z.array(shortText(80)).min(1).max(10),
        country: iso2,
        timezone: z.string().trim().max(64).optional(),
        educationLevel: z.enum(EDUCATION_LEVELS).optional(),
        studentStatus: z.enum(STUDENT_STATUSES).optional(),
        workAuthorizationCountries: z.array(iso2).max(30).optional(),
        experienceSummary: z.string().trim().max(1000).optional(),
    })
    .strict();

export const inputSchema = z
    .object({
        mode: z.enum(['discover', 'match']).default('discover'),
        roleKeywords: z.array(shortText(80)).max(20).default([]),
        countries: z.array(iso2).min(1, 'Choose at least one country.').max(30),
        employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)).max(EMPLOYMENT_TYPES.length).default([]),
        seniorityLevels: z.array(z.enum(SENIORITY_LEVELS)).max(SENIORITY_LEVELS.length).default([]),
        workArrangements: z.array(z.enum(WORK_ARRANGEMENTS)).max(WORK_ARRANGEMENTS.length).default([]),
        includeUnknownEligibility: z.boolean().default(true),
        includeUnknownDeadline: z.boolean().default(true),
        sourceIds: z.array(shortText(60)).max(50).optional(),
        maxResults: z.number().int().min(1).max(LIMITS.maxResults.max).default(LIMITS.maxResults.default),
        maxRequests: z.number().int().min(1).max(LIMITS.maxRequests.max).default(LIMITS.maxRequests.default),
        maxRuntimeSeconds: z
            .number()
            .int()
            .min(30)
            .max(LIMITS.maxRuntimeSeconds.max)
            .default(LIMITS.maxRuntimeSeconds.default),
        candidateProfile: candidateProfileSchema.optional(),
        ai: z
            .object({
                enabled: z.boolean().default(false),
                maxAnalyses: z.number().int().min(0).max(LIMITS.aiMaxAnalyses.max).default(LIMITS.aiMaxAnalyses.default),
            })
            .strict()
            .default({ enabled: false, maxAnalyses: LIMITS.aiMaxAnalyses.default }),
    })
    .strict()
    .superRefine((val, ctx) => {
        if (val.mode === 'match' && !val.candidateProfile) {
            ctx.addIssue({
                code: 'custom',
                path: ['candidateProfile'],
                message: 'candidateProfile is required in match mode.',
            });
        }
    });

export type ActorInput = z.infer<typeof inputSchema>;
export type CandidateProfile = z.infer<typeof candidateProfileSchema>;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];
export type WorkArrangementPref = (typeof WORK_ARRANGEMENTS)[number];

export class InputValidationError extends Error {
    constructor(public readonly issues: string[]) {
        super(`Invalid input: ${issues.join('; ')}`);
        this.name = 'InputValidationError';
    }
}

/** Parse raw Actor input. Throws InputValidationError with readable, path-prefixed messages. */
export function parseInput(raw: unknown): ActorInput {
    const result = inputSchema.safeParse(raw ?? {});
    if (!result.success) {
        throw new InputValidationError(
            result.error.issues.map((i) => `${i.path.length ? i.path.join('.') : 'input'}: ${i.message}`),
        );
    }
    return result.data;
}
