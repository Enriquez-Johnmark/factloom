import type { Embedder } from './embedder.ts';
import { ok } from './result.ts';

const DIMENSIONS = 16;

/** A small, stable hash of a text. Not for security: only to spread texts over numbers. */
function hashText(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

/**
 * Embeds a text as a bag of its words: each word adds one to a position chosen by its hash,
 * so texts that share words point in similar directions. A small share comes from the whole
 * text, so that two different texts never get the same vector.
 */
function embedText(text: string): Float32Array {
  const vector = new Float32Array(DIMENSIONS);
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
  for (const word of words) {
    const position = hashText(word) % DIMENSIONS;
    vector[position] = (vector[position] ?? 0) + 1;
  }
  const whole = hashText(text);
  for (let position = 0; position < DIMENSIONS; position += 1) {
    vector[position] = (vector[position] ?? 0) + (((whole >>> position) & 1) + 1) * 0.01;
  }
  return vector;
}

/**
 * Creates an `Embedder` for tests. It needs no model and no network: the same text always
 * gives the same vector, and the purpose does not change it.
 */
export function createFakeEmbedder(): Embedder {
  return {
    model: 'fake-embedder',
    dimensions: DIMENSIONS,
    embed(texts) {
      return Promise.resolve(ok(texts.map(embedText)));
    },
  };
}
