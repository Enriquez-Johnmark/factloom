import type { z } from 'zod';
import type { Result } from './result.ts';

/** Phase 1 uses 'extraction'. Phase 2 adds conflict detection, phase 3 verification. */
export type LlmTask = 'extraction' | 'conflict_detection' | 'verification' | 'entity_matching';

/** The one thing Kronomind asks of a language model. Outer packages implement it. */
export interface LlmClient {
  /** Asks for one object that matches the schema. */
  generateObject<T>(request: {
    /** Lets the composition root choose a model per task. */
    readonly task: LlmTask;
    /** The stable part of the prompt. Implementations may cache it. */
    readonly instructions: string;
    /** The part that changes with every call. */
    readonly input: string;
    readonly schema: z.ZodType<T>;
  }): Promise<Result<T>>;
}
