# EPIC-01: Workspace and tooling

| | |
|---|---|
| Status | Pending |
| Phases | 0-1 |
| Packages | Repository root, and every package: `packages/core`, `packages/graph-rag`, `packages/storage`, `apps/mcp-server` |
| Requirements | REQ-12, REQ-28, REQ-29 |

Nothing in this epic is implemented. Terms are used as defined in [`GLOSSARY.md`](../../../GLOSSARY.md).

## Outcome

The repository becomes a pnpm workspace that checks itself. One command runs the format check, lint, type check and tests, and a forbidden import between packages fails that command without anyone remembering the rule. The same command runs in continuous integration on Linux and on macOS arm64, and before phase 1 closes a job installs the packed server on a clean machine and starts it.

## Scope

- The pnpm workspace: three library packages and one app, each private, each with one public entry.
- The root configuration for TypeScript, Biome and Vitest, and the scripts `pnpm check`, `pnpm test` and `pnpm format`.
- The automatic enforcement of the import rules in [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md), with the proof that each rule fails when broken.
- A continuous integration workflow on Linux and macOS arm64.
- A second command, `pnpm eval`, for what needs the real embedding model, and a separate workflow job that runs it.
- One check that every dependency version in the workspace is exact.
- A clean-install job on Linux and on macOS arm64: build for publishing, pack, install with no other service, start, and list the tools.

## Out of scope

- Any feature code. The first types are in [EPIC-02](EPIC-02.md).
- The `packages/maintenance` package and its boundary rules: FL-040 in EPIC-08.
- The evals. They are a directory inside `apps/mcp-server`, not a workspace member: FL-027 in [EPIC-07](EPIC-07.md).
- Publishing a package to a registry. FL-003 builds and packs; nothing is published in phases 0 to 3.
- A pre-commit hook. `pnpm check` is run by hand before a commit ([`CLAUDE.md`](../../../CLAUDE.md)) and by continuous integration after a push.
- Registering the server with Claude Code and Codex on the owner's machine: FL-038 in EPIC-06.

## Boundaries and constraints

- **Toolchain** ([ADR 0015](../../architecture/adr/0015-toolchain.md)): TypeScript 7 with the listed strict options, Biome for format and lint, Vitest for tests, no build step in development, Node `^22.18.0 || >=24`, pnpm pinned through `packageManager`. The versions that were verified are in the [toolchain research](../../research/technical/toolchain.md), "Final table".
- **Three packages and one app** ([ADR 0001](../../architecture/adr/0001-typescript-pnpm-monorepo-with-four-packages.md)). No empty package is created for a later phase.
- **Dependencies point inward** ([ADR 0003](../../architecture/adr/0003-dependencies-point-inward-with-manual-injection.md), [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md)). The import table there is the specification of the lint rules.
- **Work on `main` only, and never commit a secret** ([git rules](../../../.claude/rules/git.md)). The workflow needs no secret in phases 0 and 1.
- **Do not state a version, an API or a command from memory** ([engineering principles](../../../.claude/rules/engineering-principles.md)). Where a work item below needs a value that no research document records, such as a runner label or an action version, the implementer reads it from the vendor's documentation and cites the page in the commit.

## Dependencies

- FL-003 needs the smoke test of EPIC-06 (FL-037), because the clean-install job starts the same server and makes the same first calls.
- No other epic is needed. Every other epic depends on FL-001.

## Deliverables

- A workspace in which `pnpm install` and `pnpm check` succeed on a fresh clone.
- Recorded proof that a forbidden import, a deep import and non-erasable syntax each fail the check.
- A continuous integration workflow with a Linux job and a macOS arm64 job.
- A clean-install job that reports the installed size.
- The `pnpm eval` command and its workflow job.

## Success criteria

- On a fresh clone, `pnpm install` followed by `pnpm check` exits 0 on Linux and on macOS arm64, shown by a workflow run.
- Adding `import '@factloom/storage'` to a source file of `core` makes `pnpm check` exit non-zero, with a message that names the rule.
- A server installed from packed archives into an empty directory starts and lists the five phase 1 tools, shown by a workflow run on Linux and on macOS arm64.
- Open questions Q-03 and Q-22 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) are closed with the recorded results.

## Work items

| ID | Title | Phase | Depends on | Status |
|---|---|---|---|---|
| FL-001 | Scaffold the pnpm workspace with one check command | 0 | None | Completed |
| FL-002 | Run the check in continuous integration on Linux and macOS arm64 | 0 | FL-001 | Completed |
| FL-003 | Install the packed server on a clean machine in CI | 1 | FL-002, FL-037 | Completed |

### FL-001: Scaffold the pnpm workspace with one check command

| | |
|---|---|
| Status | Completed |
| Phase | 0 |
| Depends on | None |
| Requirements | REQ-12, REQ-28 |
| Components | Repository root, `packages/core`, `packages/graph-rag`, `packages/storage`, `apps/mcp-server` |

**Objective.** Create the workspace and its one check command, and prove that the import rules are enforced by tools.

**Background.** The repository holds documents and spikes only. [ADR 0015](../../architecture/adr/0015-toolchain.md) fixes the toolchain, and the [toolchain research](../../research/technical/toolchain.md) ran most of it on Linux with Node 22. Three things were not run in the no-build setup and are left to this work item by ADR 0015 and by [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): the three compiler options `erasableSyntaxOnly`, `verbatimModuleSyntax` and `allowImportingTsExtensions` together in a workspace, the Biome rule against a forbidden import, and a lint rule against a deep import. The last was never run at all. This is open question Q-22.

**Outcome.** An engineer clones the repository, runs `pnpm install` and `pnpm check`, and gets exit code 0. An import that breaks the table in `SYSTEM-BOUNDARIES.md` fails the check with a message that names the rule.

**Scope.**
- Root `package.json`, private, with `packageManager`, the Node `engines` range from ADR 0015, the scripts `check`, `test` and `format` named in [`CLAUDE.md`](../../../CLAUDE.md), and the script `eval` that [`TESTING.md`](../../architecture/TESTING.md) describes.
- One test that every dependency version in the workspace is exact.
- `pnpm-workspace.yaml` listing `packages/*` and `apps/*`, with a catalog that pins each shared version once.
- Three library packages, `@factloom/core`, `@factloom/graph-rag` and `@factloom/storage`, each with `package.json`, a `tsconfig.json` that extends the root base, `src/index.ts`, a short `README.md` and one placeholder test.
- The app `apps/mcp-server` with the same files, except that its entry is `src/main.ts` and it exports nothing ([`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md)).
- Root TypeScript configuration: a shared base, and one flat type-check configuration that emits nothing.
- Root `biome.json` with the formatter, the recommended lint rules and the import rules per package.
- One root Vitest configuration with an explicit include list.
- The proofs listed under acceptance criteria, each added, shown to fail, and removed.
- Small corrections to the documents that say the workspace does not exist yet.

**Non-goals.**
- Feature code of any kind. No type, schema, interface or operation from [`INTERFACES.md`](../../architecture/INTERFACES.md) is written here; FL-004 is the first.
- Runtime dependencies. `zod`, `better-sqlite3`, `sqlite-vec`, the MCP SDK, the Anthropic SDK and the embedding library are each added by the first work item that imports them.
- A build step, a `dist` directory or project references. A build is added in FL-003.
- Continuous integration: FL-002.
- A pre-commit hook.
- `packages/maintenance` (FL-040) and the evals directory of the app (FL-027).

**Functional requirements.**
1. `pnpm check` runs four stages in this order and stops at the first failure: format check, lint, type check, tests. It exits 0 only if all four pass.
2. `pnpm test` runs the tests only. `pnpm format` rewrites files to the project format.
3. A source file in `core` that imports another `@factloom` package fails the check. So does a source file in `graph-rag` that imports `@factloom/storage`, and one in `storage` that imports `@factloom/graph-rag`.
4. An import that reaches into another package's files fails the check, in both forms shown in the [architecture rules](../../../.claude/rules/architecture.md): by package name with a path, and by a relative path that leaves the package.
5. An `enum`, a `namespace` and a constructor parameter property each fail the type check. A type imported without `import type` fails the type check.
6. A workspace package runs from source with plain `node` and no flag: the app's entry, which imports `@factloom/core` by name, runs and exits 0.
7. Each placeholder test passes, and the test in `graph-rag`, `storage` and the app imports `@factloom/core` by name, so that resolution across packages is exercised by Vitest.
8. `pnpm check` needs no network, no API key and no embedding model, now and after every later work item ([`TESTING.md`](../../architecture/TESTING.md), "Four kinds of test").
9. `pnpm eval` exists as a second command for the tests that need the real embedding model. It selects test files by a naming rule that the Vitest configuration of `pnpm check` excludes. In this item no such file exists, so the command runs nothing and exits 0. FL-026 adds the first.
10. One test, run by `pnpm check`, reads every `package.json` of the workspace and the catalog in `pnpm-workspace.yaml`, resolves each `catalog:` entry, and fails when any dependency version is a range or a tag and not one exact version. This is the only pin test in the roadmap: the items that add the MCP SDK, the Anthropic SDK and the embedding library rely on it.

**Technical requirements.**
1. Versions are the ones verified on 2026-11-13 in the [toolchain research](../../research/technical/toolchain.md), "Final table": pnpm 12.18.0, TypeScript 7.0.2, Biome 2.6.7, Vitest 5.1.0, `@types/node` on the 22 line. If a newer version is chosen, it is read from the registry on the day, and the version, the command and the date are stated in the commit message.
2. Every version is exact, with no range, and is pinned once in the pnpm catalog.
3. Every `package.json` has `"private": true` and `"type": "module"`. Each library package has exactly one export, `"."`, pointing at `./src/index.ts`. The app has no `exports`.
4. Each `package.json` declares only the workspace dependencies that the import table allows: `graph-rag` and `storage` declare `@factloom/core`; the app declares all three; `core` declares none.
5. Compiler options are those of ADR 0015: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `NodeNext` modules, `erasableSyntaxOnly`, `verbatimModuleSyntax` and `allowImportingTsExtensions`. The type check emits nothing. `rewriteRelativeImportExtensions`, `composite` and the declaration options from the research's build configuration are not set.
6. Import rules use Biome's `noRestrictedImports` in a per-package `overrides` block, the form the research ran. Each block forbids the packages and libraries in that package's "must not import" column. The rule against deep imports was not run in the research; the implementer finds the form that works and records it.
7. Vitest uses one root configuration with an include list. Glob `projects` are not used, for the reason recorded in the research.
8. `spikes/` stays outside the workspace and outside the format check, lint and type check. Spikes keep their own `npm ci`.
9. A placeholder `src/index.ts` exports the least that lets another package import it and a test assert on it. It is replaced by the first real export.

**Constraints.**
- [ADR 0015](../../architecture/adr/0015-toolchain.md): toolchain, compiler options, no build step in development.
- [ADR 0001](../../architecture/adr/0001-typescript-pnpm-monorepo-with-four-packages.md): three packages and one app, and no package for a later phase.
- [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md): the import table, and one public entry per package.
- [Engineering principles](../../../.claude/rules/engineering-principles.md): pinned versions, each dependency with a stated reason, no empty placeholder files beyond what the checks need.
- [Git rules](../../../.claude/rules/git.md): one logical change per commit. No proof is committed in its failing state.

**Acceptance criteria.**
- [x] On a fresh clone, `pnpm install` exits 0 and `pnpm check` exits 0. The full output of `pnpm check` is recorded, and it shows the four stages.
- [x] Forbidden import: `import '@factloom/storage'` is added to a source file of `core`. `pnpm check` exits non-zero and the output names the import rule. The output is recorded, the line is removed, and `pnpm check` exits 0 again.
- [x] Forbidden import with the dependency declared: `@factloom/storage` is also added to the dependencies of `core` and installed. `pnpm check` still exits non-zero at the lint stage. The output is recorded and both changes are removed.
- [x] The same proof is run for `graph-rag` importing `@factloom/storage` and for `storage` importing `@factloom/graph-rag`, with the output recorded.
- [x] Deep import by package name: a source file in `graph-rag` imports a file inside `@factloom/core` other than its entry. `pnpm check` exits non-zero. The output is recorded and the line removed.
- [x] Deep import by relative path: a source file in `graph-rag` imports a file of `core` through a relative path that leaves the package. `pnpm check` exits non-zero. The output is recorded and the line removed.
- [x] Non-erasable syntax: an `enum` is added to a source file. `pnpm check` exits non-zero at the type check. The output is recorded and the enum removed. The same is done, one at a time, for a `namespace`, for a constructor parameter property, and for a type imported without `import type`.
- [x] Unit test "every dependency version in the workspace is exact" passes. With one version in the catalog changed to a range, as a trial, it fails and names the dependency. The output is recorded and the change removed.
- [x] `pnpm eval` exits 0 and reports that it found no test.
- [x] `grep -L '"private": true' package.json packages/*/package.json apps/*/package.json` prints nothing.
- [x] `node apps/mcp-server/src/main.ts` exits 0 with no warning printed and no `dist` directory in the repository.
- [x] `git grep -n "from '@factloom" -- packages apps` shows only imports of placeholder exports. No file under `packages/` or `apps/` contains a type, schema or function named in [`INTERFACES.md`](../../architecture/INTERFACES.md).
- [x] `git status --short` is empty after `pnpm check`: the check writes no file.

**Validation.** `pnpm check` on a fresh clone; the failing proofs above, each run by hand with the output kept: four forbidden imports, two deep imports, four kinds of non-erasable syntax and one unpinned version; the placeholder unit tests and the pin test.

**Completion evidence.** The commits. The recorded output of the passing `pnpm check` and of each failing proof, placed in this work item when its status changes. The sentence in [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md) that calls the lint rules planned is replaced by what was run. Q-22 in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) is closed with the result. The note in `CLAUDE.md` that only spikes run is removed.

**Recorded evidence.** Completed on 2026-11-14 on Linux x64 with Node.js v22.23.4 and pnpm 12.18.0. The owner then ran it on macOS arm64 (see the end of this evidence); FL-002 makes that automatic. Each failing proof was added, run and removed; none was committed.

Commits: `build: add pnpm workspace`, `build: add typescript config`, `build: add biome config with package boundary rules`, one `build: add ... package` commit for each of the four workspace members, `test: add vitest config and placeholder tests`, and `test: add the test that every dependency version is exact`.

`pnpm install --frozen-lockfile` and `pnpm check` on a fresh clone of `main`:

```text
$ pnpm run check:format && pnpm run check:lint && pnpm run check:types && pnpm run test
$ biome format .
Checked 25 files in 4ms. No fixes applied.
$ biome lint .
Checked 25 files in 8ms. No fixes applied.
$ tsc -p tsconfig.json
$ vitest run
 RUN  v5.1.0 <clone>
 Test Files  5 passed (5)
      Tests  6 passed (6)
   Start at  21:42:55
   Duration  277ms (transform 57%, import 27%, tests 9%, worker 8%)
exit code: 0
```

Forbidden imports. The lint stage stops the check and names the rule:

```text
added to packages/core/src/index.ts: import '@factloom/storage';
$ pnpm run check:format && pnpm run check:lint && pnpm run check:types && pnpm run test
$ biome format .
$ biome lint .
packages/core/src/index.ts:7:8 lint/style/noRestrictedImports
  × core is the innermost package. It must not import another @factloom package.
Found 1 error.
exit code: 1

With the dependency also declared in core's package.json and installed (pnpm warns: "There are cyclic workspace dependencies"):
added to packages/core/src/index.ts: import '@factloom/storage';
$ biome format .
$ biome lint .
packages/core/src/index.ts:7:8 lint/style/noRestrictedImports
  × core is the innermost package. It must not import another @factloom package.
Found 1 error.
exit code: 1

added to packages/graph-rag/src/index.ts: import '@factloom/storage';
$ pnpm run check:format && pnpm run check:lint && pnpm run check:types && pnpm run test
$ biome format .
$ biome lint .
packages/graph-rag/src/index.ts:8:8 lint/style/noRestrictedImports
  × graph-rag must not import @factloom/storage, and imports other packages by name only. It reaches storage through the MemoryStore interface in core.
Found 1 error.
exit code: 1

added to packages/storage/src/index.ts: import '@factloom/graph-rag';
$ pnpm run check:format && pnpm run check:lint && pnpm run check:types && pnpm run test
$ biome format .
$ biome lint .
packages/storage/src/index.ts:8:8 lint/style/noRestrictedImports
  × storage must not import @factloom/graph-rag, and imports other packages by name only.
Found 1 error.
exit code: 1
```

Deep imports, by package name and by a relative path that leaves the package:

```text
added to packages/graph-rag/src/index.ts: import '@factloom/core/src/index.ts';
$ pnpm run check:format && pnpm run check:lint && pnpm run check:types && pnpm run test
$ biome format .
$ biome lint .
packages/graph-rag/src/index.ts:8:8 lint/style/noRestrictedImports
  × graph-rag must not import @factloom/storage, and imports other packages by name only. It reaches storage through the MemoryStore interface in core.
Found 1 error.
exit code: 1

added to packages/graph-rag/src/index.ts: import '../../core/src/index.ts';
$ pnpm run check:format && pnpm run check:lint && pnpm run check:types && pnpm run test
$ biome format .
$ biome lint .
packages/graph-rag/src/index.ts:8:8 lint/style/noRestrictedImports
  × graph-rag must not import @factloom/storage, and imports other packages by name only. It reaches storage through the MemoryStore interface in core.
Found 1 error.
exit code: 1
```

Syntax that Node.js cannot erase, and a type imported without `import type`. The type check stops the check:

```text
added to packages/core/src/index.ts: export enum Trigger { Agent, Person }
$ biome format .
$ biome lint .
$ tsc -p tsconfig.json
packages/core/src/index.ts(7,13): error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
exit code: 1

added to packages/core/src/index.ts: export namespace Facts { export const count = 1; }
$ biome format .
$ biome lint .
$ tsc -p tsconfig.json
packages/core/src/index.ts(7,18): error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
exit code: 1

added to packages/core/src/index.ts: export class Holder { constructor(private readonly value: string) {} read(): string { return this.value; } }
$ biome format .
$ biome lint .
$ tsc -p tsconfig.json
packages/core/src/index.ts(8,15): error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
exit code: 1

added to packages/graph-rag/src/index.ts: import { Fact } from './fact-type.ts'; export const noFact: Fact | null = null;
$ biome format .
$ biome lint .
packages/graph-rag/src/index.ts:8:8 lint/style/useImportType  FIXABLE
Found 1 warning.
$ tsc -p tsconfig.json
packages/graph-rag/src/index.ts(8,10): error TS1484: 'Fact' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.
exit code: 1
```

An inexact version, `pnpm eval`, private packages, running from source, and a clean tree after the check:

```text
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  scripts/exact-versions.test.ts > the workspace > pins every dependency to one exact version
AssertionError: expected [ 'catalog: vitest is "^5.1.0"' ] to deeply equal []
+   "catalog: vitest is \"^5.1.0\"",
      Tests  1 failed | 1 passed (2)
exit code: 1

RUN  v5.1.0 /home/user/factloom
No test files found, exiting with code 0
include: packages/*/src/**/*.eval.test.ts, apps/*/src/**/*.eval.test.ts, apps/*/evals/**/*.eval.test.ts
exclude:  **/node_modules/**
exit code: 0

grep -L '"private": true' package.json packages/*/package.json apps/*/package.json prints:
(end)

factloom mcp-server: not implemented yet (wired from @factloom/core)
exit code: 0
dist directories: 0

pnpm check exit code: 0
(tracked files changed: 0)
```

What was found on the way:

- The rule against deep imports works as one `noRestrictedImports` pattern group, `@factloom/*/**` and `**/src/**`. The second pattern catches a relative path into another package, because an import inside a package never passes through a `src` segment. A Biome override replaces the rule's options for its files, so each per-package block repeats the two patterns.
- The app has no `src/index.ts`, as [`SYSTEM-BOUNDARIES.md`](../../architecture/SYSTEM-BOUNDARIES.md) says; its entry is `src/main.ts`.
- `@types/node` is pinned at 22.19.0, the version the research verified. The check script runs its four stages as four named scripts, so each can be run alone.

Run by the owner on 2026-11-14, on a MacBook Air with Apple Silicon, Node.js v24.22.1 and pnpm 12.18.0, after `git pull`. This is the first run on macOS arm64 and on Node.js 24. pnpm downloaded the `darwin-arm64` builds of Biome, TypeScript and Rolldown:

```text
$ pnpm install
Downloading @rolldown/binding-darwin-arm64@1.2.19: 8.02 MB/8.02 MB, done
Downloading @biomejs/cli-darwin-arm64@2.6.7: 31.96 MB/31.96 MB, done
Downloading @typescript/typescript-darwin-arm64@7.0.2: 9.27 MB/9.27 MB, done
Done in 2.4s using pnpm v12.18.0
$ pnpm check
$ biome format .
Checked 25 files in 8ms. No fixes applied.
$ biome lint .
Checked 25 files in 7ms. No fixes applied.
$ tsc -p tsconfig.json
$ vitest run
 Test Files  5 passed (5)
      Tests  6 passed (6)
```

On the same machine, `node apps/mcp-server/src/main.ts` ran from source with no flag and no warning. The native SQLite modules are not part of the scaffold; the owner ran them separately in [`spikes/fact-schema`](../../../spikes/fact-schema/README.md), where all 31 checks passed.

### FL-002: Run the check in continuous integration on Linux and macOS arm64

| | |
|---|---|
| Status | Completed |
| Phase | 0 |
| Depends on | FL-001 |
| Requirements | REQ-28, REQ-29 |
| Components | Repository root (the workflow definition) |

**Objective.** Run `pnpm check` on every push to `main`, on Linux and on macOS arm64, so that a failure on either is seen without the owner's machine.

**Background.** Everything in the research ran on Linux x64 with Node 22. Open questions Q-03, Q-04 and Q-05 ask whether the toolchain and the no-build setup behave the same on macOS arm64 and on later Node lines. Q-01 asks whether `better-sqlite3` and `sqlite-vec` load on macOS arm64 from their published binaries; only the package contents were inspected ([spike](../../../spikes/sqlite-vec-fts5/README.md), "What to expect on macOS"). [`TESTING.md`](../../architecture/TESTING.md), "Continuous integration", plans this job. The macOS job is also the first Apple Silicon run of the native SQLite modules inside the workspace, once the SQLite adapter exists (FL-014).

**Outcome.** Every push to `main` shows a pass or a failure per operating system. The owner learns of a macOS-only failure from the workflow run.

**Scope.**
- One GitHub Actions workflow that runs on a push to `main`.
- Two jobs from one definition: a Linux runner and a macOS arm64 runner.
- Each job: check out, install the pinned pnpm and a Node version, install dependencies from the lockfile, run `pnpm check`.
- A second, manually started job on the macOS arm64 runner that runs the two spikes, to answer Q-01 before the SQLite adapter exists.
- A third job, separate from the check, that runs `pnpm eval`. It is started by hand or on a schedule, not on every push.

**Non-goals.**
- The clean-install job: FL-003.
- Running on the owner's machine, and macOS loading rules for a file installed by hand (Q-02): FL-038.
- Windows.
- Release, publishing or deployment steps.
- Caching beyond what the setup action for Node provides by default.

**Functional requirements.**
1. A push to `main` starts the workflow. Each job fails if `pnpm check` exits non-zero.
2. The matrix has two operating systems and two Node lines: the lowest line the `engines` range allows, and the Active LTS line on the day the workflow is written, read from the Node release schedule cited in the [toolchain research](../../research/technical/toolchain.md).
3. The install step fails when the lockfile does not match the manifests. It does not change the lockfile.
4. Each job prints `node --version`, `pnpm --version`, the operating system and the processor architecture before the check.
5. The manual job runs `cd spikes/sqlite-vec-fts5 && npm ci && node spike.mjs` and `cd spikes/fact-schema && npm ci && node check.mjs` on the macOS arm64 runner.
6. The eval job runs `pnpm eval` on one named runner. It has network access, because the first run downloads the embedding model, and it keeps the model's cache directory between runs with the cache action. Until FL-026 adds the first eval-time test, the job runs nothing and passes. The check jobs need no model and no cache for one.

**Technical requirements.**
1. Every action is pinned to a full commit hash, with the release it corresponds to in a comment.
2. The runner label for macOS arm64 is read from GitHub's documentation of hosted runners, and the job asserts the architecture at run time so that a label that changes meaning fails the job.
3. pnpm is installed at the version in `packageManager`. The way it is installed is read from the pnpm documentation and cited in the commit.
4. The workflow uses no secret and requests read-only permission on the repository contents.

**Constraints.**
- [Git rules](../../../.claude/rules/git.md): work on `main` only, so the workflow has no branch or pull request trigger; the repository is public, so no secret is printed or stored.
- [ADR 0015](../../architecture/adr/0015-toolchain.md): the Node range and the pinned pnpm.
- [Engineering principles](../../../.claude/rules/engineering-principles.md): no command or version stated from memory.

**Acceptance criteria.**
- [x] A push to `main` produces a workflow run in which all four matrix jobs end in success. The run's address is recorded.
- [x] The macOS job's log shows `arm64` as the architecture and the four stages of `pnpm check`.
- [x] The manual job is started once. Its log ends with `SPIKE OK` for the first spike and with the line `31 checks passed` for the second, and shows `platform: 'darwin-arm64'`. If either fails, the exact error is recorded and the item is `Blocked` on Q-01.
- [x] The eval job is started once by hand and ends in success. Its address is recorded.
- [x] `grep -n "uses:" <workflow file>` shows a 40-character commit hash on every line.
- [x] The workflow file contains no `secrets.` reference.

**Validation.** The workflow run itself. There is no local test; the definition is proved by running it.

**Completion evidence.** The commit, the address of the passing workflow run, and the log lines named above. Q-03 is closed in [`OPEN-QUESTIONS.md`](../../research/OPEN-QUESTIONS.md) with the result. Q-01, Q-04 and Q-05 are updated with what the runs showed and what remains: the owner's own machine, and Node lines not in the matrix.

**Recorded evidence.** Completed on 2026-11-14. The workflow is `.github/workflows/ci.yml`, added in the commit `ci: run the check on Linux and macOS arm64`, whose message cites where each pinned version and runner label was read.

| Run | Started by | Result | Address |
|---|---|---|---|
| Check, four matrix jobs | The push of the workflow to `main` | Success | https://github.com/Enriquez-Johnmark/factloom/actions/runs/43645710880 |
| Spikes on macOS arm64 | By hand (`job: spikes`) | Success | https://github.com/Enriquez-Johnmark/factloom/actions/runs/43645725433 |
| Eval | By hand (`job: eval`) | Success | https://github.com/Enriquez-Johnmark/factloom/actions/runs/43645728291 |

The four matrix jobs are `ubuntu-24.04` and `macos-26`, each with Node.js 22 and 26. From the log of the `macos-26`, Node.js 26 job, read after it finished:

```text
$ tsc -p tsconfig.json
$ vitest run
 Test Files  5 passed (5)
      Tests  6 passed (6)
Run node apps/mcp-server/src/main.ts
factloom mcp-server: not implemented yet (wired from @factloom/core)
```

Each macOS job has a step that fails unless `uname -m` prints `arm64`; it passed in all three macOS jobs.

From the log of the spikes job, on `macos-26` with Node.js v22.23.4. Its first step, `npm ci && node spike.mjs`, succeeded; its second ended with:

```text
31 checks passed on SQLite 3.54.1, sqlite-vec v0.1.9, Node v22.23.4
```

The eval job ran `pnpm eval`, found no test file, and exited 0, as expected until FL-026.

`grep -n "uses:" .github/workflows/ci.yml` shows a 40-character commit hash on every line, and the file contains no `secrets.` reference.

What was not read directly: the lines `SPIKE OK` and `platform: 'darwin-arm64'` in the first spike's output. That step's success, the architecture assertion before it, and the same spike's recorded output on Linux are the evidence for them. The owner's own Mac run of the second spike is recorded in [`spikes/fact-schema`](../../../spikes/fact-schema/README.md).

Two choices made while writing the workflow:

- The check, the spikes and the eval are three jobs in one workflow file. The check runs on a push; the other two run only when started by hand, and a manual start runs only the job that was chosen.
- The check jobs also run `node apps/mcp-server/src/main.ts`, so that running from source with no build step is proved on each operating system and Node.js line, not only by the tests.

### FL-003: Install the packed server on a clean machine in CI

| | |
|---|---|
| Status | Completed |
| Phase | 1 |
| Depends on | FL-002, FL-037 |
| Requirements | REQ-12, REQ-29, REQ-11 |
| Components | Repository root (build configuration, workflow), `apps/mcp-server` |

**Objective.** Prove on every push that the server, installed from packed archives into an empty directory with no other service, starts and answers.

**Background.** Requirement REQ-CA-08 of the [competitive analysis](../../research/evaluations/competitive-analysis.md), section 7: several memory projects studied did not start on a fresh install because a dependency had moved. In development the packages run from TypeScript source ([ADR 0015](../../architecture/adr/0015-toolchain.md)). Node refuses to strip types from a file that is a real copy under `node_modules`, which the [toolchain research](../../research/technical/toolchain.md) ran, so an installed server needs compiled JavaScript. ADR 0015 leaves that build to the moment a package is first packed. The compiler accepts `allowImportingTsExtensions` when it emits only with `rewriteRelativeImportExtensions` set, as the same ADR records.

**Outcome.** A workflow job fails when the packed server cannot be installed or started on Linux or on macOS arm64, and it reports the installed size. The packages stay private and nothing is published.

**Scope.**
- A build for packing: compiled JavaScript for the four workspace members, produced by one command, used only by this job.
- Packing the server so that it can be installed outside the workspace.
- A clean-install job that runs on Linux and on macOS arm64, the two runners of FL-002. On each it installs the archives into an empty directory, starts the server over stdio, and makes the calls below.
- A report of the installed size in the job log.

**Non-goals.**
- Publishing to a registry, a version number policy, a changelog or release notes.
- Changing how development works: tests and `pnpm check` keep running from source with no build.
- Calling the LLM. The job sets no API key.
- Registering the server with a host: FL-038.

**Functional requirements.**
1. One command builds the four workspace members. A second produces the archives.
2. The job creates an empty directory outside the checkout and installs the archives there with the public registry as the only other origin of packages. No workspace link is used.
3. The job starts the installed server with `FACTLOOM_NAMESPACE` and `FACTLOOM_DB` set to a temporary file, and over stdio performs: initialise, list the tools, `record_fact` with one fact, `recall` with a question that matches it.
4. The tool list contains exactly the five phase 1 names in [`MCP-TOOLS.md`](../../architecture/MCP-TOOLS.md): `recall`, `remember`, `record_fact`, `invalidate_fact`, `get_fact_history`. Phase 2 adds a sixth tool and updates this expectation (FL-059 in EPIC-08).
5. `recall` returns the recorded fact. This proves that the native SQLite modules and the embedding runtime load from an installed copy.
6. The job measures the size of the install directory and prints it. It does not fail on a size: no requirement asks for a limit.
7. The job runs the pin test of FL-001 before it packs, so an archive is never built from a manifest with a version range. This item adds no pin check of its own.

**Technical requirements.**
1. The build sets `rewriteRelativeImportExtensions` in a configuration of its own. The development type check of FL-001 is unchanged and still emits nothing.
2. Built output is ignored by git, which `.gitignore` already does for `dist/`.
3. Whether the server is packed as four archives or as one that contains the three libraries is decided in this work item. The decision and its reason are stated in the commit. A new ADR is written only if the choice changes a package's `exports`.
4. The stdio calls reuse the client code of the smoke test (FL-037), pointed at the installed server.
5. The size is reported, not gated. [ADR 0014](../../architecture/adr/0014-local-embeddings-with-bge-small.md) records 745 MB for the embedding runtime's install on Linux as the reference, and names the step to take if the size proves a problem.
6. The first start downloads the embedding model, so the job has network access and a longer time limit than the check job ([`TESTING.md`](../../architecture/TESTING.md)).

**Constraints.**
- [ADR 0015](../../architecture/adr/0015-toolchain.md): no build step in development.
- [ADR 0016](../../architecture/adr/0016-mcp-stdio-server-with-five-tools.md): five tools in phase 1, and the SDK version pinned exactly.
- [ADR 0005](../../architecture/adr/0005-sqlite-first-with-hand-written-sql.md): one SQLite file and no other service.
- [Git rules](../../../.claude/rules/git.md): no secret in the workflow.

**Acceptance criteria.**
- [x] A workflow run shows the clean-install job passing on Linux and on macOS arm64. Its address is recorded.
- [x] The job log shows the five tool names and the recalled fact.
- [x] The job log shows the measured install size for each operating system. The two sizes are recorded in this work item.
- [x] With the server's entry file renamed in a local run of the job's script, the script exits non-zero. The output is recorded and the change removed.
- [x] `pnpm check` exits 0 with no built output present, and `git status --short` is empty after the build and pack commands.
- [x] Every `package.json` still has `"private": true`.

**Validation.** The clean-install job on both operating systems; the local failure run; `pnpm check`.

**Completion evidence.** The commits, the address of the passing workflow run, the measured sizes, and the output of the failure run.

**Recorded evidence.** Completed on 2026-11-17, in four commits:

1. `build: compile and pack the five workspace members for a clean install`, whose message states the choice of five archives and its reason;
2. `test(mcp-server): share the stdio session runner and add the check of an installed server`;
3. `ci: install the packed server on a clean machine on Linux and macOS arm64`;
4. `docs: describe the clean-install job in TESTING.md`.

Built:

- **The build.** `pnpm run build` runs `tsc -b apps/mcp-server/tsconfig.build.json`. Each member has a `tsconfig.build.json` that sets `rewriteRelativeImportExtensions`, `noEmitOnError` and `outDir: dist`; the four libraries are composite projects that the server's configuration references. The server is compiled from `src/main.ts` alone, so that the development scripts beside it, which import `evals/`, are left out. The development type check is unchanged and emits nothing.
- **The pack.** `pnpm run pack:archives` packs the five members into `dist/archives`. pnpm 12.18.0, run here, replaced `exports` with `publishConfig.exports` (`./dist/index.js`), wrote `workspace:*` and `catalog:` as exact versions, and packed packages marked private. `files` holds `dist`, and for storage also `migrations`, which it reads at run time.
- **Five archives, not one.** pnpm already rewrites the specifiers, so each package keeps its one entry, compiled, and nothing is bundled. No package's `exports` changes in development, so no ADR is written.
- **The job script.** `scripts/clean-install/run.sh`:
  - runs the pin test of FL-001, builds and packs;
  - installs the archives with npm, from `https://registry.npmjs.org/` only, into a new directory made by `mktemp -d`;
  - fails if any `@factloom` package there is a link;
  - runs `apps/mcp-server/src/check-installed-server.ts` on it and prints the size with `du`.
- **The check.** It starts `node_modules/@factloom/mcp-server/dist/main.js` through `runServerRequests`, the session runner of the FL-037 smoke test, now shared in `testing/server-process.ts`. It initialises, lists the tools, records one fact and recalls it, with the real embedding model and no API key, and exits 1 if the tools or the recalled fact differ. It passes on the proxy variables of its own environment, which GitHub's runners do not set, so that it also runs behind a proxy.
- **The workflow job.** `clean install`, on `ubuntu-24.04` and `macos-26`, on every push, with Node.js 22, a 30-minute limit and no secret. The check job now has a 15-minute limit, so that this job's limit is the longer, as technical requirement 6 asks.

The workflow run with the job passing on both operating systems: https://github.com/Johnmark-Tech/factloom/actions/runs/44002099189. From its logs:

| | Linux x64 | macOS arm64 |
|---|---|---|
| Tools | recall, remember, record_fact, invalidate_fact, get_fact_history, give_feedback | the same |
| Recalled | `shop-api is deployed to Fly.io.` | the same |
| Answer times, ms (list, record, recall) | 516, 1535, 1556 | 692, 3036, 3056 |
| Installed size | 839040 KiB (820M) | 569556 KiB (556M) |

The Linux size is close to the 745 MB that ADR 0014 records for the embedding runtime alone.

The failure run, done here on Linux x64 with Node.js v22.23.4: the script, with `mv apps/mcp-server/dist/main.js apps/mcp-server/dist/main.renamed.js` added before the pack, exited 1. Its last lines:

```text
added 66 packages in 18s
The server stopped before answering request 1: node:internal/modules/cjs/loader:1433
...
Error: Cannot find module '/tmp/tmp.4FAkeM5ivo/node_modules/@factloom/mcp-server/dist/main.js'
```

The line was then removed and the built output deleted.

With no built output present, `pnpm check` passed:

```text
 Test Files  95 passed (95)
      Tests  997 passed (997)
```

After the build and pack commands, `git status --short` was empty: `dist/` is ignored, and Biome now skips it too. Every `package.json` still has `"private": true`.

Differences from the item:

- **Five members, not four.** `@factloom/maintenance` joined the workspace in FL-040.
- **Six tools, not five.** `give_feedback` was added in phase 2, so the check expects the six of `MCP-TOOLS.md`. FL-059 had already updated this expectation in the smoke test.
- **The check job gained a time limit**, of 15 minutes, which it had not had, so that the clean-install job's 30 minutes is the longer.
