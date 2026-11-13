# TypeScript 7, Biome, and no build step in development

Status: accepted

- **TypeScript 7.0** with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, and `NodeNext` modules.
- **Biome** for formatting and linting, including the rules that forbid cross-package imports.
- **No build step in development.** Each package's `exports` points at its TypeScript source, and Node runs it directly. A build is added when a package is first published.
- **Node** `^22.18.0 || >=24`, and **pnpm** pinned through `packageManager`.
- **Vitest** for tests.

Versions were checked against the registry on 2026-11-13 ([research](../../research/technical/toolchain.md)). Only Node 22 on Linux was exercised.

## Why

- typescript-eslint does not support TypeScript 7, which has no programmatic API. Biome does not depend on the compiler, and a forbidden import was shown to fail under it.
- With no `dist` directory there is no stale build, no project references, and no export conditions to keep in step. A workspace package pointing at its source ran under plain `node` and under Vitest.

## Considered options

- **TypeScript 6 with ESLint and typescript-eslint.** The established combination, with more type-aware lint rules. Rejected: it starts the project one major version behind, with two tools where one does.
- **`tsc -b` with project references and `dist`.** Rejected for development; it exists to solve a problem the no-build setup does not have.

## Consequences

- Running TypeScript directly depends on Node's type stripping, which allows only syntax that can be erased: no enums, no parameter properties. The code style already avoids both.
- Node will not strip types from a package installed into `node_modules`, so publishing needs a build. That is a later work item.
- Fewer type-aware lint rules than typescript-eslint offers.
