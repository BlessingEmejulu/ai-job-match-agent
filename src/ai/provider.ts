import { z } from 'zod';

/**
 * Structured output the model must return. Every factual item carries a verbatim quote from the
 * posting; items whose quote cannot be found in the posting are discarded (see validate.ts).
 */
export const aiExtractionSchema = z.object({
    requiredSkills: z.array(z.object({ skill: z.string(), quote: z.string() })),
    preferredSkills: z.array(z.object({ skill: z.string(), quote: z.string() })),
    minYearsExperience: z.object({ years: z.number(), quote: z.string() }).nullable(),
    studentOnly: z.object({ quote: z.string() }).nullable(),
    locationRestrictions: z.array(
        z.object({
            type: z.enum(['location_required', 'work_authorization_required']),
            places: z.array(z.string()),
            quote: z.string(),
        }),
    ),
});
export type AiExtraction = z.infer<typeof aiExtractionSchema>;

export interface AiExtractionRequest {
    title: string;
    /** Plain text of the posting (already HTML-stripped and length-limited). */
    text: string;
}

/** One replaceable provider interface. Implementations must never throw secrets into messages. */
export interface AiProvider {
    readonly name: string;
    extract(req: AiExtractionRequest, signal: AbortSignal): Promise<AiExtraction>;
}

export class AiOutputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AiOutputError';
    }
}
