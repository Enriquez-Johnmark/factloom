import { join } from 'node:path';
import { healthcareDomain, importFhirResources } from '@kronomind/adapters';
import {
  approveProposedChange,
  createFakeEmbedder,
  type FactId,
  type FactWithSources,
  type MemoryStore,
  type OperationDeps,
  parseDateInput,
  type Timestamp,
} from '@kronomind/core';
import { getFactHistory } from '@kronomind/graph-rag';
import { openSqliteMemoryStore } from '@kronomind/storage';
import { DEMO_DECISION_DAY, DEMO_IMPORTS, DEMO_NOW } from './healthcare-demo-records.ts';

export type HealthcareDemoDeps = {
  /** A new, empty directory for the demo's own database file. Nothing outside it is touched. */
  readonly directory: string;
  /** Writes one line of the demo. */
  readonly write: (line: string) => void;
};

const NAMESPACE = 'demo:invented';
const MARKER =
  'INVENTED DATA. Every record in this demo is invented; Kronomind is not ready for patient data.';
const READ_LIMIT = 100;

function at(date: string): Timestamp {
  const parsed = parseDateInput(date);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

/** A timestamp as a day when it starts one, else in full. */
function showTime(time: Timestamp | null, absent: string): string {
  if (time === null) return absent;
  return time.endsWith('T00:00:00.000Z') ? time.slice(0, 10) : time;
}

/** One fact for a person: the statement, when it was true, and where it came from. */
function describeFact(found: FactWithSources): string {
  const { fact } = found;
  const valid = `true from ${showTime(fact.validFrom, 'an unknown start')} ${fact.validTo === null ? 'with no end known' : `until ${showTime(fact.validTo, '')}, not included`}`;
  const sources = found.sources.map((source) =>
    `${source.kind} ${source.locator ?? ''}${source.version === null ? '' : ` v${source.version}`}`.trim(),
  );
  return `  - ${fact.statement} (${valid}; from ${sources.join(', ')})`;
}

async function listAt(
  store: MemoryStore,
  validAt: string,
  knownAt: string,
): Promise<readonly FactWithSources[]> {
  const listed = await store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: null,
    predicate: null,
    touchingEntityIds: null,
    supersededByFactId: null,
    time: { validAt: at(validAt), knownAt: at(knownAt) },
    limit: READ_LIMIT,
  });
  if (!listed.ok) throw new Error(listed.error.message);
  return [...listed.value].sort((first, second) => first.fact.statement.localeCompare(second.fact.statement));
}

async function ask(
  deps: HealthcareDemoDeps,
  store: MemoryStore,
  question: string,
  validAt: string,
  knownAt: string,
) {
  deps.write('');
  deps.write(question);
  const facts = await listAt(store, validAt, knownAt);
  if (facts.length === 0) deps.write('  - nothing');
  for (const found of facts) deps.write(describeFact(found));
}

/**
 * Runs the healthcare demo (FL-094) on invented records: imports a short story of one invented
 * patient into a new database file, shows what waits for a clinician, approves it as a person,
 * and answers four questions: what is true now, what was true on a date, what was believed on
 * a date, and how a fact changed. It reads no configuration, opens no other database, and
 * makes no network call: the embedder is the fake one, because the demo reads by structure.
 * Returns the exit code.
 */
export async function runHealthcareDemo(deps: HealthcareDemoDeps): Promise<number> {
  const embedder = createFakeEmbedder();
  const opened = openSqliteMemoryStore({
    path: join(deps.directory, 'demo.db'),
    embeddingModel: embedder.model,
    embeddingDimensions: embedder.dimensions,
  });
  if (!opened.ok) {
    deps.write(`${opened.error.code}: ${opened.error.message}`);
    return 1;
  }
  const store = opened.value;
  let count = 0;
  const on = (date: string): OperationDeps => ({
    store,
    embedder,
    domain: healthcareDomain,
    now: () => at(date),
    newId: () => {
      count += 1;
      return `demo-${count}`;
    },
  });
  try {
    deps.write(MARKER);
    deps.write('');
    deps.write('What happened, as FHIR R4 records imported by fixed rules, with no LLM:');
    for (const step of DEMO_IMPORTS) {
      const imported = await importFhirResources(on(step.at), {
        namespace: NAMESPACE,
        document: step.records,
        trigger: 'person',
      });
      if (!imported.ok) throw new Error(imported.error.message);
      deps.write(`  ${step.at}  ${step.title}`);
      for (const entry of imported.value.entries)
        deps.write(`             ${entry.resource}: ${entry.outcome}`);
    }

    deps.write('');
    deps.write(
      `1. What waits for a clinician on ${DEMO_DECISION_DAY}, and what changes when it is approved?`,
    );
    const pending = await store.listPendingProposals({ namespace: NAMESPACE });
    if (!pending.ok) throw new Error(pending.error.message);
    const changedFactIds: FactId[] = [];
    for (const { proposal, storedFact } of pending.value) {
      deps.write(`  - proposed ${proposal.supersession.kind}: ${storedFact.fact.statement}`);
      const approved = await approveProposedChange(on(DEMO_DECISION_DAY), {
        namespace: NAMESPACE,
        proposalId: proposal.id,
        trigger: 'person',
      });
      if (!approved.ok) throw new Error(approved.error.message);
      deps.write('    approved by a person; until then, memory was unchanged.');
      changedFactIds.push(approved.value.changedFactId);
    }

    await ask(deps, store, `2. What is true now (${DEMO_NOW})?`, DEMO_NOW, DEMO_NOW);
    await ask(deps, store, '3. What was true on 2026-03-15, as known now?', '2026-03-15', DEMO_NOW);
    await ask(
      deps,
      store,
      '4. What did memory believe on 2026-04-01, before the error was found?',
      '2026-04-01',
      '2026-04-01',
    );

    deps.write('');
    deps.write('How each changed fact got there: nothing was deleted.');
    for (const factId of changedFactIds) {
      const history = await getFactHistory(on(DEMO_NOW), { namespace: NAMESPACE, factId });
      if (!history.ok) throw new Error(history.error.message);
      for (const entry of history.value.entries) {
        const believed = `believed from ${showTime(entry.fact.createdAt, '')}${entry.fact.invalidatedAt === null ? '' : ` until ${showTime(entry.fact.invalidatedAt, '')}`}`;
        const actions = entry.auditEntries.map((audit) => `${audit.operation} ${audit.action}`).join(', ');
        deps.write(`${describeFact(entry)}`);
        deps.write(`      ${believed}; ${actions}`);
      }
    }
    deps.write('');
    deps.write(MARKER);
    return 0;
  } finally {
    await store.close();
  }
}
