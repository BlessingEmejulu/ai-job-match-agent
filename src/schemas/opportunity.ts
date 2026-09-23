import { z } from 'zod';

import { EMPLOYMENT_TYPES, SENIORITY_LEVELS } from './input.js';

export const SCHEMA_VERSION = '1.0';

const nullableIso = z.string().datetime({ offset: true }).nullable();
const httpsUrl = z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), 'must be https');

export const eligibilityStatus = z.enum(['explicitly_supported', 'explicitly_restricted', 'unknown']);
export type EligibilityStatus = z.infer<typeof eligibilityStatus>;

export const reasonSchema = z.object({
    code: z.string(),
    message: z.string(),
    evidence: z.string().nullable(),
});
export type Reason = z.infer<typeof reasonSchema>;

export const evidenceSchema = z.object({
    field: z.string(),
    excerpt: z.string().max(400),
    origin: z.enum(['structured_field', 'description', 'ai_quoted_description']),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const matchSchema = z.object({
    status: z.enum(['scored', 'insufficient_evidence']),
    score: z.number().min(0).max(100).nullable(),
    scoreBreakdown: z.array(
        z.object({
            dimension: z.enum(['required_skills', 'preferred_skills', 'experience', 'role_alignment', 'preferences']),
            weight: z.number(),
            scored: z.boolean(),
            value: z.number().min(0).max(1).nullable(),
            note: z.string(),
        }),
    ),
    evidenceCoverage: z.number().min(0).max(1),
    matchedSkills: z.array(z.string()),
    requiredSkillsNotEvidenced: z.array(z.string()),
    preferredSkillsNotEvidenced: z.array(z.string()),
    experienceAssessment: z.object({
        status: z.enum(['meets', 'below', 'unknown']),
        note: z.string(),
    }),
    requirementChecks: z.array(
        z.object({ requirement: z.string(), status: z.enum(['met', 'not_met', 'unknown']), note: z.string() }),
    ),
    explanation: z.string(),
    suggestedNextSteps: z.array(z.string()).max(2),
});
export type MatchResult = z.infer<typeof matchSchema>;

export const opportunitySchema = z.object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    jobId: z.string().min(8),
    sourceJobId: z.string().min(1),
    title: z.string().min(1),
    company: z.string().min(1),
    source: z.object({
        id: z.string(),
        family: z.enum(['greenhouse', 'lever']),
        boardId: z.string(),
    }),
    sourceUrl: httpsUrl,
    applicationUrl: httpsUrl,
    discoveredAt: z.string().datetime({ offset: true }),
    sourcePostedAt: nullableIso,
    sourceUpdatedAt: nullableIso,
    freshnessDays: z.number().int().nullable(),
    deadline: z.string().nullable(),
    deadlineStatus: z.enum(['open', 'closing_soon', 'expired', 'unknown']),
    locationText: z.string(),
    countries: z.array(z.string().length(2)),
    regions: z.array(z.string()),
    workArrangement: z.enum(['remote', 'hybrid', 'onsite', 'unspecified']),
    employmentType: z.enum([...EMPLOYMENT_TYPES, 'unknown']),
    seniority: z.enum([...SENIORITY_LEVELS, 'unknown']),
    earlyCareerFit: z.enum(['suitable', 'possible', 'unlikely', 'unknown']),
    experience: z.object({
        minYears: z.number().nullable(),
        maxYears: z.number().nullable(),
        evidence: z.string().nullable(),
    }),
    education: z.object({
        level: z.string().nullable(),
        requirement: z.enum(['required', 'preferred', 'not_stated']),
        evidence: z.string().nullable(),
    }),
    studentStatusRequired: z.object({
        required: z.boolean(),
        evidence: z.string().nullable(),
    }),
    requiredSkills: z.array(z.string()),
    requiredSkillAlternatives: z.array(z.array(z.string())),
    preferredSkills: z.array(z.string()),
    salary: z
        .object({
            min: z.number().nullable(),
            max: z.number().nullable(),
            currency: z.string().nullable(),
            interval: z.string().nullable(),
            text: z.string().nullable(),
        })
        .nullable(),
    shortDescription: z.string().max(600),
    geographicEligibility: z.object({
        status: eligibilityStatus,
        basis: z.enum(['worldwide', 'country', 'region', 'none']),
        assessedFor: z.array(z.string()),
        summary: z.string(),
    }),
    eligibilityReasons: z.array(reasonSchema),
    unresolvedRequirements: z.array(z.string()),
    evidence: z.array(evidenceSchema),
    provenance: z.object({
        adapter: z.string(),
        apiUrl: httpsUrl,
        retrievedAt: z.string().datetime({ offset: true }),
        registryVerifiedAt: z.string(),
    }),
    qualityWarnings: z.array(z.string()),
    duplicateSourceReferences: z.array(
        z.object({ sourceId: z.string(), sourceJobId: z.string(), url: z.string() }),
    ),
    analysisMode: z.enum(['rules_only', 'ai_assisted']),
    decisionReasons: z.array(z.string()),
    match: matchSchema.nullable(),
});

export type Opportunity = z.infer<typeof opportunitySchema>;
