# Entity resolution for LLM-extracted knowledge graphs

Accessed: 2026-11-13.

## Question

When an LLM extracts entities from text, the same real-world thing arrives under many names
("Postgres", "PostgreSQL", "the database"). How do existing memory systems decide that two mentions
are the same entity, what goes wrong, and what is the simplest pipeline Factloom can ship on SQLite
that stays correctable when it merges wrongly?

## Findings

### The standard shape of the problem

1. **Entity resolution is usually split into blocking and matching.** Blocking cheaply reduces the
   candidate pairs; matching decides on each remaining pair. Papadakis, Skoutas, Thanos and Palpanas,
   "A Survey of Blocking and Filtering Techniques for Entity Resolution" (2019,
   https://arxiv.org/abs/1905.06167). **Confirmed** (title, authors and year checked on arXiv; the
   characterisation is from the abstract).

2. **LLMs are competitive matchers without task-specific training, but prompt-sensitive.** Peeters,
   Steiner and Bizer, "Entity Matching using Large Language Models" (2023, published at EDBT 2025,
   https://arxiv.org/abs/2310.11244): "the best LLMs require no or only a few training examples to
   perform comparably to PLMs that were fine-tuned using thousands of examples", and "there is no
   single best prompt but ... the prompt needs to be tuned for each model/dataset combination".
   **Confirmed** (abstract). The benchmarks in that paper are product and bibliographic records, not
   entities extracted from conversations or code, so transfer to Factloom's data is **unverified**.

### What existing systems do (source code read on 2026-11-13)

| System | Version / commit | Blocking (candidates) | Matching | Merge record |
|---|---|---|---|---|
| Graphiti | 0.31.2, `ebef986a` (2026-11-11) | Cosine search on name embedding, top 15, min score 0.6, same `group_id`; optional exact-name and identity-property lookups | Staged: identity properties, exact normalised name, MinHash/LSH fuzzy (Jaccard >= 0.9, only for high-entropy names), then LLM | New mention is mapped to the existing node's UUID before saving |
| Mem0 | 2.2.1, `f1791daa` (2026-11-06) | Scope filter (`user_id` / `agent_id` / `run_id`) | Exact normalised text, else top-1 embedding match with score >= 0.95 | Entity row keeps `linked_memory_ids` |
| Cognee | 1.6.8, `4053f6cc` (2026-11-13) | None (id is derived from the name) | Deterministic id from the entity name; optional ontology fuzzy match | None needed: same name gives same id |
| GraphRAG | 3.3.0, `34b2b67a` (2026-11-01) | None | Exact match on (`title`, `type`) after upper-casing | Descriptions and source ids aggregated into lists |

3. **Graphiti: semantic candidates first, then deterministic rules, then the LLM.**
   `resolve_extracted_nodes` (docstring: "Resolve nodes with semantic retrieval first, then
   deterministic and LLM dedup") collects candidates per extracted node, tries identity properties,
   then `_resolve_with_similarity`, and only sends unresolved nodes to `_resolve_with_llm`. Constants:
   `NODE_DEDUP_CANDIDATE_LIMIT = 15`, `NODE_DEDUP_COSINE_MIN_SCORE = 0.6`. Source:
   `graphiti_core/utils/maintenance/node_operations.py`. **Confirmed.**

4. **Graphiti's deterministic stage is deliberately conservative.** In
   `graphiti_core/utils/maintenance/dedup_helpers.py`: exact match uses lower-casing and whitespace
   collapse; one exact match resolves, several exact matches are "Ambiguous ... Escalate to LLM";
   fuzzy matching uses 3-gram shingles, MinHash (32 permutations, band size 4) and requires Jaccard
   similarity >= 0.9; an "entropy gate" (`_NAME_ENTROPY_THRESHOLD = 1.5`, `_MIN_NAME_LENGTH = 6`,
   `_MIN_TOKEN_COUNT = 2`) sends short or low-entropy names to the LLM because, per the code comment,
   they "produce unreliable shingle sets". **Confirmed.**

5. **Graphiti's LLM prompt sees names, types and summaries and returns one candidate id or -1.** The
   prompt's own examples include a negative case: "Java" (programming language) versus "Java"
   (Location) gives "-1 (same name but distinct real-world things)". Source:
   `graphiti_core/prompts/dedupe_nodes.py`. **Confirmed.** The code validates the response
   ("guardrails ... ignore malformed or duplicate LLM responses"). **Confirmed.**

6. **Graphiti merges at write time.** A resolved mention is replaced by the existing node
   (`state.uuid_map[node.uuid] = match.uuid`); non-empty attributes of the new mention overwrite the
   existing node's attributes (`_merge_non_empty_attributes`). Source: `dedup_helpers.py`.
   **Confirmed.** A search of `graphiti_core` for functions named like merge, unmerge or split found
   none, so undoing a wrong merge appears to require manual graph edits. **Likely** (absence of a
   feature is hard to prove from a text search).

7. **The Zep paper describes an earlier, simpler pipeline.** Entity names are embedded, candidates
   are found by cosine similarity plus full-text search over names and summaries, and "these candidate
   nodes, together with the episode context, are then processed through an LLM using our entity
   resolution prompt". Rasmussen et al., "Zep: A Temporal Knowledge Graph Architecture for Agent
   Memory" (2025, https://arxiv.org/abs/2501.13956). **Confirmed.** The deterministic stages in
   finding 4 were added in the code after the paper; the paper does not report entity resolution
   accuracy. **Confirmed** (no such figure in the text).

8. **Mem0 uses a single high embedding threshold.** `_upsert_entity` looks for an exact normalised
   text match, otherwise takes the top-1 vector hit and accepts it only if `score >= 0.95`; on a match
   it appends the memory id to the entity's `linked_memory_ids`, otherwise it inserts a new entity.
   No LLM is involved. Source: `mem0/memory/main.py`. **Confirmed.** In this version entities are a
   retrieval aid (entity boosts in search), not graph nodes with typed edges. **Confirmed** for the
   search path in the same file.

9. **Cognee derives the node id from the name.** `generate_node_id` returns
   `uuid5(NAMESPACE_OID, node_id.lower().replace(" ", "_").replace("'", ""))`
   (`cognee/infrastructure/engine/utils/generate_node_id.py`), and
   `expand_with_nodes_and_edges.py` groups extracted nodes by a name-based entity id
   (`Entity.id_for(node.name)`). For `Entity` nodes the id is namespaced by the class: `id_for`
   computes a UUIDv5 over the class name and the name (`Entity:<name>`;
   `cognee/infrastructure/engine/models/DataPoint.py`, `cognee/modules/engine/models/Entity.py`),
   so two node types cannot collide on the same string. Within one type the name alone decides
   identity. An optional ontology resolver uses `difflib.get_close_matches` with a
   cutoff described in the code as "80%" and "tuned for single names"
   (`cognee/modules/ontology/`). **Confirmed.** Consequence: "Java" the island and "Java" the
   language share a node unless types or an ontology separate them; "Postgres" and "PostgreSQL" do
   not merge. **Likely** (follows from the id function; not run).

10. **GraphRAG merges by exact title and type.** The extractor upper-cases entity names and types
    (`graph_extractor.py`), and `_merge_entities` does `groupby(["title", "type"])`, aggregating
    descriptions and source ids into lists
    (`packages/graphrag/graphrag/index/operations/extract_graph/extract_graph.py`). Descriptions are
    later summarised by an LLM (`summarize_descriptions`). **Confirmed.** The GraphRAG paper is Edge
    et al., "From Local to Global: A Graph RAG Approach to Query-Focused Summarization" (2024,
    https://arxiv.org/abs/2404.16130). **Confirmed** (metadata only; the paper was not read for this
    document).

11. **HippoRAG links near-duplicates instead of merging them.** It adds "synonymy" edges between
    entity nodes whose embedding cosine similarity exceeds a threshold (0.8 in the paper's settings)
    and lets graph search flow across them. Gutiérrez et al., "HippoRAG: Neurobiologically Inspired
    Long-Term Memory for Large Language Models" (NeurIPS 2024, https://arxiv.org/abs/2405.14831).
    **Confirmed.** This is a reversible alternative to merging: the link can be removed without
    rewriting any fact.

### Failure modes

| Failure | Mechanism | Evidence |
|---|---|---|
| Over-merging homonyms | Same or similar name, different thing (Java/Java; two people named Sam) | Graphiti's prompt carries explicit negative examples (finding 5); name-keyed ids cannot separate them (findings 9, 10) |
| Over-merging short names | Fuzzy string similarity is unreliable on short or repetitive names | Graphiti's entropy gate (finding 4) |
| Under-merging aliases | Exact-match systems keep "NYC" and "New York City" apart | Findings 9 and 10; Graphiti prompt's positive examples (finding 5) |
| Embedding thresholds are model-specific | 0.6 (Graphiti candidates), 0.8 (HippoRAG links), 0.95 (Mem0 auto-accept) are tuned for different models and purposes | Findings 3, 8, 11 |
| Attribute loss on merge | Later mention overwrites earlier attributes | Finding 6 |
| Irreversibility | Once facts point at the survivor, the original grouping is not recorded | Finding 6 |

No reviewed source publishes a measured over-merge rate for an LLM memory system. **Confirmed** as an
absence in the sources read; whether such a measurement exists elsewhere is **unverified**.

## What it means for Factloom

An asymmetry drives the design: an under-merge costs some recall and can be fixed later by the
self-healing job; an over-merge corrupts every fact attached to the merged entity and, without
provenance, cannot be undone. So: merge late, merge conservatively, and never destroy the evidence.

Recommended pipeline for phase 1 (write time), in order; stop at the first stage that decides:

| Stage | Rule | Decision |
|---|---|---|
| 0. Scope | Only compare within the same namespace (project/repo) and compatible entity type | Blocking |
| 1. Exact | Normalised name equal (Unicode NFKC, lower-case, trim, collapse whitespace) and exactly one candidate | Same entity |
| 2. Alias | Normalised name equals a stored alias of exactly one entity | Same entity |
| 3. Otherwise | No match, or more than one candidate | Create a new entity |

Phase 3 (self-healing, scheduled) adds:

| Stage | Rule | Decision |
|---|---|---|
| 4. Candidates | Top-k embedding neighbours on "name + type + short description" above a loose threshold, within scope | Candidate pairs only, never an automatic merge |
| 5. LLM adjudication | Claude sees both entities with types, descriptions and a few facts each; answers same / different / unsure | Merge only on "same"; policy per adapter may require human approval |

Data model rules (needed from day one, even though merging comes later). An independent review
questioned whether all of these are needed before phase 3; that is recorded as open in
`../OPEN-QUESTIONS.md`, section C.

1. **Mentions are first-class.** Every fact endpoint references an `entity_id`, and every extraction
   stores the surface form it saw (`entity_mention(entity_id, surface_form, source_id, created_at)`).
   Without this a merge cannot be audited or reversed.
2. **Aliases are rows**, `entity_alias(entity_id, normalised_name, origin, created_at)`, not a JSON
   array, so stage 2 is an indexed lookup.
3. **Merge is a redirect, not a rewrite.** A merge inserts
   `entity_merge(id, loser_id, survivor_id, method, confidence, decided_by, created_at, reverted_at)`
   and sets `entity.merged_into = survivor_id` on the loser. Facts keep their original `entity_id`;
   reads resolve through the redirect (one join or a small recursive lookup). Reverting a merge is
   then: set `reverted_at`, clear `merged_into`. No fact rows change either way, which is consistent
   with "invalidate, never delete".
4. **Never merge attributes destructively.** Descriptions of a merged entity are derived (for
   example regenerated from its facts), not overwritten.
5. **Log every decision** (stage, candidates, scores, model, outcome) in the audit log. That log is
   also the raw material for an evaluation set (see evaluation.md).

For coding-agent memory specifically, many entities have a natural key that makes stage 1 strong:
file paths, package names, symbol names, URLs, issue numbers. Treat such identifiers as identity
properties (Graphiti has the same notion, finding 3) and resolve on them before names.

Do not build yet:

- MinHash/LSH, phonetic matching or learned matchers. At phase 1 volumes an indexed equality lookup
  plus, later, a vector top-k is sufficient blocking.
- Automatic merging on embedding similarity alone, at any threshold.
- Transitive merge clustering (union-find over pairs). Adjudicate pairs; a redirect chain of length
  greater than one is acceptable and can be flattened later.
- Cross-namespace resolution and entity type hierarchies.
- Splitting an entity that was wrongly created as one (as opposed to wrongly merged). It needs
  per-fact reassignment; defer until a real case appears.

## Open questions

- **Unverified:** how well Claude adjudicates entity pairs drawn from code-related text. Needs a
  small labelled set (see evaluation.md).
- **Unverified:** a suitable loose candidate threshold for whichever embedding model Factloom
  chooses. The thresholds in the table above are not transferable between models.
- **Unverified:** whether Graphiti persists `IS_DUPLICATE_OF` edges in the standard ingestion path.
  The relation name appears in `edge_operations.py` (`filter_existing_duplicate_of_edges`), but its
  callers were not traced.
- Should write-time resolution use the LLM at all in phase 2, when an extracted name matches several
  existing entities? The conservative default above (create new, let healing merge) trades recall
  for safety; revisit with data.
- How should facts be displayed when their subject was merged and later un-merged between two
  queries? Probably acceptable as-is, because reads resolve redirects at query time.
