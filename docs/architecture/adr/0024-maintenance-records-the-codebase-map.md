# Maintenance records the code base map from the repository

Status: accepted. Replaces the way in of [ADR 0023](0023-the-agent-records-the-codebase-map.md); the rest of ADR 0023 stands.

The map of FL-082 is recorded by a maintenance job, `record_codebase_map`, not left to the agent. At `HEAD`, the job reads the top-level declarations of the repository's JavaScript and TypeScript source files, by text search: functions, classes, constants and types, each with the doc comment above it. It records one `defined_in` fact per declaration, its statement naming the symbol, its path and the first sentence of its comment, with the file at `HEAD` as its source. It runs in every maintenance run, after verification and the rename repair, so a session start hook keeps the map as current as the last commit. The agent may still record map facts; the job does not depend on it.

## Why

- **The agent did not record the map.** In FL-082's twenty sessions with Factloom it recorded two facts and no `defined_in` fact, though the server's instructions asked for it, so the map, the hook's part in it and its repair were never exercised ([EPIC-06](../roadmap/epics/EPIC-06.md), FL-082's evidence). ADR 0023's premise did not hold.
- **A map written before the first session was the cheapest set-up.** The hand-written `CLAUDE.md` map of FL-082 cost least, most of all in the first session. A map recorded at session start is there from the first prompt too, and the recall hook hands over only the facts that match it, not the whole map.
- **No model and no tokens.** Reading declarations is a text search, as the name check of FL-071 is; it spends nothing the agent's usage does not show, and needs no key.
- **The repository is the truth, read every run.** A function moved to another file is found at its new path and its fact continued there; a declaration gone from every file has its fact ended. Together with the repair of FL-082 for a renamed file, the map follows the code without a person.

## Alternatives rejected

- **Capture on read: a hook after the agent's file reads records the facts of the file read.** The first session of a task would start from an empty map, which is where the `CLAUDE.md` map saved most; the map would hold only what was looked at; and what Claude Code passes to a hook after a tool call was not read for this decision.
- **An LLM summary of each file.** It would spend tokens the agent's usage does not show, as ADR 0023 says, and need a key.
- **A parser, such as tree-sitter.** A text search finds top-level declarations well enough to point an agent at a file, and needs no dependency (the README's "What is deliberately left out").
- **Only exported declarations.** A helper that is not exported is still code an agent has to find.

## Consequences

- A name declared in more than one file is ambiguous: the map leaves it out rather than pick one.
- Test files, dependencies and build output are left out, as are files over a size limit; one run records at most a stated number of facts, so a first run on a large repository fills the map over several sessions.
- A doc comment that holds a secret is not recorded (ADR 0019).
- Files of other languages get no map facts, and the job leaves any fact about them alone.
