import type { Result } from './result.ts';

/** Turns text into vectors. Outer packages implement it. */
export interface Embedder {
  /** Stored with every vector, so a change of model is detected. */
  readonly model: string;
  readonly dimensions: number;

  /** Some models embed stored text and questions differently, so the caller says which it is. */
  embed(
    texts: readonly string[],
    purpose: 'statement' | 'question',
  ): Promise<Result<readonly Float32Array[]>>;
}
