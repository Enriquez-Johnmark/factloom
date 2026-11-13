# Toolchain: Node.js, pnpm, TypeScript, build, lint, Zod, Vitest

Accessed: 2026-11-13.

Every version below was read from the npm registry (`npm view <pkg> version dist-tags time engines`)
or from the vendor's documentation on 2026-11-13. Every claim marked "ran it" was executed in this
session on Linux x64 with Node.js v22.23.4, in a throwaway workspace outside the repository.

## Question

Which versions and settings should the Factloom monorepo (3 packages and 1 app, one developer) use
for Node.js, pnpm, TypeScript, the build, linting and formatting, Zod and Vitest, and what is the
simplest setup that makes a forbidden cross-package import fail automatically?

## Findings

### Node.js

| Line | Status on 2026-11-13 | End of life | Latest release |
| --- | --- | --- | --- |
| 26 "Lithium" | Active LTS since 2026-10-28 | 2029-04-30 | v26.13.1 (2026-11-10) |
| 24 "Krypton" | Maintenance LTS since 2026-10-20 | 2028-04-30 | v24.22.3 (2026-11-10) |
| 22 "Jod" | Maintenance LTS since 2025-10-21 | 2027-04-30 | v22.23.5 (2026-11-11) |
| 20 "Iron" | End of life | 2026-04-30 | v20.20.2 |

- **confirmed.** Source: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json and
  https://nodejs.org/dist/index.json.
- Node.js runs `.ts` files directly by stripping types. In the 22 line this is on by default and
  prints no warning from v22.18.0; its stability is "1.2, Release candidate". Enums, runtime
  namespaces and parameter properties are not supported, imports must spell the `.ts` extension,
  `tsconfig.json` is not read, and files under `node_modules` are refused. **confirmed.** Source:
  https://nodejs.org/docs/latest-v22.x/api/typescript.html. Ran it: `process.features.typescript`
  is `"strip"` on v22.23.4.
- Corepack is no longer distributed with Node.js from v25 on. **confirmed.** Source:
  https://nodejs.org/docs/latest-v24.x/api/corepack.html ("Corepack will no longer be distributed
  starting with Node.js v25"); the same page for v26 returns HTTP 404.

### pnpm

- Current version: **12.18.0** (`latest`, published 2026-11-05). pnpm 12.0.0 was published
  2026-08-26, 11.0.0 on 2026-04-28. `latest-11` is 11.28.9, `latest-10` is 10.34.9. **confirmed**
  (npm registry).
- Node.js support: pnpm 12 runs on Node 18 to 26; pnpm 11 needs Node 22.13 or later. **confirmed.**
  Source: https://pnpm.io/installation and `npm view pnpm@11.28.9 engines`.
- Workspace: a `pnpm-workspace.yaml` with a `packages:` list; a package depends on a sibling with
  `"@factloom/core": "workspace:*"`. **confirmed**, ran it.
- Catalogs pin a version once for all packages. In `pnpm-workspace.yaml`, `catalog:` defines the
  default catalog; a `package.json` then writes `"zod": "catalog:"`. **confirmed**, ran it. Source:
  https://pnpm.io/catalogs.
- Settings live in `pnpm-workspace.yaml` (or the global `config.yaml`); `.npmrc` is read only for a
  few registry and auth settings. **confirmed.** Source: https://pnpm.io/settings.
- Dependency build scripts (`preinstall`, `install`, `postinstall`) do not run unless the package
  is approved. The setting is `allowBuilds`, a map of package name to `true` or `false`. With the
  default `strictDepBuilds: true`, an install that meets an unreviewed build script exits with an
  error (`ERR_PNPM_IGNORED_BUILDS`). `onlyBuiltDependencies`, `ignoredBuiltDependencies` and
  `neverBuiltDependencies` were removed in pnpm 11 and replaced by `allowBuilds`. **confirmed.**
  Source: https://pnpm.io/settings/build.
- This does not affect the native module Factloom needs: `better-sqlite3@13.1.1` has no install
  script and ships its prebuilt binaries inside the package, so pnpm 12 installs it with no
  `allowBuilds` entry. **confirmed**, ran it (see `sqlite.md`).
- `minimumReleaseAge` defaults to 1440 minutes: by default pnpm does not pick a version published
  less than one day ago. **confirmed.** Source: https://pnpm.io/settings/dependency-resolution.
- Version pinning without Corepack: with `"packageManager": "pnpm@12.18.0"` in the root
  `package.json`, an installed pnpm 10.28.0 switched itself to 12.18.0 inside that directory.
  **confirmed**, ran it (`pnpm --version` printed 10.28.0 outside the workspace and 12.18.0 inside).
  pnpm 12 also records the pin in `pnpm-lock.yaml` under `packageManagerDependencies`.

### TypeScript

- Current stable: **7.0.2** (`latest`, published 2026-07-08). TypeScript 7 is the native (Go) port
  of the compiler; the announcement reports full builds about 8 to 12 times faster. The last 6.x
  release is 6.0.3 (2026-04-16); the last 5.x is 5.9.3. `beta` is 7.1.0-beta. **confirmed** (npm
  registry; https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
- TypeScript 7.0 ships **no programmatic API**; a new API is expected in 7.1. Tools that need the
  API use the separate package `@typescript/typescript6` (6.0.2, binary `tsc6`). **confirmed**
  (same announcement; npm registry).
- Consequence: `typescript-eslint@8.72.2` declares `typescript: ">=4.8.4 <6.1.0"` as a peer
  dependency, so type-aware ESLint cannot use TypeScript 7 today. **confirmed** (`npm view
  typescript-eslint peerDependencies`; https://typescript-eslint.io/users/dependency-versions/).
- Changed defaults in 7.0 that matter here: `strict` is on by default; `types` defaults to `[]`
  (Node types must be listed: `"types": ["node"]`); `rootDir` defaults to the directory of the
  tsconfig (set it to `src`); `baseUrl` and `moduleResolution: node10` are removed. **confirmed**
  (announcement). Ran it: the configuration below compiles with 7.0.2.
- `tsc -b` with project references works in 7.0.2. **confirmed**, ran it: a clean build of two
  packages took 0.26 s and a no-op rebuild 0.08 s.

Compiler flags, in `tsconfig.base.json` (ran it with TypeScript 7.0.2):

```json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["es2023"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "rewriteRelativeImportExtensions": true,
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true
  }
}
```

- `erasableSyntaxOnly` forbids enums and parameter properties, which keeps every file runnable by
  Node's type stripping. `rewriteRelativeImportExtensions` lets source files import `./x.ts` (what
  Node needs to run them directly) while `tsc` emits `./x.js`. **confirmed**, ran it.
- `isolatedDeclarations`: **not worth it here.** The flag exists in 7.0.2, but it requires an
  explicit type annotation on every export, and a Zod schema export cannot satisfy that. Ran it:
  `export const Fact = z.strictObject({...})` fails with `error TS9010: Variable must have an
  explicit type annotation with --isolatedDeclarations`. Its benefit is faster declaration output
  by other tools, which a 0.3 s `tsc -b` does not need. **confirmed.**

### Build setup

| Option | What it is | Result |
| --- | --- | --- |
| (a) `tsc -b` with project references | One compiler, one `dist` per package | Ran it. 0.26 s clean. Emits `.js`, `.d.ts`, maps. Detects reference cycles. **Recommended.** |
| (b) tsdown 0.23.7 / tsup 9.0.0 | Bundlers on top of the compiler | Not tested. Both require Node `^22.18.0 \|\| ^24.11.0 \|\| >=26`. tsdown is still 0.x. They solve dual CJS/ESM publishing and bundling, which a private ESM-only workspace does not need. |
| (c) No build: run TypeScript directly | Node type stripping, or tsx 4.23.15 | Ran it with Node alone (no tsx): works for development, but only when imports use `.ts` extensions and package `exports` offer a source entry. It cannot be the only path: Node refuses `.ts` under `node_modules`, and the MCP server is started as `node apps/mcp-server/dist/main.js`. |

Recommendation: **(a) for the build, plus one custom export condition so tests and development
never read a stale `dist`.** **confirmed**, ran it.

The reason for the extra condition: with `exports` pointing only at `dist`, Vitest fails before
the first build (`Failed to resolve entry for package "@factloom/core"`), and after a build it
silently tests the last compiled copy of a dependency rather than its current source.

`package.json` of each library package (the exact shape that was run):

```json
{
  "name": "@factloom/storage",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "@factloom/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "dependencies": {
    "@factloom/core": "workspace:*"
  }
}
```

`tsconfig.json` of the same package, and the root `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"],
  "references": [{ "path": "../core" }]
}
```

```json
{ "files": [], "references": [{ "path": "packages/core" }, { "path": "packages/storage" }] }
```

Root `package.json` and `pnpm-workspace.yaml`:

```json
{
  "name": "factloom",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.18.0",
  "engines": { "node": ">=22.18.0" },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b",
    "test": "vitest run",
    "lint": "biome check ."
  },
  "devDependencies": {
    "@biomejs/biome": "catalog:",
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```yaml
packages:
  - packages/*
  - apps/*
catalog:
  "@biomejs/biome": 2.6.7
  "@types/node": 22.19.0
  typescript: 7.0.2
  vitest: 5.1.0
  zod: 4.6.7
```

`vitest.config.ts` at the root (one file, no per-package config):

```ts
import { defineConfig } from "vitest/config";

// Resolve @factloom/* imports to TypeScript source so tests never run against a stale dist.
const conditions = ["@factloom/source"];

export default defineConfig({
  ssr: { resolve: { conditions } },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
  },
});
```

Commands and output from the throwaway workspace (`packages/core` exports a Zod schema;
`packages/storage` imports `@factloom/core` by name; paths shortened):

```text
$ pnpm exec tsc --version
Version 7.0.2

$ pnpm test                      # no dist directory exists yet
 RUN  v5.1.0
 Test Files  2 passed (2)
      Tests  2 passed (2)

$ node --conditions=@factloom/source packages/storage/src/main.ts    # no build, Node only
stored f1: pnpm is the package manager

$ pnpm build
$ tsc -b                         # exit 0, 0.26 s

$ grep import packages/storage/dist/main.js
import { store } from "./index.js";        # the source says "./index.ts"

$ node packages/storage/dist/main.js
stored f1: pnpm is the package manager

$ pnpm test                      # dist exists now; still 2 files, dist is not picked up
 Test Files  2 passed (2)
      Tests  2 passed (2)
```

Details found on the way (all ran):

- `ssr.resolve.conditions` is the setting that matters for Vitest's Node environment;
  `resolve.conditions` alone did not work.
- `test.projects: ["packages/*"]` (glob form) does not inherit anything from the root config, so
  the condition was ignored and, after a build, compiled tests in `dist` were also collected ("4
  passed"). A single root config with an `include` list avoids both problems and is enough for
  four packages.
- Test files in `src` are compiled into `dist` as well. This is harmless for private packages; it
  keeps tests type-checked by the same `tsc -b`.
- `*.tsbuildinfo` files are written next to each `tsconfig.json`; the repository `.gitignore`
  already lists them.

### Lint and format

| Tool | Version (2026-11-13) | Notes |
| --- | --- | --- |
| ESLint | 10.14.0 (`maintenance`: 9.39.5) | Flat config only. Node `^20.19.0 \|\| ^22.13.0 \|\| >=24`. |
| typescript-eslint | 8.72.2 | Supports ESLint 8.57 to 10, TypeScript `<6.1.0`. Not usable with TypeScript 7.0 without also installing TypeScript 6. |
| Biome | 2.6.7 | One binary: linter and formatter. Does not use the TypeScript API. |
| oxlint | 1.93.0 | Linter only. Does not use the TypeScript API. |
| Prettier | 3.10.1 | Formatter only. |
| eslint-plugin-boundaries | 7.4.3 | Needs ESLint. |
| dependency-cruiser | 18.7.2 | Separate CLI and rule file. Node `^22 \|\| ^24 \|\| >=26`. |

All versions **confirmed** (npm registry). Biome was run; the other tools were not run.

Recommendation: **Biome for both linting and formatting.** It is one dependency and one config
file, it took about 10 ms on the test workspace, and it works with TypeScript 7 because it does not
depend on the compiler API. ESLint with typescript-eslint would add type-aware rules, at the price
of a second TypeScript installation (6.x) while 7.0 has no API. Prettier is not needed if Biome
formats.

Package boundaries, compared:

| Mechanism | Tested | Result |
| --- | --- | --- |
| pnpm strictness: a package can import only what its own `package.json` declares | Ran it | Works. An undeclared import fails at type-check, in tests and at run time (output below). |
| `tsc -b` project references | Ran it | A reference cycle fails: `error TS6202: Project references may not form a circular graph`. |
| Biome `style/noRestrictedImports` in a per-directory `overrides` block | Ran it | Works, and also catches the case where someone adds the forbidden dependency to `package.json`. |
| ESLint `no-restricted-imports` per directory | Not run | Equivalent to the Biome rule; needs ESLint. |
| eslint-plugin-boundaries, dependency-cruiser | Not run | More expressive than four packages need. |

What pnpm strictness does not cover (ran it): if someone adds `"@factloom/storage":
"workspace:*"` to `packages/core/package.json`, pnpm installs it with only a warning (`There are
cyclic workspace dependencies`). The build then still fails (`TS5055`, or `TS6202` once the
project reference is added), but with a confusing message. The Biome rule gives the clear one.
Also, root `devDependencies` (vitest, typescript) are reachable from every package.

Recommendation: **`package.json` dependencies plus project references as the mechanism, and one
Biome override for `packages/core` as the readable guard.** `biome.json` as run:

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "files": { "includes": ["**", "!!**/dist"] },
  "formatter": { "indentStyle": "space", "lineWidth": 100 },
  "linter": { "rules": { "preset": "recommended" } },
  "overrides": [
    {
      "includes": ["packages/core/**"],
      "linter": {
        "rules": {
          "style": {
            "noRestrictedImports": {
              "level": "error",
              "options": {
                "patterns": [
                  {
                    "group": ["@factloom/*", "node:*", "better-sqlite3"],
                    "message": "packages/core is the innermost package: it must not import other @factloom packages, Node built-ins or drivers."
                  }
                ]
              }
            }
          }
        }
      }
    }
  ]
}
```

Proof that a forbidden import fails. `packages/core/src/index.ts` was given the line
`import { store } from "@factloom/storage";` without declaring the dependency:

```text
$ pnpm exec tsc -b
packages/core/src/index.ts(13,23): error TS2307: Cannot find module '@factloom/storage' or its corresponding type declarations.
exit 2

$ pnpm exec biome check .
packages/core/src/index.ts:13:23 lint/style/noRestrictedImports
  × packages/core is the innermost package: it must not import other @factloom packages, Node built-ins or drivers.
Found 2 errors.
exit 1

$ pnpm test
 FAIL  packages/core/src/index.test.ts
Error: Cannot find package '@factloom/storage' imported from .../packages/core/src/index.ts
 Test Files  2 failed (2)

$ node --conditions=@factloom/source packages/storage/src/main.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@factloom/storage' imported from .../packages/core/src/index.ts
```

Two further cases that were run:

```text
# core also declares the dependency in package.json (a cycle):
$ pnpm install
[WARN] There are cyclic workspace dependencies: .../packages/core, .../packages/storage
$ pnpm exec tsc -b
error TS5055: Cannot write file '.../packages/storage/dist/index.d.ts' because it would overwrite input file.
$ pnpm exec biome check .
  × packages/core is the innermost package: it must not import other @factloom packages, ...

# storage imports zod, which only core declares:
$ pnpm exec tsc -b
packages/storage/src/index.ts(7,20): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
```

Biome's `correctness/noUndeclaredDependencies` was also tried. It reports `vitest` in every test
file because the rule reads only the nearest `package.json`, so it is left off.

### Zod

- Current: **4.6.7** (`latest`, published 2026-10-12). Zod 4.0.0 was published 2025-07-09. The last
  3.x is 3.25.76. **confirmed** (npm registry).
- Import: `import * as z from "zod"` is Zod 4. The subpaths `zod/v4` and `zod/v3` still exist in
  4.6.7. Ran it: `zod` and `zod/v4` export the same functions. The MCP SDK documentation writes
  `zod/v4`; both work. **confirmed.** Source: https://zod.dev/v4/changelog, `npm view zod exports`.
- `z.infer<typeof Schema>` is unchanged. **confirmed**, ran it.
- Migration notes from v3 that matter (source: https://zod.dev/v4/changelog; items marked "ran it"
  were executed with 4.6.7):
  - Error customisation: one `error` parameter replaces `message`, `required_error`,
    `invalid_type_error` and `errorMap`, for example `z.string().min(1, { error: "text is
    required" })` (ran it). `message` still works but is deprecated.
  - Errors: use `error.issues`; `z.treeifyError()` replaces `.format()` and `.flatten()`;
    `z.prettifyError()` gives a readable string (both ran).
  - Objects: `z.strictObject({...})` rejects unknown keys and `z.looseObject({...})` keeps them;
    `.strict()` and `.passthrough()` are legacy; `.merge()` is deprecated in favour of `.extend()`
    or spreading `.shape` (ran `z.strictObject`).
  - String formats are top-level: `z.email()`, `z.uuid()`, `z.url()`, `z.iso.datetime()`. `z.uuid()`
    is stricter than in v3 (RFC 9562 variant bits); `z.guid()` is the lenient form (ran `z.uuid`,
    `z.iso.datetime`).
  - `.default()` now takes a value of the output type and short-circuits; `.prefault()` has the old
    behaviour. `z.record()` needs two arguments. `z.nativeEnum()` is deprecated; `z.enum()` accepts
    a TypeScript enum. `z.number()` rejects `Infinity`.
- JSON Schema: `z.toJSONSchema(schema, { target, io, unrepresentable, cycles, reused, override })`.
  Default target is draft 2020-12; `draft-07`, `draft-04` and `openapi-3.0` are available. Output
  mode sets `additionalProperties: false` for `z.object`; input mode omits it. `z.date()`,
  `z.bigint()`, transforms and a few others cannot be represented and throw by default.
  `z.fromJSONSchema()` exists but is marked experimental. **confirmed.** Source:
  https://zod.dev/json-schema. Ran it.
- Observation (ran it): `z.iso.datetime()` and `z.uuid()` add a long `pattern` regular expression
  to the generated JSON Schema. In an MCP tool input schema this costs tokens on every tool
  listing; see `mcp.md`.

### Vitest

- Current: **5.1.0** (`latest`, published 2026-11-02). Vitest 5.0.0 was published 2026-09-03 and
  4.0.0 on 2025-10-22. Maintained older tags: `V4` 4.1.12, `V3` 3.2.7. **confirmed** (npm registry).
- Requirements: Node.js `^22.12.0 || ^24.0.0 || >=26.0.0` and Vite 6.4 or later (Vite is a peer
  dependency; pnpm installed vite 8.3.8 automatically). **confirmed** (`npm view vitest engines
  peerDependencies`; https://vitest.dev/guide/migration).
- Migration notes for 5.0 that matter here (source: https://vitest.dev/guide/migration):
  `clearMocks` defaults to `true`; unawaited async assertions fail the test; `vi.mock` and
  `vi.hoisted` must be at the top level of a file; config files are no longer looked up in parent
  directories; `test.sequential` is removed; test artifacts moved under `.vitest`.
- Monorepo: `test.projects` replaces the workspace file (deprecated since 3.2). Entries can be
  globs, config file paths or inline objects. Inline projects inherit the root config by default
  since 5.0 (`extends: true`); projects named by glob or by config file inherit nothing.
  **confirmed.** Source: https://vitest.dev/guide/projects. Ran it: glob projects ignored the root
  `ssr.resolve.conditions`; inline projects honoured it.

### Final table

| Package | Version verified 2026-11-13 | Source | Why needed |
| --- | --- | --- | --- |
| Node.js | 26.13.1 Active LTS; 24.22.3 and 22.23.5 Maintenance LTS | nodejs/Release schedule.json, nodejs.org/dist/index.json | Runtime |
| pnpm | 12.18.0 | npm registry, pnpm.io | Package manager and workspace |
| typescript | 7.0.2 | npm registry, TypeScript blog | Type-check and build (`tsc -b`) |
| @types/node | 22.19.0 used (latest is 26.6.6) | npm registry | Node types; keep the major equal to the lowest supported Node line |
| @biomejs/biome | 2.6.7 | npm registry, biomejs.dev | Lint, format, import restriction |
| zod | 4.6.7 | npm registry, zod.dev | Schemas (settled decision) |
| vitest | 5.1.0 | npm registry, vitest.dev | Tests (settled decision) |
| vite | 8.3.8 (installed as Vitest's peer) | pnpm install output | Required by Vitest |
| eslint | 10.14.0 | npm registry | Not recommended now; listed for comparison |
| typescript-eslint | 8.72.2 | npm registry, typescript-eslint.io | Not recommended now: no TypeScript 7 support |
| oxlint | 1.93.0 | npm registry | Not needed; listed for comparison |
| prettier | 3.10.1 | npm registry | Not needed if Biome formats |
| eslint-plugin-boundaries | 7.4.3 | npm registry | Not needed |
| dependency-cruiser | 18.7.2 | npm registry | Not needed |
| tsdown | 0.23.7 | npm registry | Not needed |
| tsup | 9.0.0 | npm registry | Not needed |
| tsx | 4.23.15 | npm registry | Not needed: Node runs `.ts` itself from 22.18 |
| @typescript/typescript6 | 6.0.2 | npm registry | Only if a tool needs the TypeScript JS API |
| corepack | 0.36.0 (not bundled from Node 25) | npm registry, nodejs.org | Not needed: pnpm switches version from `packageManager` |

## What it means for Factloom

- Set `"engines": { "node": ">=22.18.0" }`. That is the lowest version where everything above was
  run and where Node executes `.ts` without a flag. Node 22 reaches end of life on 2027-04-30, so
  the minimum will need to move to 24 before then.
- For the Mac, install Node 24 or Node 26. Both are LTS lines. Only Node 22.23.4 was exercised in
  this session; the packages' `engines` fields allow 24 and 26 (**likely**, not run).
- Use pnpm 12.18.0 pinned through `packageManager`, a `catalog:` for shared versions, and no
  Corepack. No `allowBuilds` entry is needed today.
- Use TypeScript 7.0.2 with `tsc -b` and project references. Write relative imports with `.ts`
  extensions. Do not use enums or parameter properties (`erasableSyntaxOnly` enforces this).
- Give each package the three-entry `exports` map shown above. Tests and `node --conditions=
  @factloom/source` read source; everything else reads `dist`.
- Use Biome 2.6.7 for lint and format. Do not add ESLint until typescript-eslint supports the
  TypeScript 7 API, and only if a type-aware rule is actually wanted.
- Enforce boundaries with `package.json` dependencies and project references; add the one Biome
  override for `packages/core`. Add a similar override per package only if a real violation shows
  the need.
- Use one root `vitest.config.ts`. Do not use glob `projects`.
- If a tool later needs the TypeScript API (for example a documentation generator), the fallback
  is TypeScript 6.0.3 for that tool only, through `@typescript/typescript6`.

## Open questions

- **unverified:** behaviour on Node 24 and Node 26, and on macOS arm64. Nothing in this document
  was run there. The first `pnpm install && pnpm build && pnpm test` on the Mac settles it.
- **unverified:** editor experience with TypeScript 7 (language server in VS Code or another
  editor). Not testable in this session.
- **unverified:** whether TypeScript 7.1 (currently `7.1.0-beta`) will restore an API that
  typescript-eslint adopts, and when. The announcement says a new and different API is expected in
  7.1.
- **unverified:** whether declaration maps make "go to definition" land in `src` rather than
  `dist` in the editor. `declarationMap` is enabled for that purpose but was not checked in an
  editor.
- The custom export condition name `@factloom/source` is a convention copied from the shape Zod
  itself publishes (`"@zod/source"` in `npm view zod exports`). It is ignored by any consumer that
  does not ask for it. If the packages are ever published, the `src` entry should be reviewed.
