# Engineering principles

These rules apply to all research, design, and code in this repository.

## Accuracy

- Cite a source for every research finding: a URL or file path, with the access date. Prefer official documentation, source repositories, papers, and package registries over blog posts.
- Do not state library versions, APIs, config options, or CLI commands from memory. Check current documentation or the registry first.
- Label each finding **confirmed** (primary source or run locally), **likely** (secondary sources), or **unverified**.
- Put unverified items in `docs/research/OPEN-QUESTIONS.md`. Never write them as fact elsewhere.
- When a claim can be tested, test it with a throwaway script in `spikes/`.
- If something could not be verified, say so. Do not report a skipped or failed step as done.

## Do not over-engineer

- Build only what the current phase needs. Add nothing "for later" unless leaving it out would force a rewrite.
- Put depth where mistakes are expensive: the fact schema with its time fields, and the storage interface. Everything else starts as the simplest thing that works.
- No abstraction without two real uses.
- Every piece of complexity needs a one-line justification naming the problem it solves. If that line cannot be written, leave the piece out.
- Prefer fewer dependencies, files, layers, and documents. Do not create empty placeholder files.

## Readability

- Clear names over short names. Functions are verbs, types are nouns.
- One vocabulary: use glossary terms the same way in code, docs, and tickets.
- Small, single-purpose functions and files.
- Comments explain why, not what. Every exported function has a short doc comment.
- Plain code over clever code. Use advanced type techniques only where they prevent a real bug.

## Maintainability

- Small public surface: each package exports only what others need.
- Each significant decision gets a short ADR with the reason and the alternatives rejected.
- Test names read as sentences that describe behaviour.
- Schema changes go through versioned migrations that are never edited after release.
- Few dependencies, pinned versions, each with a stated reason.
- Style is enforced by tools, not by memory.
