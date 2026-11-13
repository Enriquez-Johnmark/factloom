# Embeddings: options for Factloom

Accessed: 2026-11-13.

## Question

Does the Anthropic API provide embeddings? If not, which embedding model should Factloom use first
(local on an Apple Silicon Mac from Node, or hosted), what does each option cost, and what must the
embeddings interface record so the choice can change later?

This document presents options for the owner's decision. Nothing here is decided.

Labels: **confirmed** (primary source or run here), **likely** (indirect evidence), **unverified**
(listed under Open questions only). All sources accessed 2026-11-13.

## Findings

### 1. Anthropic does not offer an embedding model

Source: https://platform.claude.com/docs/en/build-with-claude/embeddings. **Confirmed.**

> "Anthropic does not offer its own embedding model. One embeddings provider with a wide variety of
> models and capabilities is Voyage AI by MongoDB."

> "The rest of this guide is for Voyage AI, but you should assess a variety of embeddings vendors to
> find the best fit for your specific use case."

- Voyage AI is a separate company product ("Voyage AI by MongoDB"), not part of the Anthropic API.
  It needs its own key: "create a model API key in MongoDB Atlas", used as `VOYAGE_API_KEY` against
  `ai.mongodb.com`. An Anthropic API key does not work for it. (same page)
- The same page lists the current Voyage text models: `voyage-4-large`, `voyage-4`, `voyage-4-lite`,
  `voyage-code-4` (all 32,000-token context; 1024 dimensions by default, 256 / 512 / 2048
  selectable), and `voyage-4-nano`, an "Open-weight model (Apache 2.0 license) that you download
  from Hugging Face and run yourself". `voyage-3.5`, `voyage-3.5-lite`, `voyage-code-3` and
  `voyage-3-large` are listed as "Previous generation".
- Voyage vectors "are normalized to length 1", and retrieval calls should set
  `input_type` to `"query"` or `"document"`, which prepends a fixed prompt. (same page)

So embeddings are a separate provider choice whatever LLM Factloom uses.

### 2. Comparison

Quality numbers come from each vendor's own page and use different benchmark versions (MTEB v1 with
56 English datasets, MTEB v2, BEIR, CoIR). **They are not comparable across rows unless the
benchmark name matches.** "Speed" for hosted models is not stated by vendors and is left blank;
for local models it is the measurement from section 3 where one exists.

#### Local, free to run

| Model | Provider | Runs where | Dimensions (shortenable?) | Max input tokens | Quality (vendor-published) | Cost | Speed (this VM, section 3) | License | From Node |
|---|---|---|---|---|---|---|---|---|---|
| all-MiniLM-L6-v2 | sentence-transformers | Local CPU | 384 (no) | 256 word pieces (longer input truncated) | No MTEB figure on the model card | Free | 4 ms/text | Apache-2.0 | Transformers.js `Xenova/all-MiniLM-L6-v2`; Ollama `all-minilm` |
| bge-small-en-v1.5 | BAAI | Local CPU | 384 (no) | 512 | MTEB v1 avg 62.17, retrieval 51.68 | Free | 30 ms/text | MIT | Transformers.js `Xenova/bge-small-en-v1.5`; GGUF via node-llama-cpp (its docs use `bge-small-en-v1.5-q8_0.gguf`) |
| bge-base-en-v1.5 | BAAI | Local CPU | 768 (no) | 512 | MTEB v1 avg 63.55, retrieval 53.25 | Free | not measured | MIT | Transformers.js `Xenova/bge-base-en-v1.5` |
| nomic-embed-text-v1.5 | Nomic | Local CPU | 768 (Matryoshka: 512, 256, 128, 64) | 8192 | MTEB v1 avg 62.28 at 768, 61.04 at 256 | Free | 19 ms/text (q8) | Apache-2.0 | Transformers.js `nomic-ai/nomic-embed-text-v1.5`; Ollama `nomic-embed-text` |
| embeddinggemma-300m | Google | Local CPU | 768 (Matryoshka: 512, 256, 128) | 2048 | MTEB English v2 mean 69.67; MTEB Multilingual v2 61.15; **MTEB Code v1 68.76** | Free | 252 ms/text (q8) | Gemma terms (not an OSI licence; original repo is gated) | Transformers.js `onnx-community/embeddinggemma-300m-ONNX`; Ollama `embeddinggemma` |
| snowflake-arctic-embed-s | Snowflake | Local CPU | 384 | 512 | MTEB v1 retrieval 51.98 | Free | not measured | Apache-2.0 | ONNX files in the model repo; Ollama `snowflake-arctic-embed` |
| snowflake-arctic-embed-m-v2.0 | Snowflake | Local CPU | 768 (Matryoshka: 256) | 8192 | BEIR 55.4 at 768, 54.4 at 256; multilingual | Free | not measured | Apache-2.0 | ONNX files in the model repo; Ollama `snowflake-arctic-embed2` is the larger v2 model |
| mxbai-embed-large-v1 | Mixedbread | Local CPU | 1024 (Matryoshka supported) | not found on the model card | MTEB v1 avg 64.68, retrieval 54.39 | Free | not measured | Apache-2.0 | ONNX and GGUF files in the model repo; Ollama `mxbai-embed-large` |
| jina-embeddings-v2-base-code | Jina | Local CPU | 768 | 8192 | English plus 30 programming languages; no single score on the card | Free | not measured | Apache-2.0 | ONNX files in the repo; card documents Transformers.js use |
| jina-code-embeddings-0.5b | Jina | Local (no ONNX in repo) | 896 (Matryoshka: 512, 256, 128, 64) | 32,768 | Code-specific, task prefixes | Free for non-commercial use only | not measured | **CC-BY-NC-4.0** | No ONNX build in the repo |
| CodeRankEmbed | Nomic | Local (no ONNX in repo) | 768 | 8192 | **CoIR NDCG@10 60.1; CodeSearchNet MRR 77.9** | Free | not measured | MIT | No ONNX build in the repo |
| Qodo-Embed-1-1.5B | Qodo | Local (1.5B parameters) | 1536 | 32k | Card claims top open-model results on CoIR | Free | not measured | QodoAI-Open-RAIL-M (custom) | No ONNX build in the repo |
| voyage-4-nano | Voyage / MongoDB | Local | 2048 default (1024, 512, 256) | 32,000 | Not on the Anthropic page | Free | not measured | Apache-2.0 | safetensors only in the repo (`MongoDB/voyage-4-nano`); no ONNX build found |

Sources (model cards and file listings fetched from `https://huggingface.co/<id>` and
`https://huggingface.co/api/models/<id>`): `sentence-transformers/all-MiniLM-L6-v2`,
`BAAI/bge-small-en-v1.5` (table "Average (56) / Retrieval (15)"), `nomic-ai/nomic-embed-text-v1.5`,
`google/embeddinggemma-300m`, `onnx-community/embeddinggemma-300m-ONNX`,
`Snowflake/snowflake-arctic-embed-s`, `Snowflake/snowflake-arctic-embed-m-v2.0`,
`mixedbread-ai/mxbai-embed-large-v1`, `jinaai/jina-embeddings-v2-base-code`,
`jinaai/jina-code-embeddings-0.5b`, `nomic-ai/CodeRankEmbed`, `Qodo/Qodo-Embed-1-1.5B`,
`MongoDB/voyage-4-nano`. Ollama model names: https://ollama.com/search?c=embedding. All
**confirmed** as "what the vendor page states"; the benchmark numbers themselves are vendor-reported
and were not reproduced.

#### Hosted

| Model | Provider | Dimensions (shortenable?) | Max input tokens | Quality (vendor-published) | Price per 1M tokens | Free allowance | Licence / terms | From Node |
|---|---|---|---|---|---|---|---|---|
| voyage-4-lite | Voyage AI by MongoDB | 1024 (256, 512, 2048) | 32,000 | "Optimized for latency and cost" | $0.02 | 200M tokens | Commercial API; separate MongoDB Atlas key | HTTPS, or `voyageai` npm 0.6.0 with `environment: https://ai.mongodb.com/v1` |
| voyage-4 | Voyage AI by MongoDB | 1024 (256, 512, 2048) | 32,000 | General-purpose | $0.06 | 200M tokens | as above | as above |
| voyage-4-large | Voyage AI by MongoDB | 1024 (256, 512, 2048) | 32,000 | "best general-purpose and multilingual retrieval quality" | $0.12 | 200M tokens | as above | as above |
| voyage-code-4 | Voyage AI by MongoDB | 1024 (256, 512, 2048) | 32,000 | Vendor blog: on 28 code-search datasets, +13.98% over voyage-code-3, +19.21% over Cohere Embed v4, +16.01% over Gemini Embedding 2, +40.06% over "OpenAI v3 large" (relative NDCG@10; no absolute scores given) | $0.12 | 200M tokens | as above | as above |
| voyage-code-3 (previous generation) | Voyage AI by MongoDB | 1024 (256, 512, 2048) | 32,000 | Superseded by voyage-code-4 | $0.18 | none | as above | as above |
| voyage-3.5 / voyage-3.5-lite (previous generation) | Voyage AI by MongoDB | 1024 (256, 512, 2048) | 32,000 | Superseded by voyage-4 / voyage-4-lite | $0.06 / $0.02 | none | as above | as above |
| text-embedding-3-small | OpenAI | 1536 (`dimensions` parameter shortens) | 8192 | MTEB 62.3% | $0.02 | none listed | Commercial API | HTTPS or `openai` npm |
| text-embedding-3-large | OpenAI | 3072 (`dimensions` parameter shortens) | 8192 | MTEB 64.6% | $0.13 | none listed | Commercial API | HTTPS or `openai` npm |
| gemini-embedding-001 | Google | 3072 (128 to 3072; 768, 1536, 3072 recommended) | 8192 | MTEB 68.17 at 1536, 67.99 at 768 (which MTEB version is not stated on the page) | $0.15 (batch $0.075) | Free tier "Free of charge" | Commercial API | HTTPS or Google GenAI SDK |
| gemini-embedding-2 | Google | 3072 (shortenable, auto-normalised) | 8192 | Multimodal | $0.20 text (batch $0.10) | Free tier "Free of charge" | Commercial API | as above |
| embed-v4.0 | Cohere | 1536 default (256, 512, 1024) | 128k | Multimodal (text, images, PDFs) | not found on vendor pages (see Open questions) | "API calls made from a Trial API key are free", rate limited, not for production or commercial use | Commercial API | HTTPS or Cohere SDK |
| jina-embeddings-v5-text-small / -nano, jina-code-embeddings | Jina AI | Matryoshka | 32,768 / 8,192 | Vendor page | not found on vendor pages (see Open questions) | "free tokens" for new keys, amount not stated | API is commercial; open weights of v5-text-nano are CC-BY-NC-4.0 | HTTPS |

Sources, all **confirmed** as stated on the page:
Voyage models: https://platform.claude.com/docs/en/build-with-claude/embeddings; Voyage prices and
free tokens: https://www.mongodb.com/docs/voyageai/management/billing/; voyage-code-4 benchmark
claims: https://blog.voyageai.com/2026/08/13/voyage-code-4/; OpenAI prices:
https://developers.openai.com/api/docs/pricing; OpenAI dimensions, limits, MTEB:
https://developers.openai.com/api/docs/guides/embeddings; Gemini prices:
https://ai.google.dev/gemini-api/docs/pricing; Gemini dimensions and limits:
https://ai.google.dev/gemini-api/docs/embeddings; Cohere: https://docs.cohere.com/docs/cohere-embed
and https://cohere.com/pricing; Jina: https://jina.ai/embeddings/.

Cost scale: a memory statement of about 30 tokens costs $0.0000006 to embed at $0.02 per 1M tokens.
One million memories cost about $0.60. At Factloom's early volumes, hosted embedding price is not a
deciding factor; privacy, offline use and an extra key are.

A note on "code retrieval" benchmarks: they measure finding code snippets from a natural-language
query. Factloom's first memories are natural-language statements about a codebase ("We switched
from Jest to Vitest in March"), not code blocks, so general retrieval quality is at least as
relevant as code-retrieval scores. Which matters more for real coding-agent memories is untested.

### 3. Local runtimes from Node

#### Transformers.js (`@huggingface/transformers`)

| Item | Finding | Source | Label |
|---|---|---|---|
| Version | 4.3.2 (2026-10-30), Apache-2.0 | `npm view @huggingface/transformers` | confirmed |
| Native runtime | Depends on `onnxruntime-node` 1.30.0 (and `onnxruntime-web`, `sharp`) | `npm view … dependencies` | confirmed |
| Platform binaries | The installed `onnxruntime-node` package contains `bin/napi-v6/darwin/arm64`, `linux/x64`, `linux/arm64`, `win32/x64`, `win32/arm64`. There is no `darwin/x64` directory | Listing of `node_modules/onnxruntime-node/bin/napi-v6/` after install | confirmed |
| Works on plain Node, linux-x64 | Yes: ran on Node v22.23.4 in this session | section 3 test | confirmed |
| Works on darwin-arm64 | The binary is shipped; not run, because this session is Linux | file listing | likely |
| Install size | `node_modules` was 745 MB on linux-x64: `onnxruntime-node` 548 MB (it includes CUDA and TensorRT provider libraries on Linux), `onnxruntime-web` 141 MB | `du -sh` | confirmed (Linux); macOS size not measured |
| Download host | `env.remoteHost` defaults to `https://huggingface.co/`, path `{model}/resolve/{revision}/`. Model files redirect to a CDN host (`us.aws.cdn.hf.co` observed) | `node_modules/@huggingface/transformers/src/env.js` lines 256-257; `curl -L` | confirmed |
| First-run behaviour | Files are downloaded on first `pipeline()` call and cached on disk. Default cache directory is `.cache` "relative to the library's installed location", i.e. inside `node_modules`; `env.cacheDir` changes it | https://huggingface.co/docs/transformers.js/api/env; observed | confirmed |
| Offline | `env.allowRemoteModels = false` with `env.localModelPath` loads only local files | same page | confirmed (documented; not exercised) |
| Quantised variants | Repos carry several ONNX files; `dtype: "fp32" \| "q8" \| …` selects one | model file listings; test | confirmed |

Model download sizes (ONNX file only, from the Hugging Face file listings; **confirmed**):

| Model repo | fp32 | q8 / quantized |
|---|---|---|
| `Xenova/all-MiniLM-L6-v2` | 90 MB | 23 MB |
| `Xenova/bge-small-en-v1.5` | 133 MB | 34 MB |
| `Xenova/bge-base-en-v1.5` | 436 MB | 110 MB |
| `nomic-ai/nomic-embed-text-v1.5` | 547 MB | 137 MB |
| `onnx-community/embeddinggemma-300m-ONNX` | 1,235 MB | 309 MB (q4: 197 MB) |
| `Snowflake/snowflake-arctic-embed-m-v2.0` | 1,226 MB | 311 MB |
| `mixedbread-ai/mxbai-embed-large-v1` | 1,337 MB | 337 MB |

#### Ollama

- A separate local server (not an npm dependency). Endpoint: `POST http://localhost:11434/api/embed`
  with `{ "model": …, "input": string | string[] }`; the response has `embeddings`, one vector per
  input. "The `/api/embed` endpoint returns L2-normalized (unit-length) vectors." JS client:
  `ollama.embed({ model, input })` from the `ollama` npm package (0.6.4).
  Source: https://docs.ollama.com/capabilities/embeddings; `npm view ollama version`. **Confirmed**
  from documentation; Ollama was not installed or run in this session.
- Embedding models in its library on 2026-11-13: `nomic-embed-text`, `nomic-embed-text-v2-moe`,
  `mxbai-embed-large`, `bge-m3`, `bge-large`, `embeddinggemma`, `embeddinggemma-2`, `all-minilm`,
  `snowflake-arctic-embed`, `snowflake-arctic-embed2`, `qwen3-embedding`, `paraphrase-multilingual`,
  `granite-embedding`, `laya`. Source: https://ollama.com/search?c=embedding. **Confirmed.**
- Trade-off: the user must install and run Ollama, and Factloom would depend on a process it does
  not control.

#### node-llama-cpp (GGUF)

- Version 3.22.3, MIT, `engines: node >= 20`. Prebuilt binaries are optional dependencies, including
  `@node-llama-cpp/mac-arm64-metal`, `mac-x64`, `linux-x64`, `linux-arm64`, `win-x64`.
  Source: `npm view node-llama-cpp`, registry metadata. **Confirmed.**
- "Metal support is enabled by default on macOS on Apple Silicon Macs."
  Source: https://node-llama-cpp.withcat.ai/guide/Metal. **Confirmed** (documentation).
- Embedding API: `getLlama()`, `llama.loadModel({ modelPath })`, `model.createEmbeddingContext()`,
  `context.getEmbeddingFor(text)`; the guide's example model is `bge-small-en-v1.5-q8_0.gguf`.
  Source: https://node-llama-cpp.withcat.ai/guide/embedding. **Confirmed** (documentation; not run).
- Trade-off: Factloom would have to obtain and manage GGUF files itself.

### 4. Local test in this session

Scripts (throwaway, not in the repository):
`/tmp/claude-0/-home-user-factloom/00a9e33c-b521-5829-9c94-4c686af925cc/scratchpad/c2/emb/embed.mjs`
and
`/tmp/claude-0/-home-user-factloom/00a9e33c-b521-5829-9c94-4c686af925cc/scratchpad/c2/emb/gemma.mjs`.

Environment: Linux x64 VM, 4 vCPUs, "Intel(R) Xeon(R) Processor @ 2.10GHz" (AVX2 and AVX-512
available), 15 GB RAM, Node v22.23.4, `@huggingface/transformers` 4.3.2, CPU execution only.
**All results confirmed by running; they do not predict Apple Silicon performance.**

Reachability: `huggingface.co` and its CDN host `us.aws.cdn.hf.co` were reachable through the
session proxy. No host was blocked.

Method: 20 short sentences (16 code-memory style such as "The auth module uses JWT with refresh
tokens" and "We switched from Jest to Vitest in March", 4 unrelated such as "Sourdough bread needs
a long, slow fermentation"). Each model embedded them one at a time (after one warm-up call) and
once as a batch of 20, with the prefixes its card requires. Vectors were normalised; scores are dot
products (equal to cosine similarity for unit vectors).

| Model (ONNX variant) | Dims | Load, first run incl. download | Load, cached | Per text, one at a time | Per text, batch of 20 | Cache on disk |
|---|---|---|---|---|---|---|
| `Xenova/all-MiniLM-L6-v2` (fp32) | 384 | 1.3 s | 0.27 s | 4 ms | 2 ms | 91 MB |
| `Xenova/bge-small-en-v1.5` (fp32, CLS pooling) | 384 | 2.1 s | 0.53 s | 30 to 32 ms | 11 to 15 ms | 134 MB |
| `nomic-ai/nomic-embed-text-v1.5` (q8) | 768 | 2.0 s | 0.42 s | 19 ms | 10 to 17 ms | 138 MB |
| `onnx-community/embeddinggemma-300m-ONNX` (q8) | 768 | 4.1 s | 1.6 s | 252 ms | 60 to 64 ms | 331 MB |

First-run load times reflect a fast datacentre connection; on a home connection the download
dominates.

Sanity check, related versus unrelated pairs (cosine similarity):

| Model | JWT sentence vs its paraphrase | Vitest sentence vs its paraphrase | JWT vs sourdough | Vitest vs Danube |
|---|---|---|---|---|
| all-MiniLM-L6-v2 | 0.700 | 0.569 | 0.025 | -0.002 |
| bge-small-en-v1.5 | 0.883 | 0.817 | 0.426 | 0.445 |
| nomic-embed-text-v1.5 | 0.804 | 0.786 | 0.531 | 0.498 |
| embeddinggemma-300m | 0.781 | 0.677 | 0.267 | 0.162 |

Every model scored related pairs above unrelated ones. Absolute values differ a lot between models
(bge and nomic keep unrelated pairs near 0.45 to 0.5), so a fixed similarity threshold does not
transfer between models.

Query check, top 3 of 20 for three questions (expected sentence numbers in brackets):

| Query | all-MiniLM-L6-v2 | bge-small-en-v1.5 | nomic-embed-text-v1.5 |
|---|---|---|---|
| "How does login / authentication work?" [0, 1, 13] | 1, 0, 13 | 1, 0, 13 | 1, 13, 0 |
| "Which test framework does the project use?" [2, 3] | 3, 15, 2 | 3, 2, 15 | 2, 3, 15 |
| "Where are vectors stored?" [6, 7] | 7, 6, 15 | 7, 6, 9 | 7, 6, 10 |

All three put the expected sentences in the top 3; MiniLM ranked an unrelated-but-technical sentence
(the React/Vite one) second for the test-framework question. For EmbeddingGemma the same
test-framework query scored the two Vitest sentences 0.457 and 0.437 against 0.05 to 0.28 for the
others. Twenty sentences and three queries show that the pipeline works; they do not rank the
models.

Implementation detail found while testing: EmbeddingGemma's ONNX export returns a ready
`sentence_embedding` output and its card uses `AutoModel` + `AutoTokenizer`, not the
`feature-extraction` pipeline with mean pooling. The generic pipeline call also ran and gave
plausible numbers, but it skips the model's final projection layers, so it is not the documented
path. Pooling is model-specific (mean for MiniLM and nomic, CLS for bge and arctic), which belongs
inside the embedding adapter.

### 5. Practical constraints

| Constraint | Finding | Source | Label |
|---|---|---|---|
| Dimension is fixed per vector table | The sqlite-vec table definition carries the vector dimension, so a model with a different dimension needs a new table and a full re-embed | Stated in the task brief; to be verified in the storage research, not checked here | likely |
| Different models are not comparable | Vectors from two models (or two dimensions of one model) cannot be mixed in one search; the similarity distributions in section 4 differ per model | section 4 | confirmed |
| Query / document prefixes | nomic v1.5: `search_document: ` and `search_query: `. bge v1.5: `Represent this sentence for searching relevant passages: ` on queries only, nothing on passages. arctic-embed v2: `query: ` on queries only. EmbeddingGemma: `task: search result \| query: ` and `title: none \| text: `. CodeRankEmbed: `Represent this query for searching relevant code: ` on queries. Voyage: `input_type` `query` / `document`. Gemini 001: `task_type` such as `RETRIEVAL_QUERY`, `RETRIEVAL_DOCUMENT`, `CODE_RETRIEVAL_QUERY`. all-MiniLM: none | each model card; Anthropic embeddings guide; Gemini embeddings page | confirmed |
| Matryoshka truncation | Truncate, then re-normalise. nomic v1.5 additionally applies `layer_norm` before truncating (its card's Transformers.js example does this) | nomic and EmbeddingGemma cards | confirmed |
| Normalisation and metric | Voyage, OpenAI and Ollama return unit vectors. Transformers.js normalises when called with `normalize: true`. With unit vectors, cosine, dot product and Euclidean distance give the same ranking | Anthropic embeddings guide; OpenAI guide; Ollama docs; section 4 (`norm = 1`) | confirmed |
| Max input | 256 word pieces (MiniLM) and 512 tokens (bge, arctic-s) truncate. Short fact statements fit; source passages may not | model cards | confirmed |
| Batch size | Batching 20 short texts cut per-text time by roughly 2x to 4x on CPU. Hosted APIs accept arrays | section 4 | confirmed |
| Offline use | A local model works with no network after the first download; the first download needs `huggingface.co`. A coding agent's memory then works offline and adds no second API key | sections 3 and 4 | confirmed |
| Privacy | With a hosted model, every stored memory and every query text is sent to a third party. A local model keeps text on the machine. For regulated adapters later this may be a requirement rather than a preference | follows from how the APIs work | confirmed |
| Licences | Apache-2.0 / MIT: MiniLM, bge, nomic v1.5, arctic, mxbai, jina v2 code, CodeRankEmbed, voyage-4-nano. Custom terms: EmbeddingGemma (Gemma terms), Qodo (Open-RAIL-M). Non-commercial: jina-code-embeddings, jina-embeddings-v5-text-nano (CC-BY-NC-4.0) | Hugging Face licence tags | confirmed |
| Package weight | Transformers.js pulls in about 745 MB of `node_modules` on linux-x64; the MCP server's install size is affected | section 3 | confirmed |

## What it means for Factloom

### Options for the owner's decision

Leading candidate (local): **`nomic-embed-text-v1.5` through Transformers.js, q8 ONNX, 768
dimensions.**

- Apache-2.0, no key, works offline after a 137 MB download, about 19 ms per short text on this
  4-vCPU Linux VM.
- 8192-token input, so it also covers longer source passages in the document-management phase.
- Matryoshka: can be stored at 256 dimensions later if index size matters (vendor MTEB v1: 62.28 at
  768, 61.04 at 256), though that still means a new table and a re-embed.
- The same model is in Ollama as `nomic-embed-text`, so a second runtime is available without
  changing the stored vectors' model family (identical output across runtimes was not verified).
- Cost of the choice: it requires the two prefixes, and its vendor-reported quality is mid-table.

Other local options:

| Option | Why choose it | Why not |
|---|---|---|
| `bge-small-en-v1.5` (384) | Smallest sensible index, MIT, similar vendor-reported quality (MTEB v1 62.17), 34 MB quantised | 512-token limit; English only |
| `all-MiniLM-L6-v2` (384) | Fastest by far (4 ms), 23 MB quantised, no prefixes | 256-word-piece limit; oldest model; weakest result in the small query check |
| `embeddinggemma-300m` (768) | Highest vendor-reported scores among the small local models, and the only one here with a published code-retrieval score (MTEB Code v1 68.76) | Gemma terms rather than a standard open-source licence; about 13x slower than nomic on this CPU; 309 MB |

Hosted alternative: **Voyage `voyage-4-lite` or `voyage-4`** ($0.02 / $0.06 per 1M tokens, 200M
free tokens, 1024 dimensions, selectable down to 256), with `voyage-code-4` ($0.12) if code
retrieval proves to matter. It is the provider Anthropic's documentation points to, but it needs a
separate MongoDB Atlas key and sends memory text to a third party. OpenAI `text-embedding-3-small`
($0.02) is the equivalent choice for users who already have an OpenAI key.

The evidence supports starting local: cost is negligible either way, and local removes a key, a
network dependency and a privacy question for the first use case. No evidence found here says a
local model is inadequate for short code-memory statements, but no retrieval-quality evaluation on
real memories was done either.

### What the embeddings interface must carry

Observations for the architecture stage:

- Store with every vector (or per vector table): model identifier, dimensions, and enough to
  reproduce it (quantisation variant, whether it was Matryoshka-truncated). A model change is then a
  detectable mismatch instead of silent bad search results.
- The interface needs two entry points or a role argument: embed-for-storage and embed-for-query.
  Most candidates treat the two differently (prefix or `input_type`). Prefixes, pooling and
  normalisation are model-specific and belong inside the adapter.
- The adapter should report `modelId` and `dimensions` so storage can create or check the vector
  table before inserting.
- Return unit-length vectors from every adapter so one distance metric works for all.
- Accept arrays (batching is 2x to 4x faster locally and is how hosted APIs are priced and
  rate-limited).
- Changing the model means re-embedding everything. Because facts keep their text and source, this
  is a batch job rather than data loss; the design only has to make it possible (for example a new
  vector table per model, filled in the background).
- For a local model: decide where the model cache lives (the Transformers.js default is inside
  `node_modules`), and whether first-run download is acceptable or the model should be fetched in an
  explicit setup step. Offline mode exists (`env.allowRemoteModels = false`).
- Similarity thresholds must be per model; section 4 shows unrelated pairs scoring near 0.0 on one
  model and near 0.5 on another.

## Conflicts with settled decisions

None found. One point to be aware of: "SQLite with a vector extension" combined with a local model
means the vector dimension chosen now (768 or 384) is baked into the first table. That is a
reversible choice, at the cost of a re-embed.

## Open questions

- Retrieval quality on real coding-agent memories has not been measured for any candidate. The test
  here was a 20-sentence sanity check. A small evaluation set (queries with known relevant memories)
  would settle nomic vs bge-small vs EmbeddingGemma. **Unverified.**
- Performance on Apple Silicon: not measurable in this Linux session. `onnxruntime-node` ships a
  `darwin/arm64` binary, but load time, latency and install size on the Mac are **unverified**.
- Whether `onnxruntime-node` on macOS uses CoreML or only CPU by default was not checked.
- Whether Ollama's `nomic-embed-text` produces vectors interchangeable with the Transformers.js
  ONNX build of nomic-embed-text-v1.5 (same weights version, same pooling) is **unverified**.
- sqlite-vec's handling of dimensions and distance metrics was taken from the task brief and not
  verified here; the storage research should confirm it.
- Cohere `embed-v4.0` per-token price: not found on `cohere.com/pricing` or the Cohere docs pages
  fetched. **Unverified.**
- Jina API per-token price and the size of the free-token grant: not stated on
  `jina.ai/embeddings/`. **Unverified.**
- The MTEB score for all-MiniLM-L6-v2 is not on its model card and was not found on the
  sentence-transformers page as fetched. **Unverified.**
- The voyage-code-4 comparison figures are relative improvements reported by the vendor, without
  absolute scores, and were not independently checked.
- Voyage batch pricing and rate limits for a new account were not found on the billing page.
- `gemini-embedding-001` free-tier rate limits and data-use terms were not checked.
- Whether EmbeddingGemma's Gemma terms are acceptable for Factloom's distribution model needs a
  reading of the licence by the owner; this document only records that it is not Apache/MIT.
