# Writes that contain a recognisable secret are refused

Status: accepted

Each source keeps the text its facts came from, because without it a fact cannot be verified against its source later and statements cannot be re-embedded when the model changes. That text comes from agents and conversations, so sooner or later it will contain a credential.

Before anything is stored or sent to the LLM, the write use cases check their text against a fixed list of patterns for common credential formats. A match refuses the write with `invalid_input`, naming the kind of secret and never repeating it. Anything the patterns miss is removed afterwards with a purge ([ADR 0012](0012-purge-is-the-one-exception.md)), which is built in phase 2.

## Considered options

- **Do not keep source text.** Rejected: it gives up verification and re-embedding to avoid a risk that a check and a purge can manage.
- **Redact the secret and store the rest.** Rejected for now: a silently altered source is no longer what was said, and a refusal tells the agent what happened so it can restate the fact without the secret.
- **An entropy check in addition to patterns.** Rejected for now: it flags hashes, identifiers and commit SHAs, which coding-agent notes are full of. It can be added if the patterns prove too weak.

## Consequences

A pattern list gives no guarantee. Between phase 1 and the arrival of purge in phase 2, a secret that slips through stays in the database file, which is local to the developer's machine.
