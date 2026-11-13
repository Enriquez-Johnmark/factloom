# Factloom

Factloom is a memory layer for AI systems. It stores knowledge extracted from text as entities and facts, records when each fact was true and when the system learned it, and keeps that knowledge correct and tidy over time.

## Language

### Knowledge

**Memory**:
The whole body of knowledge Factloom holds: entities, facts, sources, and the record of how they changed.
_Avoid_: knowledge base, store (as a noun for the content)

**Namespace**:
A hard partition of memory. Every entity, fact, source, and audit entry belongs to exactly one namespace, and nothing is read or linked across namespaces.
_Avoid_: tenant, scope, project, workspace

**Entity**:
A thing that facts are about, such as a repository, a file, a dependency, a person, or a decision. It has a type and a name.
_Avoid_: node, object, concept

**Entity type**:
The category of an entity, such as `dependency` or `decision`. The set of entity types is defined by a domain.
_Avoid_: label, class, kind

**Fact**:
One claim that relates a subject entity, through a predicate, to an object. The object is either another entity or a literal value. A fact carries its valid time, its recorded time, a confidence, and at least one source.
_Avoid_: edge, triple, relation, memory (for a single item), observation

**Predicate**:
The named relationship a fact asserts, such as `uses_test_framework`. The set of predicates is defined by a domain.
_Avoid_: relation type, edge type, property

**Single-valued predicate**:
A predicate that can have only one current value for a subject at a time, so a new value conflicts with the old one. Any other predicate is **multi-valued**.
_Avoid_: functional predicate, exclusive predicate

**Statement**:
The one-sentence, natural-language form of a fact, written so it can be read and searched on its own.
_Avoid_: text, summary, content

**Source**:
The place a fact came from: a note from an agent, a conversation, a file at a given version, a document. Every fact has at least one.
_Avoid_: episode, provenance, origin, reference

**Anchor**:
The part of a source that locates it in a repository at a specific version, so the fact can later be checked against that repository.
_Avoid_: pointer, location

**Confidence**:
How strongly Factloom believes a fact, from 0 to 1.
_Avoid_: score (reserved for retrieval), certainty, weight

**Domain**:
A field of use, such as software development or legal, that defines its own entity types, predicates, extraction instructions, and correction policy.
_Avoid_: industry, vertical

**Domain adapter**:
The module that supplies one domain's definitions to the generic core. Only a domain adapter knows about its domain.
_Avoid_: plugin, industry adapter

### Time

**Valid time**:
The period during which a fact was true in the world, from `valid_from` up to but not including `valid_to`. A missing start means the start is unknown. A missing end means no end is known.
_Avoid_: effective time, event time, business time

**Recorded time**:
The period during which Factloom held a fact as its belief, from `created_at` up to but not including `invalidated_at`.
_Avoid_: transaction time, system time, ingestion time

**Live fact**:
A fact that has not been invalidated. Factloom still holds it as a belief, whether it is about the present or the past.
_Avoid_: active fact

**Current fact**:
A live fact whose valid time includes now.
_Avoid_: latest fact, active fact

**Ended fact**:
A live fact whose valid time has an end in the past. It is a current belief about something that used to be true.
_Avoid_: expired fact, old fact

**As-of date**:
A date supplied with a question, asking what was true in the world on that date. It is compared with valid time.
_Avoid_: point in time, historical date

**Known-at date**:
A date supplied with a question, asking what Factloom believed on that date. It is compared with recorded time.
_Avoid_: as-known-on, system date

### Change

**Invalidation**:
Factloom withdrawing a fact as a belief by setting `invalidated_at`. The fact stays on record. It is the only change ever made to a recorded fact.
_Avoid_: deletion, expiry, removal

**Supersession**:
The link from an invalidated fact to the fact that replaced it.
_Avoid_: replacement link, successor

**Revision**:
A change to a fact's valid time or confidence. The fact is invalidated and superseded by a copy that carries the change.
_Avoid_: update, edit

**Succession**:
The world changed: a fact stopped being true and another became true. The earlier fact is revised to end, and the later fact is recorded.
_Avoid_: update, replacement

**Correction**:
The earlier fact was wrong. It is invalidated and superseded by the right fact.
_Avoid_: fix, update, edit

**Retraction**:
An invalidation with nothing to replace the fact.
_Avoid_: deletion, forget

**Purge**:
The rare, audited removal of the content of a source or fact, leaving a record that it existed. It exists for legal erasure and for secrets stored by mistake, and is the single exception to keeping everything.
_Avoid_: delete, erase, forget

**Audit entry**:
One record of one change to memory: what changed, when, why, and what triggered it.
_Avoid_: log line, event, history row

**Trigger**:
What caused a change: an agent, a person, feedback, or a maintenance job.
_Avoid_: actor, initiator, cause

**Fact history**:
Every fact ever recorded for one subject and predicate, with the audit entries that explain each change.
_Avoid_: version history, changelog

### Keeping memory true

**Conflict**:
Two facts about the same subject and predicate that cannot both be current.
_Avoid_: contradiction (use only for the detection technique), clash

**Self-correction**:
Fixing wrong content: resolving a conflict or acting on feedback by succession, correction, or retraction. It needs new information.
_Avoid_: update handling

**Self-healing**:
Fixing damaged structure on a schedule: merging duplicate entities, repairing links, verifying stale facts, and archiving unused ones. It needs no new information.
_Avoid_: cleanup, garbage collection

**Correction policy**:
A domain's rule for what happens when a conflict is found: resolve it automatically, or propose the change for a person to approve.
_Avoid_: conflict strategy, approval mode

**Feedback**:
A signal from a user or agent that a recalled fact was wrong or right.
_Avoid_: rating, vote

**Entity resolution**:
Deciding whether a newly mentioned entity is one Factloom already knows.
_Avoid_: deduplication (reserved for the scheduled merge), entity linking

**Entity merge**:
Recording that two entities are the same thing, so that facts about either are read together. A merge can be undone.
_Avoid_: dedupe, combine

**Stale fact**:
A live fact that may no longer be true because its source has changed or it has not been verified for too long.
_Avoid_: outdated fact, old fact

**Orphaned fact**:
A live fact left without something it depends on, such as a source whose content was purged or an anchor that no longer resolves.
_Avoid_: dangling fact, broken fact

**Verification**:
Checking a fact against its source again. Deterministic checks come first and an LLM is used last.
_Avoid_: validation (reserved for schema checks), re-check

### Using memory

**Remember**:
To take new information, extract entities and facts from it, and record them with their source.
_Avoid_: ingest, save, store, add

**Recall**:
To answer a question with the facts that match it, filtered by time, each with its sources and confidence.
_Avoid_: search, retrieve, query, lookup

**Retrieval lane**:
One of the three ways recall finds candidate facts: by meaning (vector), by words (keyword), or by connection (graph).
_Avoid_: retriever, channel, strategy

**Rank fusion**:
Merging the ranked results of the retrieval lanes into one ranked list.
_Avoid_: reranking, score merging

**Score**:
A fact's rank-fusion result for one recall. It says how well the fact matches the question, not how true it is.
_Avoid_: confidence, relevance
