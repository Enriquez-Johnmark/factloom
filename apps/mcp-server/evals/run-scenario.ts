// The scenario runner of FL-039: one timeline scenario through the use cases, on a new SQLite
// database, with the clock fixed at each step, counting identifiers, the fake embedder and a
// given LLM client. Memory is then read directly, never through recall, and each expectation
// is checked. The metrics over a set of results are in scenario-metrics.ts.

import { join } from 'node:path';
import {
  type ConflictJudge,
  createFakeEmbedder,
  type Domain,
  type Entity,
  type FactWithSources,
  type LlmClient,
  type MemoryStore,
  normaliseEntityName,
  ok,
  parseDateInput,
  type Result,
  type TimeFilter,
  type Timestamp,
  toTimestamp,
} from '@factloom/core';
import { changeFact, type FactHistoryEntry, getFactHistory, remember } from '@factloom/graph-rag';
import { openSqliteMemoryStore } from '@factloom/storage';
import type { Scenario } from './scenario.ts';

const NAMESPACE = 'eval:scenario';

/** The command that records the scenarios' LLM answers, named by the error for a missing recording. */
export const SCENARIO_RECORD_COMMAND = 'pnpm --filter @factloom/mcp-server run record:scenarios';

/** Where the recordings of one scenario file are: one directory per scenario. */
export function findScenarioRecordingsDirectory(file: string): string {
  return join(import.meta.dirname, 'recordings', 'scenarios', file.replace(/\.yaml$/u, ''));
}

/** The upper bound of each listFacts read. A scenario holds a handful of facts. */
const READ_LIMIT = 1000;

type Ask = Extract<Scenario['expect'][number], { ask: unknown }>;
type History = Extract<Scenario['expect'][number], { history: unknown }>;
type Entities = Extract<Scenario['expect'][number], { entities: unknown }>;
type Subject = Ask['ask']['subject'];
type SupersededPair = History['superseded'][number];

/** An ask, checked. A current ask has no as_of and no known_at. */
export type AskResult = {
  readonly kind: 'ask';
  readonly entry: Ask;
  readonly current: boolean;
  readonly found: readonly string[];
  readonly foundSources: number | null;
  readonly passed: boolean;
  /** Values returned that the entry says must not be. */
  readonly staleValues: readonly string[];
  /** Values the entry expects for which a fact was recorded and none is live any more. */
  readonly invalidatedValues: readonly string[];
};

export type HistoryResult = {
  readonly kind: 'history';
  readonly entry: History;
  readonly found: readonly SupersededPair[];
  readonly foundRows: number;
  readonly passed: boolean;
  /** Expected pairs whose `from` fact, the first recorded with that value, is still live. */
  readonly missed: readonly SupersededPair[];
};

export type EntitiesResult = {
  readonly kind: 'entities';
  readonly entry: Entities;
  readonly found: number;
  readonly passed: boolean;
};

export type ExpectationResult = AskResult | HistoryResult | EntitiesResult;

export type ScenarioResult = {
  readonly name: string;
  /** The first step whose use case failed, or null. */
  readonly stepFailure: { readonly step: number; readonly code: string; readonly message: string } | null;
  readonly expectations: readonly ExpectationResult[];
  readonly passed: boolean;
};

export type ScenarioRunOptions = {
  readonly llm: LlmClient;
  readonly domain: Domain;
  /** The conflict judge `remember` is given (FL-042). Without one, a conflict is skipped. */
  readonly judge?: ConflictJudge;
  /** Wraps the store before use, so that a test can make some of its methods fail. */
  readonly wrapStore?: (store: MemoryStore) => MemoryStore;
};

type Deps = {
  readonly store: MemoryStore;
  readonly domain: Domain;
  readonly embedder: ReturnType<typeof createFakeEmbedder>;
  readonly llm: LlmClient;
  readonly judge?: ConflictJudge;
  readonly newId: () => string;
};

/** A date of a scenario file, already checked by its schema, as a timestamp. */
function toScenarioTime(text: string): Timestamp {
  const parsed = parseDateInput(text);
  if (!parsed.ok) throw new Error(`The date "${text}" passed the scenario schema but cannot be read.`);
  return parsed.value;
}

/** The value a fact relates its subject to: the literal value, or the object entity's name. */
function readFactValue(found: FactWithSources): string {
  if (found.fact.object.kind === 'value') return found.fact.object.value;
  return found.objectEntity?.name ?? found.fact.object.entityId;
}

async function findSubject(deps: Deps, subject: Subject): Promise<Result<Entity | null>> {
  const entities = await deps.store.findEntities({
    namespace: NAMESPACE,
    name: subject.name,
    type: subject.type ?? null,
  });
  if (!entities.ok) return entities;
  return ok(entities.value[0] ?? null);
}

async function listFactsOf(
  deps: Deps,
  subject: Subject,
  predicate: string,
  time: TimeFilter | 'all',
): Promise<Result<readonly FactWithSources[]>> {
  const entity = await findSubject(deps, subject);
  if (!entity.ok) return entity;
  if (entity.value === null) return ok([]);
  return deps.store.listFacts({
    namespace: NAMESPACE,
    subjectEntityId: entity.value.id,
    predicate,
    touchingEntityIds: null,
    supersededByFactId: null,
    time,
    limit: READ_LIMIT,
  });
}

/** Applies one step with the clock at its time. Returns the failure of its use case, if any. */
async function applyStep(
  deps: Deps,
  step: Scenario['steps'][number],
): Promise<{ code: string; message: string } | null> {
  const at = toScenarioTime(step.at);
  const timed = { ...deps, now: () => at };
  if ('remember' in step) {
    const remembered = await remember(timed, {
      namespace: NAMESPACE,
      text: step.remember,
      source: { kind: 'agent_note', locator: null, version: null },
      trigger: 'agent',
    });
    return remembered.ok ? null : remembered.error;
  }
  const change = step.change_fact;
  const facts = await listFactsOf(deps, change.subject, change.predicate, { validAt: at, knownAt: at });
  if (!facts.ok) return facts.error;
  const target = facts.value.find(
    (found) => normaliseEntityName(readFactValue(found)) === normaliseEntityName(change.value),
  );
  if (target === undefined) {
    return {
      code: 'not_found',
      message: `No live fact of ${change.predicate} with the value "${change.value}".`,
    };
  }
  const changed = await changeFact(timed, {
    namespace: NAMESPACE,
    factId: target.fact.id,
    because: change.because,
    endedAt: change.ended_at === undefined ? null : toScenarioTime(change.ended_at),
    explanation: change.explanation,
    replacement: null,
    trigger: 'agent',
  });
  return changed.ok ? null : changed.error;
}

/**
 * The time filter of an ask, by the rule of MCP-TOOLS.md: both dates default to `now`, and
 * `as_of` takes the `known_at` date when only `known_at` is given.
 */
export function buildAskTimeFilter(ask: Ask['ask'], now: Timestamp): TimeFilter {
  const knownAt = ask.known_at === undefined ? now : toScenarioTime(ask.known_at);
  const validAt =
    ask.as_of !== undefined ? toScenarioTime(ask.as_of) : ask.known_at !== undefined ? knownAt : now;
  return { validAt, knownAt };
}

function sameSet(first: readonly string[], second: readonly string[]): boolean {
  const a = new Set(first);
  const b = new Set(second);
  return a.size === b.size && [...a].every((value) => b.has(value));
}

async function checkAsk(deps: Deps, entry: Ask, now: Timestamp): Promise<Result<AskResult>> {
  const listed = await listFactsOf(
    deps,
    entry.ask.subject,
    entry.ask.predicate,
    buildAskTimeFilter(entry.ask, now),
  );
  if (!listed.ok) return listed;
  const all = await listFactsOf(deps, entry.ask.subject, entry.ask.predicate, 'all');
  if (!all.ok) return all;

  const found = [...new Set(listed.value.map((fact) => normaliseEntityName(readFactValue(fact))))].sort();
  const returns = entry.returns.map(normaliseEntityName);
  const mustNotReturn = (entry.must_not_return ?? []).map(normaliseEntityName);
  const foundSources = listed.value.length === 1 ? (listed.value[0]?.sources.length ?? null) : null;
  const sourcesMatch = entry.sources === undefined || foundSources === entry.sources;
  const staleValues = found.filter((value) => mustNotReturn.includes(value));
  const invalidatedValues = returns.filter((value) => {
    const recorded = all.value.filter((fact) => normaliseEntityName(readFactValue(fact)) === value);
    return recorded.length > 0 && recorded.every((fact) => fact.fact.invalidatedAt !== null);
  });
  return ok({
    kind: 'ask',
    entry,
    current: entry.ask.as_of === undefined && entry.ask.known_at === undefined,
    found,
    foundSources,
    passed: sameSet(found, returns) && staleValues.length === 0 && sourcesMatch,
    staleValues,
    invalidatedValues,
  });
}

async function checkHistory(deps: Deps, entry: History): Promise<Result<HistoryResult>> {
  const all = await listFactsOf(deps, entry.history.subject, entry.history.predicate, 'all');
  if (!all.ok) return all;
  const missed = entry.superseded.filter((pair) => {
    const first = [...all.value]
      .filter((fact) => normaliseEntityName(readFactValue(fact)) === normaliseEntityName(pair.from))
      .sort(
        (a, b) => a.fact.createdAt.localeCompare(b.fact.createdAt) || a.fact.id.localeCompare(b.fact.id),
      )[0];
    return first !== undefined && first.fact.invalidatedAt === null;
  });
  // getFactHistory reaches every fact of a single-valued predicate from any one of them, but
  // for a multi-valued predicate only the facts linked by supersession. The history of each
  // fact is read, and the entries are joined by fact, so that both count every fact recorded.
  const entries = new Map<string, FactHistoryEntry>();
  for (const fact of all.value) {
    if (entries.has(fact.fact.id)) continue;
    const history = await getFactHistory(deps, { namespace: NAMESPACE, factId: fact.fact.id });
    if (!history.ok) return history;
    for (const historyEntry of history.value.entries) entries.set(historyEntry.fact.id, historyEntry);
  }
  const found: SupersededPair[] = [];
  for (const historyEntry of [...entries.values()].sort((a, b) => a.fact.id.localeCompare(b.fact.id))) {
    if (historyEntry.fact.supersededByFactId === null) continue;
    const invalidation = historyEntry.auditEntries.find((audit) => audit.action === 'fact.invalidated');
    const kind = invalidation?.operation;
    if (kind === 'succession' || kind === 'correction' || kind === 'revision') {
      found.push({ from: readFactValue(historyEntry), kind });
    }
  }
  const key = (pair: SupersededPair) => `${normaliseEntityName(pair.from)}\u0000${pair.kind}`;
  const foundRows = entries.size;
  const passed =
    sameSet(found.map(key), entry.superseded.map(key)) &&
    found.length === entry.superseded.length &&
    (entry.fact_rows === undefined || entry.fact_rows === foundRows);
  return ok({ kind: 'history', entry, found, foundRows, passed, missed });
}

async function checkEntities(deps: Deps, entry: Entities): Promise<Result<EntitiesResult>> {
  const entities = await deps.store.findEntities({
    namespace: NAMESPACE,
    name: entry.entities.name,
    type: null,
  });
  if (!entities.ok) return entities;
  const found = entities.value.length;
  return ok({ kind: 'entities', entry, found, passed: found === entry.count });
}

/**
 * Runs one scenario on a new SQLite database and checks every expectation after the last
 * step, at the moment just after it. A step whose use case fails is recorded and ends the
 * steps; the expectations are still checked against memory as it then is.
 */
export async function runScenario(scenario: Scenario, options: ScenarioRunOptions): Promise<ScenarioResult> {
  const embedder = createFakeEmbedder();
  const opened = openSqliteMemoryStore({
    path: ':memory:',
    embeddingModel: embedder.model,
    embeddingDimensions: embedder.dimensions,
  });
  if (!opened.ok) throw new Error(opened.error.message);
  let count = 0;
  const deps: Deps = {
    store: options.wrapStore === undefined ? opened.value : options.wrapStore(opened.value),
    domain: options.domain,
    embedder,
    llm: options.llm,
    ...(options.judge === undefined ? {} : { judge: options.judge }),
    newId: () => {
      count += 1;
      return `id-${count}`;
    },
  };
  try {
    let stepFailure: ScenarioResult['stepFailure'] = null;
    for (const [index, step] of scenario.steps.entries()) {
      const failure = await applyStep(deps, step);
      if (failure !== null) {
        stepFailure = { step: index + 1, code: failure.code, message: failure.message };
        break;
      }
    }
    const lastStep = scenario.steps[scenario.steps.length - 1];
    if (lastStep === undefined) throw new Error('A scenario has at least one step.');
    const now = toTimestamp(new Date(Date.parse(toScenarioTime(lastStep.at)) + 1));

    const expectations: ExpectationResult[] = [];
    for (const entry of scenario.expect) {
      const checked =
        'ask' in entry
          ? await checkAsk(deps, entry, now)
          : 'history' in entry
            ? await checkHistory(deps, entry)
            : await checkEntities(deps, entry);
      if (!checked.ok)
        throw new Error(`A read failed while checking "${scenario.name}": ${checked.error.message}`);
      expectations.push(checked.value);
    }
    const passed = stepFailure === null && expectations.every((result) => result.passed);
    return { name: scenario.name, stepFailure, expectations, passed };
  } finally {
    await opened.value.close();
  }
}
