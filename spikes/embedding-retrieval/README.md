# Spike: retrieval quality of two local embedding models on code-memory statements

A standalone experiment. It is not part of any workspace and nothing imports it. Run and written
up on 2026-11-13; all sources accessed 2026-11-13.

## The question

Factloom stores short facts about a codebase and retrieves them with vector search plus keyword
search. Two free local embedding models are candidates (`docs/research/technical/embeddings.md`,
`docs/research/OPEN-QUESTIONS.md` items Q-25 and D-6):

- `nomic-ai/nomic-embed-text-v1.5` (768 dimensions, shortenable to 256)
- `BAAI/bge-small-en-v1.5` (384 dimensions)

Does either retrieve measurably better on statements of the kind a coding agent stores, alone and
when fused with a keyword ranking? What do they cost in size and time?

## How to run

```sh
cd spikes/embedding-retrieval
npm ci
node compare.mjs
```

Requires Node.js 22.13 or later and network access to `huggingface.co` on the first run (about
380 MB of model files are downloaded into `node_modules/.cache/embedding-spike-models/`). Later
runs work from the cache. A run takes about 10 seconds once the models are cached. npm is used on
purpose so that the install does not attach to a pnpm workspace.

Rankings and scores are deterministic: fixed corpus and query order, no randomness, ties broken by
corpus order. Two consecutive runs produced byte-identical output from `## Results` onward. Timings
change from run to run.

## What is pinned

| Package | Version | Role |
|---|---|---|
| `@huggingface/transformers` | 4.3.2 (latest on the npm registry, `npm view`, 2026-11-13) | Runs the ONNX models on CPU through `onnxruntime-node` |

BM25, reciprocal rank fusion and cosine similarity are about 80 lines of plain JavaScript in
`compare.mjs`, so there is no second dependency.

## What was measured

### Data (`cases.json`)

- **60 statements** about one fictional TypeScript project (a marina berth booking system):
  decisions and reasons, conventions, commands, environment problems, dependency choices, bug causes
  and fixes, ownership. Some are deliberately easy to confuse: test, lint, format and typecheck
  commands; three data stores with three purposes; an old error-handling convention and its
  replacement; five statements about authentication and authorisation; two out-of-memory problems.
- **40 queries**, each with the id of the one or two statements that answer it, in four groups:
  15 paraphrases with little word overlap, 10 keyword-style queries with identifiers, paths or
  version numbers, 10 "why" questions, and 5 hard ones where a near-neighbour statement is the
  tempting wrong answer.

**The gold labels were written before any model was run and have not been changed since.** No
label was corrected and no statement or query was reworded after seeing results.

### Model configurations

| Model repo (Hugging Face) | Revision on 2026-11-13 | dtype | ONNX file | Pooling | Text sent to the model |
|---|---|---|---|---|---|
| `nomic-ai/nomic-embed-text-v1.5` | `e9b6763` | q8 | `onnx/model_quantized.onnx` | mean | `search_document: ` + statement; `search_query: ` + query |
| `Xenova/bge-small-en-v1.5` | `ea104da` | fp32 | `onnx/model.onnx` | CLS | statement unchanged; query with or without the instruction below |
| `Xenova/bge-small-en-v1.5` | `ea104da` | q8 | `onnx/model_quantized.onnx` | CLS | as above |
| `Xenova/all-MiniLM-L6-v2` (floor) | `751bff3` | fp32 | `onnx/model.onnx` | mean | unchanged |

- The script does not pin a revision; it downloads `main`. The revisions above are what
  `https://huggingface.co/api/models/<repo>` reported on the day.
- `BAAI/bge-small-en-v1.5` has only an fp32 ONNX file, so the `Xenova/` conversion (which adds
  quantised files) was used, as in the earlier research. The fp32 files of both repos have the same
  size (133,093,490 bytes); whether they are byte-identical was not checked.
- bge query instruction, from the model list on the `BAAI/bge-small-en-v1.5` card:
  `Represent this sentence for searching relevant passages: `. The card says to add it to queries
  only and that v1.5 has "only a slight degradation" without it. Both were evaluated.
- bge pooling: the original repo's `1_Pooling/config.json` sets `pooling_mode_cls_token: true`, so
  CLS pooling was used. The `Xenova/bge-small-en-v1.5` card's example uses mean pooling; that
  variant was not evaluated.
- nomic at 256 dimensions follows the model card's Transformers.js example: layer normalisation
  over the 768 values, keep the first 256, normalise to unit length. The 768-dimension vectors are
  the mean-pooled output normalised to unit length.
- Similarity is the dot product of unit vectors (equal to cosine similarity), brute force over all
  60 statements.

### Keyword baseline and hybrid

- **BM25** (k1 = 1.2, b = 0.75) over the 60 statements. Tokens are lowercase runs of letters, digits
  and underscores. No stemming. It is not SQLite FTS5, which Factloom would use; FTS5 tokenises and
  matches differently.
- **Hybrid**: reciprocal rank fusion, score = sum over both rankings of 1 / (60 + rank). Three
  recipes are reported:
  - **A**: fuse the complete lists (all 60 embedding ranks, every statement with a BM25 score above
    zero). This was the only recipe planned.
  - **B**: fuse the top 10 of each list.
  - **C**: as B, with BM25 ignoring a fixed list of 64 English stop words.

#### Change made after the first run

Recipe A made every embedding model worse than it was alone (table below). The cause is visible in
the per-query ranks: a question such as "How long until a session credential stops working?" shares
only words like "a" and "how" with the corpus, so BM25 ranks unrelated statements, and fusion then
prefers statements that appear in both lists over the correct statement that appears in one.
Recipes B and C were added in response, to see whether two common adjustments change the picture.
This was a change to the fusion method after seeing results. It was applied identically to every
model, the stop-word list was written once and not adjusted, and all three recipes are reported.
Corpus, queries, labels and model settings were not touched.

### Metrics

- **recall@k**: relevant statements in the top k, divided by min(k, number of relevant statements),
  averaged over queries. For the 38 queries with one relevant statement this is the share of queries
  with the answer in the top k.
- **MRR@10**: mean of 1 / rank of the first relevant statement, 0 if it is not in the top 10.
- With 40 queries, **one query is 0.025** of recall@1 or recall@5. In the "hard" group one query
  is 0.200.
- **Load time**: the `pipeline()` call with files already cached.
- **Embed time**: mean wall-clock time per text, one text per call after one warm-up call, over the
  60 statements and 40 queries (80 queries for bge, which embeds them with and without the
  instruction).

### Machine

Linux x64 virtual machine (KVM), 4 vCPUs reported as "Intel(R) Xeon(R) Processor @ 2.30GHz", 16 GB
RAM, Node v22.23.4, CPU execution only. **This is not an Apple Silicon Mac. The timings and the
install size below do not predict what the owner's machine will show.**

## Results

Everything in this section is copied from the output of `node compare.mjs` on 2026-11-13. The
complete output, including every group for every configuration and the rank of the first relevant
statement for each of the 40 queries, is in `results-2026-11-13.txt`.

### Size and time

| Model repo | dtype | Pooling | ONNX file | Size on disk | Load (cached?) | Mean embed time per text |
|---|---|---|---|---|---|---|
| nomic-ai/nomic-embed-text-v1.5 | q8 | mean | model_quantized.onnx | 130.9 MB | 0.45 s (cached) | 12.7 ms over 100 texts |
| Xenova/bge-small-en-v1.5 | fp32 | cls | model.onnx | 126.9 MB | 0.24 s (cached) | 7.0 ms over 140 texts |
| Xenova/bge-small-en-v1.5 | q8 | cls | model_quantized.onnx | 32.4 MB | 0.13 s (cached) | 4.4 ms over 140 texts |
| Xenova/all-MiniLM-L6-v2 | fp32 | mean | model.onnx | 86.2 MB | 0.16 s (cached) | 3.9 ms over 100 texts |

Across three runs the embed time per text ranged over 11.3 to 12.7 ms (nomic q8), 5.8 to 7.0 ms
(bge fp32), 4.4 to 5.4 ms (bge q8) and 3.4 to 4.3 ms (MiniLM). The first run, which included the
downloads over a datacentre connection, loaded the models in 2.36 s, 1.49 s, 0.62 s and 1.18 s.

The earlier 20-sentence test in `docs/research/technical/embeddings.md` recorded 19 ms (nomic q8)
and 30 ms (bge fp32) per text on a similar VM. This run is faster for both and reverses their
order. The cause was not investigated; treat single-digit-millisecond differences here as
unreliable.

Install size (`du -sh`, linux-x64): `node_modules` is **745 MB** before any model is downloaded, the
same for every model because the runtime is the same (`onnxruntime-node` 548 MB, `onnxruntime-web`
141 MB). With the model cache it is 1.1 GB. Cache directories including tokenizer files: nomic
132 MB (q8 only), bge 161 MB (fp32 and q8 together), MiniLM 87 MB.

### All 40 queries: keyword baseline and embedding only

| Configuration | recall@1 | recall@5 | MRR@10 |
|---|---|---|---|
| BM25 only (keyword baseline) | 0.525 | 0.650 | 0.598 |
| BM25 only, ignoring stop words | 0.575 | 0.637 | 0.602 |
| nomic-v1.5 q8, 768d | 0.775 | 0.887 | 0.835 |
| nomic-v1.5 q8, 256d (Matryoshka) | 0.750 | 0.912 | 0.826 |
| bge-small-v1.5 fp32, query instruction | 0.800 | 0.900 | 0.834 |
| bge-small-v1.5 fp32, no instruction | 0.775 | 0.863 | 0.824 |
| bge-small-v1.5 q8, query instruction | 0.800 | 0.887 | 0.834 |
| bge-small-v1.5 q8, no instruction | 0.775 | 0.863 | 0.813 |
| all-MiniLM-L6-v2 fp32 (floor) | 0.850 | 0.950 | 0.887 |

### All 40 queries: hybrid recipe A: RRF over full lists (all 60 embedding ranks; every BM25 match) (k = 60)

| Configuration | recall@1 | recall@5 | MRR@10 |
|---|---|---|---|
| nomic-v1.5 q8, 768d + BM25 [A] | 0.675 | 0.787 | 0.720 |
| nomic-v1.5 q8, 256d (Matryoshka) + BM25 [A] | 0.675 | 0.738 | 0.714 |
| bge-small-v1.5 fp32, query instruction + BM25 [A] | 0.675 | 0.762 | 0.713 |
| bge-small-v1.5 fp32, no instruction + BM25 [A] | 0.675 | 0.738 | 0.705 |
| bge-small-v1.5 q8, query instruction + BM25 [A] | 0.675 | 0.738 | 0.709 |
| bge-small-v1.5 q8, no instruction + BM25 [A] | 0.625 | 0.738 | 0.683 |
| all-MiniLM-L6-v2 fp32 (floor) + BM25 [A] | 0.675 | 0.787 | 0.725 |

### All 40 queries: hybrid recipe B: RRF over the top 10 of each list (k = 60)

| Configuration | recall@1 | recall@5 | MRR@10 |
|---|---|---|---|
| nomic-v1.5 q8, 768d + BM25 [B] | 0.675 | 0.838 | 0.751 |
| nomic-v1.5 q8, 256d (Matryoshka) + BM25 [B] | 0.675 | 0.838 | 0.746 |
| bge-small-v1.5 fp32, query instruction + BM25 [B] | 0.675 | 0.813 | 0.748 |
| bge-small-v1.5 fp32, no instruction + BM25 [B] | 0.675 | 0.813 | 0.743 |
| bge-small-v1.5 q8, query instruction + BM25 [B] | 0.675 | 0.813 | 0.749 |
| bge-small-v1.5 q8, no instruction + BM25 [B] | 0.625 | 0.787 | 0.718 |
| all-MiniLM-L6-v2 fp32 (floor) + BM25 [B] | 0.675 | 0.863 | 0.764 |

### All 40 queries: hybrid recipe C: RRF over the top 10 of each list, BM25 ignoring stop words (k = 60)

| Configuration | recall@1 | recall@5 | MRR@10 |
|---|---|---|---|
| nomic-v1.5 q8, 768d + BM25 [C] | 0.700 | 0.887 | 0.782 |
| nomic-v1.5 q8, 256d (Matryoshka) + BM25 [C] | 0.700 | 0.887 | 0.766 |
| bge-small-v1.5 fp32, query instruction + BM25 [C] | 0.650 | 0.887 | 0.747 |
| bge-small-v1.5 fp32, no instruction + BM25 [C] | 0.625 | 0.863 | 0.728 |
| bge-small-v1.5 q8, query instruction + BM25 [C] | 0.600 | 0.887 | 0.722 |
| bge-small-v1.5 q8, no instruction + BM25 [C] | 0.625 | 0.838 | 0.722 |
| all-MiniLM-L6-v2 fp32 (floor) + BM25 [C] | 0.675 | 0.900 | 0.764 |

### By query group

Selected rows (keyword baseline, the main configuration of each model, alone and with recipe C).
Rows are copied unchanged; the other configurations are in `results-2026-11-13.txt`.

Group "paraphrase" (15 queries; one query is 0.067):

| Configuration | recall@1 | recall@5 | MRR@10 |
|---|---|---|---|
| BM25 only (keyword baseline) | 0.200 | 0.400 | 0.306 |
| nomic-v1.5 q8, 768d | 0.600 | 0.767 | 0.693 |
| bge-small-v1.5 fp32, query instruction | 0.667 | 0.800 | 0.711 |
| bge-small-v1.5 q8, query instruction | 0.667 | 0.767 | 0.711 |
| all-MiniLM-L6-v2 fp32 (floor) | 0.667 | 0.867 | 0.733 |
| nomic-v1.5 q8, 768d + BM25 [C] | 0.467 | 0.700 | 0.592 |
| bge-small-v1.5 fp32, query instruction + BM25 [C] | 0.400 | 0.700 | 0.560 |
| bge-small-v1.5 q8, query instruction + BM25 [C] | 0.267 | 0.700 | 0.494 |
| all-MiniLM-L6-v2 fp32 (floor) + BM25 [C] | 0.400 | 0.733 | 0.540 |

Group "keyword" (10 queries; one query is 0.100):

| Configuration | recall@1 | recall@5 | MRR@10 |
|---|---|---|---|
| BM25 only (keyword baseline) | 0.900 | 1.000 | 0.950 |
| nomic-v1.5 q8, 768d | 1.000 | 1.000 | 1.000 |
| bge-small-v1.5 fp32, query instruction | 1.000 | 1.000 | 1.000 |
| bge-small-v1.5 q8, query instruction | 1.000 | 1.000 | 1.000 |
| all-MiniLM-L6-v2 fp32 (floor) | 1.000 | 1.000 | 1.000 |
| nomic-v1.5 q8, 768d + BM25 [C] | 1.000 | 1.000 | 1.000 |
| bge-small-v1.5 fp32, query instruction + BM25 [C] | 1.000 | 1.000 | 1.000 |
| bge-small-v1.5 q8, query instruction + BM25 [C] | 1.000 | 1.000 | 1.000 |
| all-MiniLM-L6-v2 fp32 (floor) + BM25 [C] | 1.000 | 1.000 | 1.000 |

Group "why" (10 queries; one query is 0.100):

| Configuration | recall@1 | recall@5 | MRR@10 |
|---|---|---|---|
| BM25 only (keyword baseline) | 0.800 | 0.900 | 0.850 |
| nomic-v1.5 q8, 768d | 1.000 | 1.000 | 1.000 |
| bge-small-v1.5 fp32, query instruction | 0.900 | 1.000 | 0.920 |
| bge-small-v1.5 q8, query instruction | 0.800 | 1.000 | 0.870 |
| all-MiniLM-L6-v2 fp32 (floor) | 1.000 | 1.000 | 1.000 |
| nomic-v1.5 q8, 768d + BM25 [C] | 1.000 | 1.000 | 1.000 |
| bge-small-v1.5 fp32, query instruction + BM25 [C] | 0.900 | 1.000 | 0.920 |
| bge-small-v1.5 q8, query instruction + BM25 [C] | 0.900 | 1.000 | 0.920 |
| all-MiniLM-L6-v2 fp32 (floor) + BM25 [C] | 1.000 | 1.000 | 1.000 |

Group "hard" (5 queries; one query is 0.200):

| Configuration | recall@1 | recall@5 | MRR@10 |
|---|---|---|---|
| BM25 only (keyword baseline) | 0.200 | 0.200 | 0.267 |
| nomic-v1.5 q8, 768d | 0.400 | 0.800 | 0.600 |
| bge-small-v1.5 fp32, query instruction | 0.600 | 0.800 | 0.700 |
| bge-small-v1.5 q8, query instruction | 0.800 | 0.800 | 0.800 |
| all-MiniLM-L6-v2 fp32 (floor) | 0.800 | 1.000 | 0.900 |
| nomic-v1.5 q8, 768d + BM25 [C] | 0.200 | 1.000 | 0.480 |
| bge-small-v1.5 fp32, query instruction + BM25 [C] | 0.200 | 1.000 | 0.457 |
| bge-small-v1.5 q8, query instruction + BM25 [C] | 0.200 | 1.000 | 0.457 |
| all-MiniLM-L6-v2 fp32 (floor) + BM25 [C] | 0.200 | 1.000 | 0.490 |

### Paired comparison, nomic 768d against bge-small

For each pair the script counts the queries on which one configuration ranks the first relevant
statement higher than the other (11 means not in the top 10).

```text
"nomic-v1.5 q8, 768d" vs "bge-small-v1.5 fp32, query instruction"
  same rank of first relevant statement: 32 of 40
  first is better on 3: p13 (7 vs 11), p15 (1 vs 11), w03 (1 vs 5)
  second is better on 5: p01 (3 vs 4), p02 (1 vs 2), p03 (1 vs 2), p14 (3 vs 11), h01 (1 vs 2)

"nomic-v1.5 q8, 768d + BM25 [A]" vs "bge-small-v1.5 fp32, query instruction + BM25 [A]"
  same rank of first relevant statement: 34 of 40
  first is better on 3: p15 (1 vs 5), w03 (4 vs 10), h04 (5 vs 11)
  second is better on 3: p02 (2 vs 3), p07 (1 vs 3), h02 (5 vs 6)

"nomic-v1.5 q8, 768d + BM25 [B]" vs "bge-small-v1.5 fp32, query instruction + BM25 [B]"
  same rank of first relevant statement: 31 of 40
  first is better on 4: p05 (5 vs 6), p15 (1 vs 9), w03 (4 vs 9), h01 (2 vs 3)
  second is better on 5: p01 (5 vs 7), p02 (2 vs 3), p07 (1 vs 3), p14 (7 vs 11), h02 (4 vs 6)

"nomic-v1.5 q8, 768d + BM25 [C]" vs "bge-small-v1.5 fp32, query instruction + BM25 [C]"
  same rank of first relevant statement: 30 of 40
  first is better on 5: p05 (1 vs 2), p13 (8 vs 11), p15 (1 vs 11), w03 (1 vs 5), h01 (2 vs 3)
  second is better on 5: p02 (2 vs 6), p07 (2 vs 3), p11 (1 vs 2), p14 (7 vs 11), h02 (4 vs 5)

"nomic-v1.5 q8, 768d + BM25 [C]" vs "nomic-v1.5 q8, 256d (Matryoshka) + BM25 [C]"
  same rank of first relevant statement: 34 of 40
  first is better on 5: p01 (4 vs 5), p02 (6 vs 7), p04 (2 vs 3), p11 (2 vs 4), h01 (2 vs 3)
  second is better on 1: p13 (6 vs 8)
```

## What the numbers do and do not support

They support:

- **The two candidates are not separated on retrieval quality.** Embedding only, nomic 768d and
  bge-small with the instruction differ by one query at recall@1 (0.775 against 0.800), by half a
  query at recall@5, and by 0.001 in MRR@10. In the paired comparisons each model wins on 3 to 5
  queries and loses on 3 to 5, with 30 to 34 of 40 tied, under every recipe. That is within noise
  for 40 queries.
- **Under hybrid recipe C nomic is ahead of bge-small by two queries at recall@1** (0.700 against
  0.650 for fp32) and equal at recall@5. Under recipes A and B they are equal at recall@1 and within
  one query at recall@5. Two queries in one recipe out of three is not a result to choose a model
  on.
- **Both embedding models beat the keyword baseline alone** by 10 to 11 queries at recall@1 (0.775 to
  0.800 against 0.525), almost all of it in the paraphrase group. On keyword-style queries every
  method was at or near the ceiling, so that group says nothing about the models.
- **bge-small is smaller and was faster here.** Quantised, it is 32 MB against 131 MB for nomic and
  embedded a short text in about 5 ms against about 12 ms. Its vectors are half the size (384
  against 768 numbers). The install size of the runtime is identical.
- **The bge query instruction made a small, consistent difference**: one query at recall@1 and one
  to two at recall@5, in its favour, in the embedding-only runs. That is within noise, but it never
  hurt in those runs.
- **nomic truncated to 256 dimensions stayed within one query of nomic at 768** on every overall
  metric embedding only and under recipes B and C; under recipe A it was two queries lower at
  recall@5.
- **bge-small q8 and fp32 stayed within one query of each other** embedding only, and within two
  under recipe C.
- **Naive rank fusion lowered quality on this set.** Every hybrid recipe scored below the same
  embedding model alone at recall@1 (0.600 to 0.700 against 0.750 to 0.850). Recipe C brought
  recall@5 back to within one query of the embedding-only level for nomic and bge. The loss is concentrated in paraphrase
  and hard queries, where the keyword ranking is wrong and gets an equal vote. This is a finding
  about the fusion method on this data, and it affects all models alike.

They do not support:

- **Declaring a quality winner between nomic and bge-small.** The differences are one or two
  queries out of 40 and change direction between metrics and recipes.
- **Concluding that all-MiniLM-L6-v2 is the best model.** It had the highest embedding-only scores
  (0.850 recall@1, two to three queries ahead of the candidates), which is at the edge of noise and
  comes from one corpus written by one author. It does show that on short, clean, single-sentence
  English statements the oldest and smallest model was not worse, and that this test cannot tell
  these models apart.
- **Concluding that hybrid search is worse than vector search for Factloom.** The keyword side here
  is a plain BM25 with OR matching over natural-language questions, fused with equal weight. Real
  agent queries may contain more identifiers, FTS5 behaves differently, and weighted fusion or a
  keyword ranking used only when it has a strong match were not tried. What it does show is that
  the fusion recipe moved the scores more than the choice between the two candidate models did, so
  the recipe needs its own test.
- **Any statement about longer texts.** Every statement is one sentence. nomic accepts 8,192 tokens
  and bge-small 512; that difference was not exercised.
- **Any statement about speed or install size on Apple Silicon.**

## Limitations

- 60 statements and 40 queries. One query is 2.5 points of recall; no confidence intervals were
  computed, and none would be narrow.
- One fictional project. The statements are tidy, self-contained sentences; real stored memories
  will be messier, will overlap more, and a real store will hold thousands of them, where
  near-neighbours are far more common.
- One author wrote the statements, the queries and the labels, knowing which statements existed.
  The queries are therefore easier and better matched to the corpus than real ones. The "little
  word overlap" property of the paraphrase group was judged by eye, not measured.
- Only five hard queries; that group's numbers move by 0.200 per query.
- English only.
- Timings are from a 4-vCPU Linux VM, one text per call, three runs, with visible run-to-run
  variation and an unexplained difference from the earlier test. Batch embedding was not timed.
- The vendor-published benchmark figures quoted in `docs/research/technical/embeddings.md` (MTEB and
  others) were not reproduced and this spike says nothing about them.
- BM25 here is a small hand-written implementation, not SQLite FTS5. The stop-word list is ad hoc.
- The fusion recipes B and C were added after seeing recipe A's result (described above).
- Model revisions are not pinned by the script; a later upload to the same repo could change the
  numbers.
- Not tested: bge with mean pooling, nomic fp32, other quantisations, EmbeddingGemma, any hosted
  model.

## Sources (accessed 2026-11-13)

- `npm view @huggingface/transformers version`: 4.3.2.
- https://huggingface.co/nomic-ai/nomic-embed-text-v1.5 (prefixes, Transformers.js example with
  `layer_norm` and truncation) and `https://huggingface.co/api/models/nomic-ai/nomic-embed-text-v1.5/tree/main/onnx` (file list).
- https://huggingface.co/BAAI/bge-small-en-v1.5 (query instruction, guidance on when to use it),
  `1_Pooling/config.json` in the same repo (CLS pooling).
- https://huggingface.co/Xenova/bge-small-en-v1.5 and https://huggingface.co/Xenova/all-MiniLM-L6-v2
  (ONNX conversions and file lists).
- `docs/research/technical/embeddings.md` in this repository (earlier 20-sentence test).
- Everything under "Results": run locally on 2026-11-13; output in `results-2026-11-13.txt`.
