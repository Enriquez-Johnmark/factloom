# Contradiction detection between facts

Accessed: 2026-11-13.

## Question

When a newly extracted fact arrives, how does a memory system decide whether it duplicates, refines,
succeeds or contradicts a stored fact? What do Graphiti and Mem0 actually do, how accurate is this
known to be, and what is the cheapest design Factloom can ship that fails safely?

## Findings

### Four outcomes that are easy to confuse

| Relation of new fact N to stored fact O | Example | Correct action |
|---|---|---|
| Duplicate | O: "service uses Postgres"; N: "the service runs on PostgreSQL" | Keep O, attach N's source to it |
| Refinement | O: "service uses Postgres"; N: "service uses Postgres 16 with pgvector" | Keep both, or replace O with N and link them; O was not false |
| Temporal succession | O: "service uses MySQL"; N: "service was migrated to Postgres in June" | Close O's `valid_to` at N's `valid_from`; O stays true for its period |
| Contradiction (correction) | O: "service uses MySQL"; N: "it never used MySQL, that was a different service" | Invalidate O (transaction time); O was never true |
| Unrelated / compatible | O: "Alice owns the service"; N: "Alice fixed a bug in the service" | Keep both |

Succession changes valid time; correction changes transaction time. Treating them as one operation
is the modelling error that bi-temporal storage exists to prevent (see bi-temporal-modelling.md).

### NLI models versus LLM judgment

1. **NLI is the classical formulation.** The SNLI corpus (Bowman, Angeli, Potts and Manning, 2015,
   570K sentence pairs, https://arxiv.org/abs/1508.05326) and MultiNLI (Williams, Nangia and Bowman,
   2017, 433k examples across ten genres, https://arxiv.org/abs/1704.05426) frame the task as
   inference about entailment and contradiction between two sentences. **Confirmed** (abstracts).

2. **NLI models have a granularity problem outside sentence pairs.** Laban, Schnabel, Bennett and
   Hearst, "SummaC: Re-Visiting NLI-based Models for Inconsistency Detection in Summarization" (2021,
   https://arxiv.org/abs/2111.09525) report that earlier work "suffered from a mismatch in input
   granularity between NLI datasets (sentence-level), and inconsistency detection (document level)".
   **Confirmed** (abstract). Extracted facts are short sentences, so the mismatch is smaller for
   Factloom, but NLI labels have no notion of time: "uses MySQL" and "uses Postgres" are neither a
   textbook contradiction nor entailment without world knowledge about the predicate. **Likely**
   (reasoning from the label definitions; not measured here).

3. **LLMs handle explicit conflicts better than implicit ones.** Hou et al., "WikiContradict: A
   Benchmark for Evaluating LLMs on Real-World Knowledge Conflicts from Wikipedia" (2024, 253
   human-annotated instances, https://arxiv.org/abs/2406.13805): when given two contradictory
   passages, "all models struggle to generate answers that accurately reflect the conflicting nature
   of the context, especially for implicit conflicts requiring reasoning". **Confirmed** (abstract).
   This measures question answering over conflicting passages, not pairwise fact classification, so
   it is indirect evidence.

4. **No reviewed memory system uses an NLI model for this step.** Graphiti and Mem0 both use an LLM
   prompt (findings 5 to 11). **Confirmed** for the code read; other systems were not surveyed.

### Graphiti (commit `ebef986a`, 2026-11-11, version 0.31.2)

5. **Two candidate sets per new edge.** `resolve_extracted_edges` runs a hybrid search (BM25 plus
   cosine, fused by RRF, config `EDGE_HYBRID_SEARCH_RRF`) twice with the new fact text: once filtered
   to edges between the same two entities (either direction), used as duplicate candidates
   ("EXISTING FACTS"), and once unfiltered within the group, used as "FACT INVALIDATION CANDIDATES".
   Source: `graphiti_core/utils/maintenance/edge_operations.py`. **Confirmed.** The Zep paper states
   the reason for the endpoint constraint: it "prevents erroneous combinations of similar edges
   between different entities" and reduces cost (https://arxiv.org/abs/2501.13956). **Confirmed.**

6. **A verbatim match skips the LLM.** If the normalised fact text and endpoints equal an existing
   edge, that edge is reused and the new episode is appended to its provenance. Source:
   `_dedupe_extracted_edge`, same file. **Confirmed.**

7. **One small-model call returns two index lists.** The prompt `dedupe_edges.resolve_edge` returns
   `duplicate_facts` and `contradicted_facts`; it runs with `ModelSize.small`. The system message is:
   "You are a fact deduplication assistant. NEVER mark facts as contradicted unless the new fact
   explicitly makes the old fact false." The prompt adds that a contradiction "requires explicit
   evidence that the old fact stopped being true or was replaced", and lists things that are not
   contradictions: recency alone, a new event involving the same entities, progress or status updates
   against role or ownership facts. Differences in "numeric values, dates, or key qualifiers" block a
   duplicate verdict. Source: `graphiti_core/prompts/dedupe_edges.py`. **Confirmed.** The amount of
   negative instruction suggests that false contradictions were the failure seen in practice.
   **Likely** (inference from the prompt text; no changelog was read).

8. **Time decides direction, not the LLM.** After the LLM names contradicted edges,
   `resolve_edge_contradictions` skips candidates whose validity interval does not overlap the new
   edge, and invalidates a candidate only if its `valid_at` is earlier than the new edge's
   `valid_at`. If a candidate started later than the new edge, the new edge is the one marked expired
   (`_apply_temporal_invalidation`). **Confirmed.** So Graphiti implements succession and correction
   with the same mechanism: the older fact gets `invalid_at` set to the newer fact's `valid_at`.
   The paper says the system "consistently prioritizes new information when determining edge
   invalidation". **Confirmed.**

9. **Graphiti has no predicate cardinality model in this step.** The prompt and the temporal logic
   do not distinguish single-valued from multi-valued relations; the LLM decides case by case from
   the fact text. **Confirmed** for the two files cited.

### Mem0

10. **The paper describes a four-operation update step.** For each extracted fact, the system
    retrieves the top similar memories (10 in the experiments) and an LLM chooses, through a tool
    call, one of ADD, UPDATE, DELETE ("removal of memories contradicted by new information") or NOOP.
    Chhikara, Khant, Aryan, Singh and Yadav, "Mem0: Building Production-Ready AI Agents with Scalable
    Long-Term Memory" (2025, https://arxiv.org/abs/2504.19413). **Confirmed.** In this design a
    contradicted memory is deleted and an updated one is overwritten, so history is not kept in the
    primary store.

11. **The current open-source code no longer does this on write.** In `mem0ai/mem0` at commit
    `f1791daa` (2026-11-06, version 2.2.1), `Memory.add` retrieves the top 10 existing memories, makes
    a single LLM call with `ADDITIVE_EXTRACTION_PROMPT` ("Your sole operation is ADD"), skips exact
    duplicates by MD5 hash of the text, and stores new memories with optional `linked_memory_ids`
    pointing at related existing memories ("same topic, overlapping entities, updated/shifted
    preference, follow-up event"). The older `DEFAULT_UPDATE_MEMORY_PROMPT` (ADD / UPDATE / DELETE /
    NONE) is still defined in `mem0/configs/prompts.py`, but `mem0/memory/main.py` does not reference
    it and contains no UPDATE or DELETE event handling in the add path. **Confirmed** by reading and
    searching those files. Why the project moved to an additive design was not researched;
    **unverified**.

### Functional versus multi-valued predicates

12. **Whether two different objects conflict depends on the predicate.** "born in X" admits one
    value; "knows language X" admits many. Wikidata encodes this as a per-property "single-value
    constraint", and notes that it holds only "generally": several sourced values may coexist and one
    can be ranked preferred.
    Source: https://www.wikidata.org/wiki/Help:Property_constraints_portal/Single_value.
    **Confirmed.** A third class matters for memory systems: single-valued at any instant but
    changing over time ("current employer", "default branch", "database used"). For that class two
    different objects conflict only if their valid-time intervals overlap. **Likely** (design
    reasoning; consistent with finding 8).

### Measured accuracy

| Measurement | Result | Source | Label |
|---|---|---|---|
| Precision/recall of Graphiti's contradiction prompt | Not published | Zep paper and repository read | Confirmed absence |
| Precision/recall of Mem0's update step | Not published | Mem0 paper read | Confirmed absence |
| Zep on LongMemEval "knowledge-update" questions (end to end) | gpt-4o: 83.3% vs 78.2% full-context; gpt-4o-mini: 74.4% vs 76.9% full-context | arXiv:2501.13956, question-type table | Confirmed (vendor-reported) |
| MemoryAgentBench "selective forgetting" (contradictory evidence) | "all methods fail on the multi-hop situation (with achieving at most 28% accuracy)" | Hu, Wang and McAuley, 2025, https://arxiv.org/abs/2507.05257 | Confirmed |

The end-to-end numbers mix extraction, invalidation, retrieval and answer generation, so they bound
the step loosely at best. The honest summary: nobody has published how often this step is right.

### Cost control techniques seen in the sources

| Technique | Where | Label |
|---|---|---|
| Skip the LLM on verbatim duplicates | Graphiti finding 6; Mem0 hash check, finding 11 | Confirmed |
| Restrict candidates by endpoints before semantic search | Graphiti finding 5 | Confirmed |
| Batch all candidates for one new fact into one call | Graphiti finding 7 | Confirmed |
| Use the small model tier for the judgment | Graphiti finding 7 | Confirmed |
| Give the LLM integer indexes instead of UUIDs and validate the returned range | Graphiti `_dedupe_extracted_edge`; Mem0 "Map UUIDs to integers (anti-hallucination)" comment | Confirmed |
| Decide direction and dates in code, not in the prompt | Graphiti finding 8 | Confirmed |

## What it means for Factloom

Design for phase 2 (self-correction at write time):

1. **Candidate selection, in order.** (a) Live facts with the same subject entity and the same
   predicate: one indexed query, no model call. (b) If Factloom's predicates are free text rather
   than a fixed vocabulary, add the top-k hybrid-search neighbours restricted to the same subject
   entity. Do not search the whole graph for contradictions; a fact about another subject is almost
   never a contradiction, and Graphiti's long list of prompt prohibitions (finding 7) shows what the
   wider net costs.
2. **Deterministic shortcuts before any model call.** Same subject, predicate and normalised object:
   duplicate, attach the source. No candidates: plain insert.
3. **One LLM call per new fact, all candidates together, structured output.** Ask for exactly one
   label per candidate from: `duplicate`, `refines`, `succeeds`, `contradicts`, `unrelated`, plus a
   short reason. Validate with Zod; an invalid response is treated as `unrelated` and logged. Use
   integer indexes for candidates.
4. **Code, not the model, applies the outcome**, using the bi-temporal rules:

   | Label | Effect |
   |---|---|
   | `duplicate` | No new fact; add a source link to the stored fact |
   | `refines` | Insert N; link `kind = 'refinement'`; O stays live unless N strictly contains O's content |
   | `succeeds` | Insert N; replace O by a copy with `valid_to = N.valid_from`; link `kind = 'succession'` |
   | `contradicts` | Insert N; set `O.invalidated_at`; link `kind = 'correction'` |
   | `unrelated` | Insert N |

   If N has no usable `valid_from`, use the source's observed time, as Graphiti does with its
   reference time.
5. **A small predicate cardinality hint.** One nullable column or config map:
   `single` (one value at a time), `multi`, or unknown. For `multi`, skip the contradiction call
   unless the object matches. For `single`, a different object with overlapping validity is a
   candidate by construction. Adapters supply the map; the core ships a handful for code memory.
   Unknown predicates always go to the LLM.
6. **Fail safe.** Every outcome is "invalidate and link", never delete, so a wrong verdict is
   reversible by invalidating the link's effect. Low-confidence or `contradicts` verdicts can be
   routed to human approval per adapter policy (already a settled data rule).
7. **Record the verdict** (candidates, labels, model, prompt version) in the audit log. This is the
   only way to measure the step later, given that no published accuracy exists.

Do not build yet:

- An NLI model. It adds a Python or ONNX dependency, has no time semantics, and no reviewed system
  uses one. Revisit only if LLM cost becomes the bottleneck and a labelled set exists to compare on.
- Graph-wide or multi-hop inconsistency detection (A implies B, B contradicts C).
- Source-reliability weighting or voting between sources. "Newest source wins unless policy says
  ask" is enough to start.
- Automatic predicate cardinality learning.
- Re-checking old facts against each other in bulk. That belongs to self-healing (phase 3) and should
  reuse the same call.

## Open questions

- **Unverified:** the accuracy of a five-label verdict from Claude on Factloom's kind of facts. This
  is the first thing the evaluation set must measure (see evaluation.md), including the rate of false
  `contradicts`.
- **Unverified:** why Mem0 replaced its update step with additive extraction and linking, and how
  stale memories are handled at read time in that design beyond an `expiration_date` payload check.
- Should `refines` invalidate the less specific fact? Keeping both is safer but adds near-duplicates
  to retrieval. Decide with retrieval evaluation.
- Free-text predicates versus a controlled vocabulary: the candidate query in step 1(a) only works
  well if predicates are normalised. This interacts with extraction design and is not settled here.
- How to handle a new fact that is older than the stored one (late-arriving history)? Graphiti
  expires the new edge (finding 8). The bi-temporal equivalent is to insert N already closed at
  O's `valid_from`; confirm with test cases.
