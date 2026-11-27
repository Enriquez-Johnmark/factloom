import { err, type Failure } from '@kronomind/core';
import type { Database } from 'better-sqlite3';

/** The embedding model a database holds vectors of. Written to every embedding row. */
export type EmbeddingModel = { readonly model: string; readonly dimensions: number };

/** The bytes of a vector's 32-bit floats, the form `vec_distance_cosine()` reads. */
export function toBlob(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

/**
 * Checks that every vector a database holds comes from the given model, with one query that
 * reads no vector. Returns the refusal, or null when the database is empty or matches.
 */
export function findEmbeddingModelMismatch(db: Database, expected: EmbeddingModel): Failure | null {
  const held = db
    .prepare<[], { readonly model: string; readonly dimensions: number }>(
      'SELECT DISTINCT model, dimensions FROM fact_embedding',
    )
    .all();
  const other = held.find((row) => row.model !== expected.model || row.dimensions !== expected.dimensions);
  if (other === undefined) return null;
  return err(
    'embedding_model_mismatch',
    `This database holds vectors of the model "${other.model}" with ${other.dimensions} dimensions, and it was opened for "${expected.model}" with ${expected.dimensions}. Open it with the model it was built with; vectors of two models cannot be compared.`,
  );
}
