// The code base map of FL-084 (ADR 0024): the top-level declarations of the repository at HEAD,
// recorded as `defined_in` facts by maintenance, so the map does not depend on the agent. Each
// run reconciles the map with HEAD: a new declaration is recorded, one that moved to another file
// is continued there, and one gone from every file is ended. A declaration already mapped at the
// same path is left alone, so a run on an unchanged commit writes nothing.
import {
  endFact,
  type FactWithSources,
  type Namespace,
  type OperationDeps,
  ok,
  type Result,
} from '@factloom/core';
import { checkForSecrets } from './check-for-secrets.ts';
import { type Declaration, isMappedSourcePath, readDeclarations } from './read-declarations.ts';
import { recordStructuredFacts } from './record-structured-facts.ts';
import type { StructuredFactInput } from './structured-fact-input.ts';

/** What the map reads of a repository, at commits, never the working tree. */
export type CodebaseReader = {
  /** The commit `HEAD` names. */
  readonly readHead: () => Promise<Result<string>>;
  /** The paths of the files at a commit, from the repository root. */
  readonly listFiles: (commit: string) => Promise<Result<readonly string[]>>;
  /** The text of a path at a commit, or null when the path does not exist there. */
  readonly readText: (commit: string, path: string) => Promise<Result<string | null>>;
};

/** What one run did, for the maintenance report. */
export type CodebaseMapCounts = {
  readonly declarations: number;
  readonly recorded: number;
  readonly moved: number;
  readonly ended: number;
  readonly unchanged: number;
  readonly failed: number;
  readonly skipped: {
    /** Names declared in more than one file. */
    readonly ambiguous: number;
    /** Declarations whose statement the secret check refused. */
    readonly secret: number;
    /** Files over the size limit, which were not read. */
    readonly tooLarge: number;
    /** Writes left for the next run. */
    readonly overLimit: number;
  };
};

/** The largest file read, in characters: source this long is generated, not written. */
export const MAP_FILE_SIZE_LIMIT = 200_000;

/** The most files one run reads, and the most facts it writes; the rest wait for the next run. */
const DEFAULT_LIMITS = { files: 5_000, factsPerRun: 1_000 };

/** The most current map facts one run reads back. */
const MAP_FACT_READ_LIMIT = 20_000;

const PREDICATE = 'defined_in';

/** The statement of a declaration's fact: its name, its path and what its comment says. */
function describeDeclaration(declaration: Declaration, path: string): string {
  return declaration.summary === null
    ? `${declaration.name} is defined in ${path}.`
    : `${declaration.name}, in ${path}: ${declaration.summary}`;
}

/** The path a map fact holds, or null when its object is not a value. */
function pathOf(found: FactWithSources): string | null {
  return found.fact.object.kind === 'value' ? found.fact.object.value : null;
}

type ReadTree = {
  /** For each name declared once, its path and declaration. */
  readonly declared: ReadonlyMap<string, { readonly path: string; readonly declaration: Declaration }>;
  readonly ambiguous: ReadonlySet<string>;
  readonly declarationCount: number;
  readonly tooLarge: number;
};

/** Reads the declarations of every mapped file at a commit. */
async function readTree(
  repository: CodebaseReader,
  head: string,
  fileLimit: number,
): Promise<Result<ReadTree>> {
  const files = await repository.listFiles(head);
  if (!files.ok) return files;
  const seen = new Map<string, { readonly path: string; readonly declaration: Declaration }[]>();
  let tooLarge = 0;
  let declarationCount = 0;
  for (const path of files.value.filter(isMappedSourcePath).sort().slice(0, fileLimit)) {
    const text = await repository.readText(head, path);
    if (!text.ok) return text;
    if (text.value === null) continue;
    if (text.value.length > MAP_FILE_SIZE_LIMIT) {
      tooLarge += 1;
      continue;
    }
    for (const declaration of readDeclarations(text.value)) {
      declarationCount += 1;
      seen.set(declaration.name, [...(seen.get(declaration.name) ?? []), { path, declaration }]);
    }
  }
  const declared = new Map<string, { readonly path: string; readonly declaration: Declaration }>();
  const ambiguous = new Set<string>();
  for (const [name, places] of seen) {
    const [only, ...others] = places;
    if (only !== undefined && others.length === 0) declared.set(name, only);
    else ambiguous.add(name);
  }
  return ok({ declared, ambiguous, declarationCount, tooLarge });
}

/** The current map facts of a namespace, by symbol name. */
async function readCurrentMap(
  deps: OperationDeps,
  namespace: Namespace,
): Promise<Result<ReadonlyMap<string, FactWithSources>>> {
  const now = deps.now();
  const found = await deps.store.listFacts({
    namespace,
    subjectEntityId: null,
    predicate: PREDICATE,
    touchingEntityIds: null,
    supersededByFactId: null,
    time: { validAt: now, knownAt: now },
    limit: MAP_FACT_READ_LIMIT,
  });
  if (!found.ok) return found;
  return ok(
    new Map(
      found.value
        .filter((entry) => entry.subject.type === 'symbol')
        .map((entry) => [entry.subject.name, entry]),
    ),
  );
}

/**
 * Reconciles the code base map of a namespace with the repository at HEAD (FL-084, ADR 0024).
 * Records a `defined_in` fact for each top-level declaration of a mapped source file not yet in
 * the map, its source the file at HEAD; continues a fact whose declaration moved to another file
 * at the new path, as a succession with the reason `source_changed`; and ends a fact whose
 * declaration is gone from every file read. A name declared in more than one file, a statement
 * the secret check refuses, and a file over the size limit are left out, and counted. A fact
 * about a file the map does not read is left alone. Fails as a whole, before writing, when the
 * repository cannot be read.
 */
export async function recordCodebaseMap(
  deps: OperationDeps & { readonly repository: CodebaseReader },
  input: {
    readonly namespace: Namespace;
    readonly limits?: { readonly files?: number; readonly factsPerRun?: number };
  },
): Promise<Result<CodebaseMapCounts>> {
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const head = await deps.repository.readHead();
  if (!head.ok) return head;
  const tree = await readTree(deps.repository, head.value, limits.files);
  if (!tree.ok) return tree;
  const map = await readCurrentMap(deps, input.namespace);
  if (!map.ok) return map;

  const counts = { recorded: 0, moved: 0, ended: 0, unchanged: 0, failed: 0, secret: 0, overLimit: 0 };
  let writes = 0;
  const hasRoom = () => {
    if (writes < limits.factsPerRun) return true;
    counts.overLimit += 1;
    return false;
  };
  const source = (path: string) =>
    ({ kind: 'file', locator: path, version: head.value, content: null, observedAt: deps.now() }) as const;
  const context = {
    namespace: input.namespace,
    trigger: 'maintenance',
    reasonCode: 'source_changed',
  } as const;

  const newByPath = new Map<string, StructuredFactInput[]>();
  for (const [name, { path, declaration }] of tree.value.declared) {
    const statement = describeDeclaration(declaration, path);
    const stored = map.value.get(name);
    if (stored !== undefined && pathOf(stored) === path) {
      counts.unchanged += 1;
      continue;
    }
    if (!checkForSecrets([{ name: 'statement', value: statement }]).ok) {
      counts.secret += 1;
      continue;
    }
    if (!hasRoom()) continue;
    writes += 1;
    if (stored === undefined) {
      const facts = newByPath.get(path) ?? [];
      facts.push({
        subject: { type: 'symbol', name },
        predicate: PREDICATE,
        object: { kind: 'value', value: path },
        statement,
        confidence: 1,
        validFrom: null,
        validTo: null,
      });
      newByPath.set(path, facts);
      continue;
    }
    const now = deps.now();
    const moved = await endFact(deps, {
      ...context,
      factId: stored.fact.id,
      validTo: now,
      source: source(path),
      successor: {
        fact: {
          subjectEntityId: stored.fact.subjectEntityId,
          predicate: PREDICATE,
          object: { kind: 'value', value: path },
          statement,
          confidence: 1,
          validFrom: now,
          validTo: null,
        },
        newEntities: [],
      },
    });
    if (moved.ok) counts.moved += 1;
    else counts.failed += 1;
  }

  for (const [path, facts] of newByPath) {
    const recorded = await recordStructuredFacts(deps, {
      namespace: input.namespace,
      facts,
      source: { kind: 'file', locator: path, version: head.value },
      trigger: 'maintenance',
    });
    if (recorded.ok)
      counts.recorded += recorded.value.facts.filter((fact) => fact.outcome === 'recorded').length;
    else counts.failed += facts.length;
  }

  // A declaration gone from every file read. Not when a file was too large to read, since the
  // declaration may be in it, and not for a name that is ambiguous now.
  for (const [name, stored] of map.value) {
    const path = pathOf(stored);
    if (path === null || !isMappedSourcePath(path) || tree.value.declared.has(name)) continue;
    if (tree.value.ambiguous.has(name) || tree.value.tooLarge > 0) continue;
    if (!hasRoom()) continue;
    writes += 1;
    const ended = await endFact(deps, {
      ...context,
      factId: stored.fact.id,
      validTo: deps.now(),
      source: source(path),
      successor: null,
    });
    if (ended.ok) counts.ended += 1;
    else counts.failed += 1;
  }

  return ok({
    declarations: tree.value.declarationCount,
    recorded: counts.recorded,
    moved: counts.moved,
    ended: counts.ended,
    unchanged: counts.unchanged,
    failed: counts.failed,
    skipped: {
      ambiguous: tree.value.ambiguous.size,
      secret: counts.secret,
      tooLarge: tree.value.tooLarge,
      overLimit: counts.overLimit,
    },
  });
}
