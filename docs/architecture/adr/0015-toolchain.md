# TypeScript 7, Biome, and no build step in development

Status: accepted

- **TypeScript 7.0** with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, and `NodeNext` modules.
- **Three further compiler options** that make the code-style rules mechanical. `erasableSyntaxOnly` rejects enums, namespaces and parameter properties, which Node cannot strip. `allowImportingTsExtensions` lets a relative import end in `.ts`, which Node needs to run the source. `verbatimModuleSyntax` requires `import type` for a type, so that what Node runs after stripping the types is what was written.
- **Biome** for formatting and linting, including the rules that forbid cross-package imports.
- **No build step in development.** Each package's `exports` points at its TypeScript source, and Node runs it directly. A build is added when a package is first published.
- **Node** `^22.18.0 || >=24`, and **pnpm** pinned through `packageManager`.
- **Vitest** for tests.

Versions were checked against the registry on 2026-11-13 ([research](../../research/technical/toolchain.md)). Only Node 22 on Linux was exercised.

What the research ran, and in which setup:

| Item | Run in |
|---|---|
| `erasableSyntaxOnly`, `verbatimModuleSyntax` and `rewriteRelativeImportExtensions` | The workspace with a build step (`tsc -b` and `dist`) |
| `allowImportingTsExtensions`, in one flat `noEmit` type-check configuration | The no-build workspace |
| An undeclared cross-package import failing under `node` and under the type check | Both workspaces |
| The Biome `noRestrictedImports` rule rejecting a forbidden import | The workspace with a build step only |
| A lint rule against deep imports into another package | Not run |

The three options were also run together for this record on 2026-11-14, with TypeScript 7.0.2 and no emit, on a single directory of files and not on a workspace. An enum, a namespace and a parameter property were each rejected (`TS1294`), a type imported without `import type` was rejected (`TS1484`), and a `.ts` import was rejected without `allowImportingTsExtensions` (`TS5097`). The compiler accepts `allowImportingTsExtensions` only when it emits no JavaScript or when `rewriteRelativeImportExtensions` is set (`TS5096`), so a build for publishing adds the latter.

Not yet run: the three options in the no-build workspace, and the two lint rules there. The scaffold stage proves them by adding an enum, a forbidden import and a deep import, and showing the check fail.

## Why

- typescript-eslint does not support TypeScript 7, which has no programmatic API. Biome does not depend on the compiler. Its `noRestrictedImports` rule rejected a forbidden import in the research workspace that had a build step. The rule reads source files, so the same result is expected without a build, but that was not run.
- With no `dist` directory there is no stale build, no project references, and no export conditions to keep in step. A workspace package pointing at its source ran under plain `node` and under Vitest.

## Considered options

- **TypeScript 6 with ESLint and typescript-eslint.** The established combination, with more type-aware lint rules. Rejected: it starts the project one major version behind, with two tools where one does.
- **`tsc -b` with project references and `dist`.** Rejected for development; it exists to solve a problem the no-build setup does not have.

## Consequences

- Running TypeScript directly depends on Node's type stripping, which allows only syntax that can be erased: no enums, no parameter properties. The code style already avoids both, and `erasableSyntaxOnly` makes the compiler refuse them.
- Node will not strip types from a package installed into `node_modules`, so publishing needs a build. That is a later work item.
- Fewer type-aware lint rules than typescript-eslint offers.
