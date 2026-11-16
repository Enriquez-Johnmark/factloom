// The extraction step that the extraction cases of FL-029 measure in production use: the text
// goes through the `remember` use case on empty memory, and the facts it recorded come back.
import { join } from 'node:path';
import { createTestDeps, type FactWithSources, type LlmClient, ok } from '@factloom/core';
import { remember, softwareDevelopmentDomain } from '@factloom/graph-rag';
import type { ExtractedFact, ExtractFacts } from './score-extraction.ts';

/** Where the recordings of the extraction cases are. */
export const EXTRACTION_RECORDINGS_DIRECTORY = join(import.meta.dirname, 'recordings', 'extraction');

/** The command that records them, named by the error for a missing recording. */
export const EXTRACTION_RECORD_COMMAND = 'pnpm --filter @factloom/mcp-server run record:extraction';

/** A recorded fact in the shape the scorer compares. */
function toExtractedFact(found: FactWithSources): ExtractedFact {
  const { fact, subject, objectEntity } = found;
  return {
    subject: { type: subject.type, name: subject.name },
    predicate: fact.predicate,
    object:
      fact.object.kind === 'value'
        ? { value: fact.object.value }
        : { type: objectEntity?.type ?? 'entity', name: objectEntity?.name ?? fact.object.entityId },
    valid_from: fact.validFrom,
    valid_to: fact.validTo,
  };
}

/**
 * The extraction step for the scorer: each text is remembered on a new in-memory store, with
 * the clock at the case's `observed_at`, counting identifiers, the fake embedder and the
 * software development domain, as a note from the agent. A failure of `remember` is returned.
 */
export function createRememberExtraction(llm: LlmClient): ExtractFacts {
  return async (text, observedAt) => {
    const deps = { ...createTestDeps({ now: observedAt }), domain: softwareDevelopmentDomain, llm };
    const remembered = await remember(deps, {
      namespace: 'eval:extraction',
      text,
      source: { kind: 'agent_note', locator: null, version: null },
      trigger: 'agent',
    });
    if (!remembered.ok) return remembered;
    return ok(remembered.value.facts.map(toExtractedFact));
  };
}
