# Recall defaults chosen by measurement

Status: accepted

`recall` ranks with the vector lane at weight 1, the keyword lane at weight 0.5, the graph lane at weight 0, a fusion constant `k` of 1, and lanes of 50 facts. These are the values of `DEFAULT_RECALL_SETTINGS` in `@factloom/graph-rag`. [ADR 0017](0017-rank-fusion-in-typescript-with-time-filtering-in-each-lane.md) left the weights open; this record closes that question for phase 1. It does not change ADR 0017.

## Why

On the retrieval eval set of FL-033, 40 questions over the statements of the embedding spike, these defaults had the highest recall@1 and the highest MRR@10 of the 26 variants measured. Two other variants tie with them on those two measures (the same weights with the graph lane at 0.25 or 0.5) and score lower at recall@5. Only hybrids with the keyword lane at 0.5 and `k = 1` beat the vector lane alone at recall@1:

| Settings | recall@1 | recall@5 | MRR@10 |
|---|---|---|---|
| Defaults: vector 1, keyword 0.5, graph 0, k 1 | 0.825 | 0.887 | 0.849 |
| Vector lane only | 0.800 | 0.900 | 0.840 |
| Keyword lane only | 0.500 | 0.650 | 0.575 |
| Provisional settings of FL-031: vector 1, keyword 1, graph 1, k 60 | 0.475 | 0.713 | 0.576 |

Two choices carried the result:

- **k = 1 instead of 60.** With `k = 60` every hybrid variant scored below the vector lane alone at recall@1 (at best 0.700). With `k = 1` the first places of the vector lane dominate the fusion, and a lower keyword weight keeps the keyword lane from overruling them on natural-language questions, while it still lifts the facts whose identifiers match. The "hard" group of five questions shows it most: 0.200 at recall@1 with every `k = 60` hybrid, 0.800 with the defaults.
- **The graph lane at weight 0.** The best variants have it at 0, and a graph weight above 0 raised recall@1 or MRR@10 only where both stayed below the vector lane alone. At weight 1 it lowered recall@1 in five of the six pairs; the exception is vector 1, keyword 1, `k` 1, where it went from 0.675 to 0.700. On this set the graph lane does not help (Q-28).

The defaults are 0.013 below the vector lane alone at recall@5, as are two `k = 1` variants with the keyword lane at 0.25 that reach 0.900 there but score 0.800 at recall@1. The gain at recall@1 and at MRR@10 is worth that, because an agent reads the first facts first.

## Measurements

Measured with `pnpm eval:retrieval` in the eval job of the workflow, run https://github.com/Enriquez-Johnmark/factloom/actions/runs/43920596116 on commit d2a9b1e: Linux x64 (`ubuntu-24.04` runner, kernel 7.0.0-1017-azure, AMD EPYC 9V74), Node.js v22.23.4, embedding model `Xenova/bge-small-en-v1.5` at revision `ea104dacec62c0de699686887e3f920caeb4f3e3`, quantised `q8`, with CLS pooling. A run on the session's own Linux x64 machine gave the same numbers for every variant on the whole set.

Every variant, on the whole set of 40 questions:

| Vector | Keyword | Graph | k | recall@1 | recall@5 | MRR@10 |
|---|---|---|---|---|---|---|
| 1 | 0 | 0 | 60 | 0.800 | 0.900 | 0.840 |
| 0 | 1 | 0 | 60 | 0.500 | 0.650 | 0.575 |
| 1 | 1 | 0 | 60 | 0.650 | 0.738 | 0.695 |
| 1 | 1 | 0.25 | 60 | 0.650 | 0.738 | 0.695 |
| 1 | 1 | 0.5 | 60 | 0.575 | 0.738 | 0.655 |
| 1 | 1 | 1 | 60 | 0.475 | 0.713 | 0.576 |
| 1 | 0.5 | 0 | 60 | 0.675 | 0.762 | 0.717 |
| 1 | 0.5 | 0.25 | 60 | 0.625 | 0.738 | 0.688 |
| 1 | 0.5 | 0.5 | 60 | 0.525 | 0.738 | 0.630 |
| 1 | 0.5 | 1 | 60 | 0.350 | 0.688 | 0.503 |
| 1 | 0.25 | 0 | 60 | 0.700 | 0.762 | 0.733 |
| 1 | 0.25 | 0.25 | 60 | 0.600 | 0.762 | 0.685 |
| 1 | 0.25 | 0.5 | 60 | 0.525 | 0.762 | 0.632 |
| 1 | 0.25 | 1 | 60 | 0.300 | 0.625 | 0.462 |
| 1 | 1 | 0 | 1 | 0.675 | 0.838 | 0.758 |
| 1 | 1 | 0.25 | 1 | 0.675 | 0.863 | 0.753 |
| 1 | 1 | 0.5 | 1 | 0.675 | 0.863 | 0.753 |
| 1 | 1 | 1 | 1 | 0.700 | 0.838 | 0.759 |
| 1 | 0.5 | 0 | 1 | 0.825 | 0.887 | 0.849 |
| 1 | 0.5 | 0.25 | 1 | 0.825 | 0.863 | 0.846 |
| 1 | 0.5 | 0.5 | 1 | 0.825 | 0.863 | 0.849 |
| 1 | 0.5 | 1 | 1 | 0.725 | 0.863 | 0.792 |
| 1 | 0.25 | 0 | 1 | 0.800 | 0.900 | 0.838 |
| 1 | 0.25 | 0.25 | 1 | 0.800 | 0.900 | 0.843 |
| 1 | 0.25 | 0.5 | 1 | 0.800 | 0.863 | 0.842 |
| 1 | 0.25 | 1 | 1 | 0.725 | 0.850 | 0.792 |

The numbers for each question group are in the log of the same run.

The test "the default settings meet the bar", under `pnpm eval`, holds these defaults to recall@1 not below the vector lane alone in the same run, and to recall@1, recall@5 and MRR@10 within 0.025, one question in 40, of the first row of the first table.

## Limits

- The set has 40 questions over one small set of statements, written by the same author as the code. One question moves recall@1 by 0.025. The weights were chosen on this set and not tested on another, so they may fit it more closely than they fit real memory.
- The lane list length stayed at 50; it was not varied.
- The graph lane is computed and then given no weight. Its read is bounded (Q-14), so its cost is small; removing it is a separate decision if a measurement asks for it.
- Floating-point output of the embedding model can differ between platforms. The numbers above are those of the named platform.

## Considered options

- **Keep equal weights and k = 60** (the provisional settings). Rejected: lowest recall@1 of the hybrids that use the graph lane, and 0.325 below the vector lane alone.
- **The vector lane alone.** Rejected: lower recall@1 and MRR@10 than the defaults, and it loses the keyword lane's matches on identifiers, paths and versions, which ADR 0017 keeps the lane for.
- **Vector 1, keyword 0.5, graph 0.25 or 0.5, k 1.** The same recall@1, with lower recall@5. A graph weight above 0 is not justified by this set.
- **A reranking model.** Not needed: the defaults meet the bar.
