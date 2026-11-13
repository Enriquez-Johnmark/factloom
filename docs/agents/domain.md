# Domain docs

How the engineering skills should consume this repo's domain documentation.

## Layout

Single context.

- **`GLOSSARY.md`** at the repo root: every Factloom term, defined once.
- **`docs/architecture/adr/`**: architecture decision records, indexed by `docs/architecture/DECISIONS.md`. This replaces the skills' default `docs/adr/` location.

If a file does not exist yet, proceed silently. It is created when the first term or decision is recorded.

## Use the glossary's vocabulary

When output names a domain concept (a work-item title, a test name, a proposal), use the term as defined in `GLOSSARY.md`. Do not drift to synonyms the glossary avoids. If a needed concept is missing, note the gap for `/domain-modeling`.

## ADRs

This repo records one short ADR per significant decision, which is broader than the `/domain-modeling` skill's default of offering ADRs sparingly.

If output contradicts an existing ADR, say so explicitly instead of silently overriding it.
