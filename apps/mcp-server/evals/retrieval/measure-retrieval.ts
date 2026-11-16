// The retrieval eval's harness: loads the statements as facts into a new SQLite database and
// asks every question through recall with the given settings. Deterministic: a fixed clock, a
// counting identifier generator, a fixed order and a new database for each run.
import {
  createTestDeps,
  type Domain,
  type Embedder,
  type FactDraft,
  type MemoryStore,
  type NewEntity,
  type OperationDeps,
  recordFacts,
} from '@factloom/core';
import { PROVISIONAL_RECALL_SETTINGS, type RecallSettings, recallWithSettings } from '@factloom/graph-rag';
import { openSqliteMemoryStore } from '@factloom/storage';
import { QUESTION_GROUPS, type RetrievalCases } from './retrieval-cases.ts';
import { averageScores, type RetrievalScores, scoreQuestion } from './retrieval-metrics.ts';

const NAMESPACE = 'repo:harborlight';
/** The most facts a question's ranking is scored on: MRR@10 reads the first ten. */
const RANKING_LENGTH = 10;

/** An eval-only domain: one multi-valued predicate, so that loading 60 statements causes no conflict. */
export const RETRIEVAL_EVAL_DOMAIN: Domain = {
  name: 'retrieval-eval',
  entityTypes: ['tool', 'component', 'practice', 'team'],
  predicates: [{ name: 'states', description: 'A statement about the subject.', cardinality: 'multi' }],
  extractionInstructions: 'Not used: the retrieval eval records structured facts only.',
  correctionPolicy: 'automatic',
};

export type NamedSettings = { readonly name: string; readonly settings: RecallSettings };

/** The entries of FL-033: the provisional settings, and each of the two first lanes alone. */
export const RETRIEVAL_EVAL_SETTINGS: readonly NamedSettings[] = [
  { name: 'provisional', settings: PROVISIONAL_RECALL_SETTINGS },
  {
    name: 'vector lane only',
    settings: { ...PROVISIONAL_RECALL_SETTINGS, laneWeights: { vector: 1, keyword: 0, graph: 0 } },
  },
  {
    name: 'keyword lane only',
    settings: { ...PROVISIONAL_RECALL_SETTINGS, laneWeights: { vector: 0, keyword: 1, graph: 0 } },
  },
];

export type RetrievalRow = {
  readonly settings: string;
  /** 'all' or one of the question groups. */
  readonly group: string;
  readonly questions: number;
  readonly scores: RetrievalScores;
};

function entityOf(named: { readonly type: string; readonly name: string }): NewEntity {
  return { id: `e-${named.type}-${named.name.replaceAll(/[^a-z0-9]+/g, '-')}`, ...named };
}

/** A memory loaded with every statement of the cases. Returns it with the fact of each statement. */
export async function loadStatements(
  embedder: Embedder,
  cases: RetrievalCases,
): Promise<{ readonly deps: OperationDeps; readonly statementOfFact: ReadonlyMap<string, string> }> {
  const opened = openSqliteMemoryStore({
    path: ':memory:',
    embeddingModel: embedder.model,
    embeddingDimensions: embedder.dimensions,
  });
  if (!opened.ok) throw new Error(opened.error.message);
  const store: MemoryStore = opened.value;
  const deps: OperationDeps = {
    ...createTestDeps({ now: '2026-01-10', domain: RETRIEVAL_EVAL_DOMAIN, store }),
    embedder,
  };

  const drafts: FactDraft[] = cases.statements.map((statement) => {
    const subject = entityOf(statement.subject);
    const object = statement.object === null ? null : entityOf(statement.object);
    return {
      fact: {
        subjectEntityId: subject.id,
        predicate: 'states',
        object:
          object === null
            ? { kind: 'value', value: statement.text }
            : { kind: 'entity', entityId: object.id },
        statement: statement.text,
        confidence: 1,
        validFrom: null,
        validTo: null,
      },
      newEntities: object === null ? [subject] : [subject, object],
    };
  });
  const recorded = await recordFacts(deps, {
    namespace: NAMESPACE,
    trigger: 'agent',
    reasonCode: 'stated',
    source: {
      kind: 'agent_note',
      locator: null,
      version: null,
      content: 'The Harborlight statements of the embedding spike.',
      observedAt: deps.now(),
    },
    drafts,
    restatedFactIds: [],
  });
  if (!recorded.ok) throw new Error(recorded.error.message);
  const statementOfFact = new Map(
    recorded.value.factIds.map((factId, index) => [factId, cases.statements[index]?.id ?? '']),
  );
  return { deps, statementOfFact };
}

/** Asks one question with the given settings and returns the statements of the facts, best first. */
export async function rankStatements(
  memory: Awaited<ReturnType<typeof loadStatements>>,
  question: string,
  settings: RecallSettings,
): Promise<string[]> {
  const recalled = await recallWithSettings(
    memory.deps,
    { namespace: NAMESPACE, question, validAt: null, knownAt: null, limit: RANKING_LENGTH },
    settings,
  );
  if (!recalled.ok) throw new Error(recalled.error.message);
  return recalled.value.facts.map(({ fact }) => memory.statementOfFact.get(fact.id) ?? fact.id);
}

/** Measures each named setting on a new database: the three metrics over all questions and per group. */
export async function measureRetrieval(
  embedder: Embedder,
  cases: RetrievalCases,
  entries: readonly NamedSettings[],
): Promise<readonly RetrievalRow[]> {
  const rows: RetrievalRow[] = [];
  for (const entry of entries) {
    const memory = await loadStatements(embedder, cases);
    const scored: { readonly group: string; readonly scores: RetrievalScores }[] = [];
    for (const query of cases.queries) {
      const ranking = await rankStatements(memory, query.text, entry.settings);
      scored.push({ group: query.group, scores: scoreQuestion(ranking, query.relevant) });
    }
    await memory.deps.store.close();
    for (const group of ['all', ...QUESTION_GROUPS]) {
      const inGroup = scored.filter((one) => group === 'all' || one.group === group);
      rows.push({
        settings: entry.name,
        group,
        questions: inGroup.length,
        scores: averageScores(inGroup.map((one) => one.scores)),
      });
    }
  }
  return rows;
}

/** The rows as a Markdown table, numbers to three decimals. */
export function formatRetrievalTable(rows: readonly RetrievalRow[]): string {
  const lines = [
    '| Settings | Questions | Group | recall@1 | recall@5 | MRR@10 |',
    '|---|---|---|---|---|---|',
    ...rows.map(
      (row) =>
        `| ${row.settings} | ${row.questions} | ${row.group} | ${row.scores.recallAt1.toFixed(3)} | ${row.scores.recallAt5.toFixed(3)} | ${row.scores.mrrAt10.toFixed(3)} |`,
    ),
  ];
  return lines.join('\n');
}
