---
paths:
  - "**/*.ts"
---

# TypeScript rules

## Compiler

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns` and `noFallthroughCasesInSwitch` are on. Do not turn one off or silence it with a comment.
- Modules are `NodeNext`. Write relative imports with the `.ts` extension.
- Use only syntax that can be erased, because Node runs the source directly: no `enum`, no `namespace`, no constructor parameter properties. Use a union of string literals in place of an enum.

```ts
export type Trigger = 'agent' | 'person' | 'feedback' | 'maintenance'; // yes
export enum Trigger { Agent, Person } // no
```

## No `any`

- Never write `any`. Data from outside is `unknown` until a Zod schema has parsed it.
- Do not cast with `as` to make an error go away. Narrow with a check or parse with a schema. `as const` is fine.

```ts
const parsed = RecallInputSchema.safeParse(raw);
if (!parsed.success) return err('invalid_input', z.prettifyError(parsed.error));
```

## Zod schemas are the source of types

- Define the schema, then derive the type. Do not write a separate interface or a hand-written validator for the same shape.
- Name the schema `ThingSchema` and the type `Thing`.
- Parse at the edge, where data enters: a tool input, an LLM response, a database row. Inside, trust the types.

```ts
export const FactObjectSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('entity'), entityId: z.string() }),
  z.strictObject({ kind: z.literal('value'), value: z.string() }),
]);
export type FactObject = z.infer<typeof FactObjectSchema>;
```

## Absent values

- Use `null` for a value that is absent, such as `validTo: Timestamp | null`. Reserve optional properties for inputs a caller may leave out.
- Handle every variant of a union. End a `switch` over a union with a `never` check.

```ts
default: {
  const unhandled: never = change;
  throw new Error(`Unhandled change: ${JSON.stringify(unhandled)}`);
}
```

## Names

- Functions are verbs: `recordFacts`, `findConflictCandidates`. Types are nouns: `Fact`, `ChangeSet`.
- Prefer a clear name to a short one. Abbreviate only what everyone abbreviates: `id`, `url`, `sql`, `llm`.
- Files are kebab-case and named for their one export: `invalidate-fact.ts`.
- Booleans read as statements: `isLive`, `hasSource`.

## Functions and comments

- Keep functions small and single-purpose. Pass an object when a function takes more than two arguments.
- Every exported function has a short doc comment that says what it does for the caller.
- Other comments explain why, not what.
- Prefer plain code. Use conditional or mapped types only where they prevent a real bug, and say which bug in a comment.

## Time and identifiers

- Create a timestamp only with `toTimestamp` from `core`. Never call `new Date().toISOString()` elsewhere, and never build a timestamp string by hand.
- Take the clock and the identifier generator from the dependencies, so tests are deterministic.
