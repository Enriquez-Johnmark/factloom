# Open questions

Accessed: 2026-11-13.

This file is the single list of things the research under `docs/research/` could not verify, plus
the design decisions that the research leaves to the architecture stage. It was built from the
"Open questions" section of every research document and from the items an independent review of
those documents could not check. Nothing listed here may be written as fact in any other document,
ticket or code comment until the row's "how to verify" step has been done and the source document
updated. Section B records disagreements between documents without resolving them; section C
records items a review considered deferrable. Both are open, not decided.

Short names used in the "Source" columns: `technical/`, `evaluations/` and `industries/` are the
folders next to this file; "spike" is `spikes/sqlite-vec-fts5/` at the repository root.

## A. Unverified claims

Ordered by how much each matters to phases 0 and 1. "The Mac" is the developer machine (Apple
Silicon); all research ran on Linux x64 with Node.js v22.23.4.

| ID | Question | Why it matters | How to verify | Source |
|---|---|---|---|---|
| Q-01 | Do better-sqlite3 13.1.1 and sqlite-vec 0.1.9 install and load on macOS arm64 from their prebuilt binaries, each with its own SQLite? | Phase 1 storage depends on two native binaries; only their file contents were inspected. | On the Mac run `cd spikes/sqlite-vec-fts5 && npm ci && node spike.mjs`; expect `platform: 'darwin-arm64'` and a last line `SPIKE OK`. | [sqlite.md](technical/sqlite.md), [spike README](../../spikes/sqlite-vec-fts5/README.md) |
| Q-02 | Can macOS refuse to load an npm-installed `.node` or `.dylib` file (unverified developer, quarantine)? | Would block every user on a Mac at first start. | Same run as Q-01; if `dlopen` fails, record the exact message and the output of `xattr` on the file. | [spike README](../../spikes/sqlite-vec-fts5/README.md) |
| Q-03 | Does the toolchain (pnpm 12.18.0, TypeScript 7.0.2, Vitest 5.1.0, Biome 2.6.7) behave on macOS arm64 as it did on Linux? | Phase 0 scaffolding is built on it. | On the Mac, in the scaffolded workspace: `pnpm install && pnpm exec tsc -b && pnpm test && pnpm exec biome check .`. | [toolchain.md](technical/toolchain.md) |
| Q-04 | Does everything that was run on Node 22.23.4 also run on Node 24 and Node 26? | The Mac is expected to run Node 24 or 26; Node 22 ends 2027-04-30. | Repeat Q-01 and Q-03 under `node --version` 24.x and 26.x (for example with a version manager); note any warning. | [toolchain.md](technical/toolchain.md), [sqlite.md](technical/sqlite.md) |
| Q-05 | Does the no-build setup (`exports` pointing at `src/*.ts`, plain `node`) work on Node 24 and 26, on macOS, and with pnpm's `nodeLinker: hoisted` or injected workspace dependencies? | Decision D-7 rests on a run on one Node version and one linker mode. | Repeat the commands listed under "What was run for the no-build setup" in toolchain.md in each configuration. | [toolchain.md](technical/toolchain.md) |
| Q-06 | Will Node's type stripping (stability 1.2 on Node 22) change behaviour in a later 22.x or 24.x release? | The no-build option depends on it. | Read the `typescript.html` page and changelog of each Node release before upgrading; rerun Q-05. | [toolchain.md](technical/toolchain.md) |
| Q-07 | Will sqlite-vec keep releasing, and will 0.1.10 change the on-disk format of `vec0` tables? | The project is pre-v1 with a long gap in 2025; a format change means re-indexing. | Read the 0.1.10 release notes when published; in a spike, open a database written by 0.1.9 with the new version. | [sqlite.md](technical/sqlite.md) |
| Q-08 | Are the sqlite-vec issue figures (166 open issues; issues #226 and #221) still as recorded? | They are the evidence for the maintenance risk. | Open https://github.com/asg017/sqlite-vec/issues from a network with GitHub access, or `gh issue view 226 -R asg017/sqlite-vec`. | [sqlite.md](technical/sqlite.md) |
| Q-09 | How fast is brute-force KNN on a file database larger than memory, and on Apple Silicon? | The 130 ms at 100,000 vectors was measured in memory on a server CPU. | Rerun the timing (10,000 / 50,000 / 100,000 vectors, 768 dimensions, `k = 10`, median of 5) against a file database on the Mac. | [sqlite.md](technical/sqlite.md) |
| Q-10 | Do two MCP server processes on one WAL database with sqlite-vec loaded work without lock errors? | Two agents on one repository is a normal case. | Spike: two Node processes, one writing facts in a loop and one searching, `busy_timeout = 5000`; count `SQLITE_BUSY` errors. | [sqlite.md](technical/sqlite.md) |
| Q-11 | Does recording usage on every retrieval cause write contention under WAL? | Decides whether the read path may write at all. | Same spike as Q-10 with a batched usage update after each search; compare latency with and without. | [memory-decay-and-consolidation.md](technical/memory-decay-and-consolidation.md) |
| Q-12 | Is blocking the event loop with a synchronous driver acceptable in a stdio MCP server? | Labelled "likely" from reasoning; not measured. | In the first server build, log the duration of each statement and the time between request and response under a 100,000-fact store. | [sqlite.md](technical/sqlite.md) |
| Q-13 | Does the partial index `(subject, predicate) WHERE invalidated_at IS NULL` stay selective when one subject has thousands of facts? | It serves the most common query. | Spike: insert 100,000 facts with one hub subject; run `EXPLAIN QUERY PLAN` and time the current-belief query. | [bi-temporal-modelling.md](technical/bi-temporal-modelling.md) |
| Q-14 | What does a recursive CTE cost on a hub entity (for example a repository linked to every fact), and what fan-out cap is needed? | Graph expansion could dominate query time. | Spike: one entity with 10,000 edges; time the 1-hop and 2-hop walks with and without a per-seed `LIMIT`. | [hybrid-retrieval.md](technical/hybrid-retrieval.md) |
| Q-15 | Do the documented `claude mcp add` and `codex mcp add` commands and config snippets work as written? | They are the install instructions for phase 1; none was executed. | On the Mac: run each command with a trivial stdio server, then `/mcp` in each agent and call one tool. | [mcp.md](technical/mcp.md), [mcp-reference-memory-server.md](evaluations/mcp-reference-memory-server.md) |
| Q-16 | What is the working directory of a stdio server started from a project `.codex/config.toml`, and from `.mcp.json` with relative `args`? | Decides whether relative paths are safe in project config. | Start a server that writes `process.cwd()` to stderr from each config form; read the agent's server log. | [mcp.md](technical/mcp.md) |
| Q-17 | Which protocol era (2025 `initialize` or 2026-07-28 `server/discover`) do Claude Code and Codex use today? | Affects only test coverage; `serveStdio` answers both. | Log the first request method in the test server from Q-15. | [mcp.md](technical/mcp.md) |
| Q-18 | Does Codex truncate tool descriptions, defer tool loading, or limit the number of tools? | Shapes tool names, descriptions and server instructions. | Search `openai/codex` (`codex-rs`) for the MCP tool-listing code, or observe a long description through `/mcp`. | [mcp.md](technical/mcp.md), [software-development.md](industries/software-development.md) |
| Q-19 | How often do agents call memory tools without being told to? | The main adoption risk for an MCP-only phase 1. | Run 20 comparable sessions with and without a one-line pointer in `CLAUDE.md` / `AGENTS.md`; count tool calls in the server log. | [mcp.md](technical/mcp.md), [software-development.md](industries/software-development.md) |
| Q-20 | Is the editor experience with TypeScript 7 acceptable, and do declaration maps make "go to definition" land in `src`? | Daily developer experience; not testable in a headless session. | Open the scaffolded workspace in the editor on the Mac; follow an import across packages. | [toolchain.md](technical/toolchain.md) |
| Q-21 | Will TypeScript 7.1 ship an API that typescript-eslint adopts, and when? | Decides whether type-aware lint rules are possible (D-8). | `npm view typescript version` and `npm view typescript-eslint peerDependencies` when 7.1 is stable. | [toolchain.md](technical/toolchain.md) |
| Q-22 | Does the Biome import guard work in the no-build workspace? It was run only in the `tsc -b` workspace. | The boundary check must hold under either build option. | Add the `biome.json` from toolchain.md to a no-build workspace, add a forbidden import, run `biome check .`. | [toolchain.md](technical/toolchain.md) |
| Q-23 | How do Transformers.js and `onnxruntime-node` behave on Apple Silicon: load time, latency per text, install size, CoreML or CPU? | The leading local embedding option was measured on Linux only (745 MB install). | On the Mac: install `@huggingface/transformers` 4.3.2, embed the 20 test sentences, record timings and `du -sh node_modules`. | [embeddings.md](technical/embeddings.md) |
| Q-24 | Does the Transformers.js offline mode work as documented? | Needed for use without network after the first download. | Set `env.allowRemoteModels = false` and `env.localModelPath`, disconnect the network, run an embedding. | [embeddings.md](technical/embeddings.md) |
| Q-25 | Which candidate embedding model retrieves best on real coding-agent memories? | Only a 20-sentence sanity check exists; D-6 depends on it. | Build a small set of queries with known relevant memories; compare Recall@k for nomic, bge-small and EmbeddingGemma. | [embeddings.md](technical/embeddings.md) |
| Q-26 | Are Ollama's `nomic-embed-text` vectors interchangeable with the Transformers.js ONNX build? | Would allow a second runtime without re-embedding. | Embed the same sentences with both; compare vectors by cosine similarity. | [embeddings.md](technical/embeddings.md) |
| Q-27 | Is RRF with `k = 60` or `k = 1` better for two or three short lists, and how many candidates per retriever? | Default ranking parameters. | Run the internal evaluation set with each setting; compare Recall@k. | [hybrid-retrieval.md](technical/hybrid-retrieval.md) |
| Q-28 | Does graph expansion improve answers for coding-agent memory at all? | Decides D-11. | Run the evaluation set with the graph retriever on and off. | [hybrid-retrieval.md](technical/hybrid-retrieval.md) |
| Q-29 | How should imprecise dates be stored ("in 2023", "March 2026" returned as `2026-03-01`)? | Fact schema: a precision field is cheap now and awkward later. | Phase 1 test: store period start plus the original phrase; add extraction cases with month-only and year-only dates. | [bi-temporal-modelling.md](technical/bi-temporal-modelling.md), [llm-anthropic.md](technical/llm-anthropic.md) |
| Q-30 | How accurate is Claude's verdict (duplicate, refines, succeeds, contradicts, unrelated) on Factloom's kind of facts, and is Haiku 5.5 enough or is Sonnet 5.5 needed? | A false "contradicts" invalidates a true fact. | Label about 50 fact pairs by hand; run both models; report the false-contradiction rate. | [contradiction-detection.md](technical/contradiction-detection.md), [llm-anthropic.md](technical/llm-anthropic.md) |
| Q-31 | How good is extraction beyond the one two-sentence example? | No accuracy figure exists. | Evaluation layer C: 50 input texts with expected triples; report precision and recall. | [llm-anthropic.md](technical/llm-anthropic.md), [evaluation.md](technical/evaluation.md) |
| Q-32 | How do Haiku 5.5's adaptive thinking and `output_config.effort` affect cost and quality for extraction? | Cost table assumes zero thinking tokens. | Run the layer C set at each effort level; compare `usage` and accuracy. | [llm-anthropic.md](technical/llm-anthropic.md) |
| Q-33 | What are real token sizes per memory, and the cache hit rate under a real write pattern? | The cost table uses assumed sizes and assumes every call is a cache hit. | Log `usage` (input, output, cache read, cache write) for the first 100 real extraction calls. | [llm-anthropic.md](technical/llm-anthropic.md) |
| Q-34 | What are the limits of the Evaluation tier, and which tier is the owner's organization in? | Unpublished limits could throttle a background job. | Read the limits page in the Anthropic Console for the owner's organization. | [llm-anthropic.md](technical/llm-anthropic.md) |
| Q-35 | Is forced `tool_choice` rejected on Opus 5.5 and Sonnet 5.5? | Inferred from an empty table cell; only matters if `output_config.format` is not used. | One API call per model with `tool_choice: { type: "any" }`. | [llm-anthropic.md](technical/llm-anthropic.md) |
| Q-36 | Do the same Zod schemas work with other providers' structured output? | The LLM interface is meant to be provider-neutral. | Run the extraction schema against one other provider's structured-output feature. | [llm-anthropic.md](technical/llm-anthropic.md) |
| Q-37 | Are the GitHub issues cited in the evaluations in the state and with the titles quoted (Graphiti, Mem0, Cognee, Letta Code, MCP servers, Attestor #188)? | They support the "weaknesses" lists; none was reproduced, and GitHub could not be reached to re-check them. | Open each cited issue URL from a network with GitHub access, or `gh issue view <n> -R <owner>/<repo>`. | [graphiti-zep.md](evaluations/graphiti-zep.md), [mem0.md](evaluations/mem0.md), [cognee.md](evaluations/cognee.md), [letta.md](evaluations/letta.md), [mcp-reference-memory-server.md](evaluations/mcp-reference-memory-server.md), [memwright.md](evaluations/memwright.md) |
| Q-38 | Are the star, fork, open-issue and pull-request counts in the evaluations correct? | Used as adoption evidence; not re-checked for the same reason as Q-37. | `gh api repos/<owner>/<repo>` for each repository, or read the repository pages. | all files in [evaluations/](evaluations/) |
| Q-39 | Does the hosted Mem0 Platform behave as its documentation says (supersede and link, `latest_only=true`, decay, temporal reasoning, feedback), and can a past state be queried by date? | Read in documentation only; it bears on what is and is not unique to Factloom. | With a Platform account, add the "Postgres 14" then "migrated to Postgres 16" memories; search with and without `latest_only=true`. | [mem0.md](evaluations/mem0.md) |
| Q-40 | How does the hosted Zep service expose point-in-time search, fact ratings and change history; what are its pricing and limits; is a self-hosted edition still offered? | Only one Zep documentation page was read; the service was not used. | Read the Zep documentation beyond `/facts`; run the same two-episode scenario on a trial account. | [graphiti-zep.md](evaluations/graphiti-zep.md) |
| Q-41 | Why did Graphiti's `valid_at <= date` filter return later facts on FalkorDB Lite, and does the Kuzu failure also occur without a `group_id`? | The point-in-time behaviour of the closest comparable system is not established. | Rerun the filter on Neo4j 5.26 with the same two episodes; rerun step 4 without `group_id`. | [graphiti-zep.md](evaluations/graphiti-zep.md) |
| Q-42 | Does Graphiti persist `IS_DUPLICATE_OF` edges in normal ingestion? | Would be a reversible-link precedent for entity merges. | Trace the callers of `filter_existing_duplicate_of_edges` in `graphiti_core`. | [entity-resolution.md](technical/entity-resolution.md) |
| Q-43 | Does Cognee's conflict review fail generally on short inputs, and was a `FactConflict` node written in the failing run? | One observation only. | Rerun step 7 with three other input pairs and another model; query the graph for `FactConflict` nodes. | [cognee.md](evaluations/cognee.md) |
| Q-44 | How well does Cognee's `TEMPORAL` search answer "value of X on date D", what do its coding-agent plugins capture, how good is GLiNER extraction, and what does Cognee Cloud offer? | Not tested or not read. | Run a 20-document dated corpus through `TEMPORAL`; read `topoteretes/cognee-integrations`. | [cognee.md](evaluations/cognee.md) |
| Q-45 | Does Letta offer an MCP server that exposes its memory to other agents; how well does reflection resolve contradictions; what does the Cloud backend store? | Decides whether Letta is a competitor for the MCP use case. | Search the other `letta-ai` repositories and docs.letta.com; run reflection over a scripted contradiction. | [letta.md](evaluations/letta.md) |
| Q-46 | Mem0: current status of OpenMemory; which Python release first shipped the add-only algorithm; what the Platform feedback call changes; are the benchmark figures reproducible? | Background for the comparison; none affects phase 1 design directly. | Read the Mem0 changelog and release tags; run the published benchmark scripts if needed. | [mem0.md](evaluations/mem0.md) |
| Q-47 | Did Mem0 remove UPDATE and DELETE from the write path because the step was unreliable? | The migration guide states only benchmark and latency gains; "unreliable" is an inference. | Read the pull request and changelog that introduced the additive algorithm. | [contradiction-detection.md](technical/contradiction-detection.md), [mem0.md](evaluations/mem0.md) |
| Q-48 | Mnemograph: does `uvx mnemograph` start the CLI rather than the server; how do recall, `merge_entities` and branches behave; what does qinjianxyz/mnemograph do? | Not run or not examined. | Run `uvx mnemograph` where `uv` is installed; read the second repository. | [mnemograph.md](evaluations/mnemograph.md) |
| Q-49 | Attestor: do the LLM conflict resolver, consolidation and `as_of` recall work as read in source; does its MCP server start with `mcp` 2.x; what do its benchmarks show? | Read, not run. | `attestor quickstart` with Docker, then the three-write scenario through `ingest_round` and `recall(as_of=...)`. | [memwright.md](evaluations/memwright.md) |
| Q-50 | MCP reference memory server: how widely is it used, and is an HTTP transport planned? | Sizing of the baseline a user already has. | Read the download figure on the package's npmjs.com page; read issue #5538 from a network with GitHub access. | [mcp-reference-memory-server.md](evaluations/mcp-reference-memory-server.md) |
| Q-51 | How well do Claude Code auto memory and Codex memories work in daily use; are Codex memories scoped per project; what do `memories.version` and `memories.dual_write` mean; what do the vendors plan? | Defines the free baseline Factloom is compared with. | Use both for two weeks on one repository and review the memory files; read `codex-rs/config/src/types.rs`. | [coding-agent-built-in-memory.md](evaluations/coding-agent-built-in-memory.md), [software-development.md](industries/software-development.md) |
| Q-52 | What is the current state of Cursor's Memories feature? | No official page was found; not used as evidence. | Read the current Cursor documentation and changelog. | [software-development.md](industries/software-development.md) |
| Q-53 | Do git worktrees share one repository identity as assumed (root commit, `--git-common-dir`)? | Scoping rule for phase 1. | `git worktree add ../wt` then compare `git rev-parse --git-common-dir` and `git rev-list --max-parents=0 HEAD` in both. | [software-development.md](industries/software-development.md) |
| Q-54 | Are `ts-morph` 28 and tree-sitter (`web-tree-sitter` 0.27.2 with `tree-sitter-typescript` 0.23.2) usable with TypeScript 7, and is an LSP-based check too heavy? | Only if a syntax-aware symbol check (rung 6) is built. | Install each and parse one file; skip until rung 6 is planned. | [software-development.md](industries/software-development.md) |
| Q-55 | How large are the gains in the repository-memory papers (arXiv 2510.01003, 2601.06789), and against which baselines? | Supports ordering of memory sources; taken from abstracts. | Read the papers' method and results sections. | [software-development.md](industries/software-development.md) |
| Q-56 | How well does Claude adjudicate entity pairs from code-related text, and what loose candidate threshold suits the chosen embedding model? | Phase 3 merging; thresholds do not transfer between models. | Label about 50 entity pairs; run the adjudication prompt; plot similarity of true and false pairs for the chosen model. | [entity-resolution.md](technical/entity-resolution.md) |
| Q-57 | Does any recency term improve answer accuracy, and what archiving period suits code memory (180 days is a placeholder)? | Phase 3 policy. | Replay logged queries with and without a recency term once an evaluation set exists. | [memory-decay-and-consolidation.md](technical/memory-decay-and-consolidation.md) |
| Q-58 | How should a late-arriving older fact be stored (inserted already closed at the newer fact's start)? | Write-path rule in phase 2. | Add the case to evaluation layer A and B. | [contradiction-detection.md](technical/contradiction-detection.md) |
| Q-59 | Do the regulation texts read on mirrors match the official texts (eCFR and US Code on law.cornell.edu; GDPR on gdpr-info.eu; AI Act on artificialintelligenceact.eu)? | Every regulatory statement in the industry research rests on them. | Read the cited sections on the official eCFR, US Code and EUR-Lex sites from a network that can reach them. | [other-industries.md](industries/other-industries.md) |
| Q-60 | What does Regulation (EU) 2026/1744 say officially about AI Act application dates, and what are the transparency duties for chatbots? | Dates rest on law-firm summaries and an unofficial mirror. | Read the regulation in the Official Journal on EUR-Lex. | [other-industries.md](industries/other-industries.md) |
| Q-61 | GDPR Art. 5(1)(d), 5(1)(e), 9 and 30, and whether the household exemption covers personal business notes. | Not read; not relied on, but relevant to any store of personal data. | Read the articles on EUR-Lex; take legal advice on the exemption. | [other-industries.md](industries/other-industries.md) |
| Q-62 | ISO 9001 clause 7.5 wording and the 2026 edition; ISO/IEC 27001 current edition; ISO 13485 clause text. | `iso.org` was unreachable and the standards are paid documents. | Obtain the standards. | [other-industries.md](industries/other-industries.md) |
| Q-63 | HHS guidance on HIPAA and the status of the proposed Security Rule changes; 21 CFR 11.70 and Part 820 text. | Rests on press reports or was not read. | Read hhs.gov and the Federal Register; read the two CFR parts on ecfr.gov. | [other-industries.md](industries/other-industries.md) |
| Q-64 | Is a derived knowledge store a "required record" (17a-4), a "designated record set" (HIPAA) or an "electronic record" (Part 11)? Does a purge that leaves a content-free tombstone satisfy GDPR Art. 17? | Legal determinations per deployment; they shape D-10. | Professional legal advice before any regulated adapter. | [other-industries.md](industries/other-industries.md) |
| Q-65 | Bar confidentiality and conflict rules, information-barrier rules, call-recording laws, aerospace and automotive quality standards. | Not read. | Read before the corresponding adapter is designed (phase 6). | [other-industries.md](industries/other-industries.md) |
| Q-66 | Product descriptions for Drata, Bloomberg Terminal, Intercom Fin and Medplum. | Pages were blocked or had no readable description; labelled "likely". | Open the four vendor pages in a browser. | [other-industries.md](industries/other-industries.md) |
| Q-67 | Can a Postgres 18 `UNIQUE (... WITHOUT OVERLAPS)` constraint be partial; what will PostgreSQL 19 ship for temporal support? | Phase 4 schema. | On Postgres 18 try the constraint with a `WHERE` clause; read the 19 release notes at release. | [bi-temporal-modelling.md](technical/bi-temporal-modelling.md) |
| Q-68 | The SQL:2011 temporal feature set as described by Kulkarni and Michels (2012) was not read. | Feature names come from the PostgreSQL appendix only. | Fetch and read the paper. | [bi-temporal-modelling.md](technical/bi-temporal-modelling.md) |
| Q-69 | Postgres differences labelled "likely": full-text ranking versus BM25, recursive CTE syntax, `timestamptz` and range types, driver behaviour. | Phase 4 storage interface. | Read the PostgreSQL and pgvector documentation and run the spike queries on Postgres before phase 4. | [sqlite.md](technical/sqlite.md) |
| Q-70 | Do libSQL's vector features work on a local file through the `libsql` npm package, and does the file stay readable by stock SQLite? | Only relevant as an alternative to sqlite-vec. | Spike with `libsql` 0.5.29: create a vector index, then open the file with better-sqlite3. | [sqlite.md](technical/sqlite.md) |
| Q-71 | FTS5 `prefix` option, contentless-delete tables and `porter` stemming on real fact text were not examined. | Keyword search tuning. | Extend section 6 of the spike with the three options. | [sqlite.md](technical/sqlite.md) |
| Q-72 | Content of `getzep/zep-papers` issue 5 and the 58.44% figure. | One of the disputed LoCoMo numbers rests on secondary sources. | Open the issue from a network with GitHub access. | [evaluation.md](technical/evaluation.md) |
| Q-73 | Licences of DMR / Multi-Session Chat, CronQuestions and VibeMemBench; sizes of MemoryAgentBench and CronQuestions; whether VibeMemBench data is public; the category mapping in `locomo10.json`; other coding-memory benchmarks (LongMemCode, CAPA, AMB). | Needed before any public benchmark is used. | Read each dataset's repository, card and licence file. | [evaluation.md](technical/evaluation.md) |
| Q-74 | Embedding vendor details not found: Cohere `embed-v4.0` price; Jina price and free grant; MTEB score for all-MiniLM-L6-v2; absolute scores for voyage-code-4; Voyage batch pricing and rate limits; Gemini free-tier limits and data-use terms. | Only matters if a hosted or different model is chosen (D-6). | Read each vendor's pricing page in a browser. | [embeddings.md](technical/embeddings.md) |
| Q-75 | Are EmbeddingGemma's Gemma terms acceptable for Factloom's distribution? | It is not an Apache or MIT licence. | The owner reads the Gemma terms. | [embeddings.md](technical/embeddings.md) |
| Q-76 | Cited facts the independent review did not re-check: OpenAI and Gemini embedding prices, MTEB figures, local embedding timings; Kythe, SCIP, MADR, Cursor and gitleaks pages; FHIR pages, FRE 502, SOX statutes, the ICO page; Zep's LongMemEval figures. | They carry "confirmed" from one reading only. | Re-open each cited URL and compare with the document. | [embeddings.md](technical/embeddings.md), [software-development.md](industries/software-development.md), [other-industries.md](industries/other-industries.md), [contradiction-detection.md](technical/contradiction-detection.md) |
| Q-77 | Do results on entity matching (product and bibliographic records), Generative Agents scoring (believability) and HippoRAG (multi-hop QA over static corpora) transfer to Factloom's data? | The papers' settings differ from coding-agent memory. | Covered by the internal evaluation (Q-25, Q-28, Q-56, Q-57); no separate action. | [entity-resolution.md](technical/entity-resolution.md), [memory-decay-and-consolidation.md](technical/memory-decay-and-consolidation.md), [hybrid-retrieval.md](technical/hybrid-retrieval.md) |
| Q-78 | Does a measured over-merge rate for an LLM memory system exist anywhere? Was MMR correctly attributed to Carbonell and Goldstein (1998)? | Minor citations not traced to a primary source. | Literature search; fetch the 1998 paper. | [entity-resolution.md](technical/entity-resolution.md), [hybrid-retrieval.md](technical/hybrid-retrieval.md) |

## B. Decisions left to the architecture stage

Each entry gives the decision, the positions the research documents take, and the evidence that
exists. None is decided here. The architecture stage has since settled all twelve; the outcome of
each is listed in [`../architecture/DECISIONS.md`](../architecture/DECISIONS.md), under "How the
research questions were settled". The entries below are kept as the record of what the research
found.

**D-1. Supersession key: (subject, predicate) or (subject, predicate, qualifier).**
Positions: [bi-temporal-modelling.md](technical/bi-temporal-modelling.md) (rules 8 and 9),
[contradiction-detection.md](technical/contradiction-detection.md) (step 1a and the cardinality
hint) and [memwright.md](evaluations/memwright.md) use (subject, predicate).
[software-development.md](industries/software-development.md) (section C) and
[other-industries.md](industries/other-industries.md) (section b, item 3) ask for a nullable
qualifier (`slot`, period) in the key. The alternative that needs no qualifier is one predicate
per role (`uses_test_framework`). Evidence: the Memwright 2.0.6 run shows that a key that is too
broad supersedes unrelated facts; no run compares the two key shapes.

**D-2. Time filter before or after rank fusion.**
Positions: [hybrid-retrieval.md](technical/hybrid-retrieval.md) says inside every retriever, never
afterwards. The [spike](../../spikes/sqlite-vec-fts5/README.md) section 8 fuses first and filters
afterwards; its section 4 filters inside the vector search.
[sqlite.md](technical/sqlite.md) leaves the choice open; [memwright.md](evaluations/memwright.md)
accepts either. Evidence: both variants ran in the spike. Pre-filtering in `vec0` returns a full
`k` rows but needs integer copies of the time fields kept in step; post-filtering needs no copies
but can under-return. Graphiti filters inside each query (source read).

**D-3. Nullable `valid_from` and no sentinels, or NOT NULL bounds plus integer copies with
sentinels in `vec0`; and the stored time format.**
Positions: [bi-temporal-modelling.md](technical/bi-temporal-modelling.md) (rules 1 to 3): both
bounds nullable, no sentinel dates, one fixed-width TEXT format, never mixed.
[sqlite.md](technical/sqlite.md) and the spike: `valid_from text not null`, integer millisecond
copies in the vector table, a sentinel for an open `valid_to`. Evidence: `vec0` metadata columns
reject NULL and accept only integers (ran it). The spike predicate `valid_from <= :as_of` drops
rows with NULL `valid_from`, so the two documents' query predicates are not interchangeable. If
`valid_from` may be NULL and pre-filtering is chosen (D-2), the vector table needs a low sentinel
as well.

**D-4. Supersession link table or `superseded_by` column.**
Positions: [bi-temporal-modelling.md](technical/bi-temporal-modelling.md) (rule 6) asks for a
`fact_supersession` table with four kinds. The spike and [sqlite.md](technical/sqlite.md) use a
`superseded_by` column (as an illustration); the evaluations speak of "a link". Evidence: the
column ran in the spike; the table's many-to-one case comes from the invalidate-and-copy rule in
D-5 and has not been exercised.

**D-5. How `valid_to` is closed, and which mutations a fact row permits.**
Positions: [bi-temporal-modelling.md](technical/bi-temporal-modelling.md) (rule 4) permits only
`invalidated_at` NULL to a timestamp; closing `valid_to` is "invalidate the old row, insert a
copy". The review's alternative is a second one-time transition, `valid_to` NULL to a value,
recorded in the audit log. [sqlite.md](technical/sqlite.md) updates a derived index row
(`is_live`); [other-industries.md](industries/other-industries.md) needs purge (D-10). Evidence:
the invalidate-and-copy pattern gave correct answers at boundaries and across corrections in a
tested example (bi-temporal finding 8). Its cost per succession (two new rows, each with
full-text and vector entries, plus link rows) has not been measured. Whether derived indexes are
exempt from the immutability rule is unstated.

**D-6. Embedding model, runtime weight and dimensions.**
Positions: [embeddings.md](technical/embeddings.md) leads with local `nomic-embed-text-v1.5`
through Transformers.js at 768 dimensions and treats 256 as a later change.
[sqlite.md](technical/sqlite.md) advises a smaller dimension because brute-force query time grows
with it. [mnemograph.md](evaluations/mnemograph.md) and [cognee.md](evaluations/cognee.md) advise
against heavy ML dependencies by default. Evidence: the Transformers.js install measured 745 MB on
linux-x64 (macOS not measured); vendor MTEB v1 for nomic is 62.28 at 768 and 61.04 at 256;
changing dimension later means a new vector table and a re-embed; hosted `voyage-4-lite` costs
$0.02 per million tokens but needs a second key and sends text to a third party. Options to weigh:
local model as an optional package, hosted default, 256 from the start. See Q-23 and Q-25.

**D-7. Build setup: no build step in development, or `tsc -b` project references.**
Positions: [toolchain.md](technical/toolchain.md) presents both. Option 1: `exports` pointing at
`src`, plain `node`, build only for publishing (simpler). Option 2: `tsc -b`, `dist`, a custom
export condition, a Vitest `ssr` setting. [mcp.md](technical/mcp.md) writes the server start
command for Option 2. Evidence: both ran on Node v22.23.4 on Linux. Option 1 fails only for a
copied (installed) package and with `--preserve-symlinks`; it depends on Node type stripping
(stability 1.2 on Node 22). See Q-05 and Q-06.

**D-8. Lint tool, given TypeScript 7 and typescript-eslint.**
Positions: [toolchain.md](technical/toolchain.md) recommends Biome alone. Evidence: TypeScript
7.0 has no programmatic API; `typescript-eslint` 8.72.2 declares `typescript >=4.8.4 <6.1.0`, so
type-aware ESLint rules need a second TypeScript (6.x) installation. Biome and its import
restriction ran with TypeScript 7.0.2. The alternatives are to stay on TypeScript 6 for
type-aware lint, or to add ESLint later if 7.1 restores an API (Q-21).

**D-9. Node version floor.**
Positions: [toolchain.md](technical/toolchain.md) proposes `>=22.18.0`. The review suggests
`^22.18.0 || >=24` or `>=24`. Evidence: Node 22 reaches end of life on 2027-04-30; `>=22.18.0`
admits Node 23 and 25, which Vitest 5.1.0's `engines` does not list; the MCP SDK packages need
`>=20` and better-sqlite3 `>=22`; only Node 22.23.4 was exercised (Q-04).

**D-10. "Invalidate, never delete" versus a rare, audited purge.**
Positions: the settled data rule is "invalidate, never delete".
[other-industries.md](industries/other-industries.md) reports a narrow conflict (erasure under
GDPR Art. 17; the EDPB guidance on append-only stores) and
[software-development.md](industries/software-development.md) raises the same need for a secret
stored by mistake. Both suggest purge as a separate, audited operation that removes content and
leaves a tombstone. [memory-decay-and-consolidation.md](technical/memory-decay-and-consolidation.md)
says not to build hard deletion yet. Evidence: regulation texts read on mirrors (Q-59); no purge
was prototyped. The layout consequence (audit rows refer to content by id, not by copy) is the
part that is hard to change later.

**D-11. Graph expansion in phase 1: on by default or behind a flag; directed or undirected.**
Positions: [hybrid-retrieval.md](technical/hybrid-retrieval.md) makes it a third retriever and
tested an undirected walk with `UNION`. [sqlite.md](technical/sqlite.md) and the spike walk
subject to object only, with a path-string cycle guard. The review suggests vector plus keyword
first, graph behind a flag once measured. Evidence: both walks ran on toy graphs; the benefit for
coding-agent memory is unverified (Q-28), as is the cost on hub entities (Q-14).

**D-12. Number of outcome labels for contradiction detection.**
Positions: [contradiction-detection.md](technical/contradiction-detection.md) proposes five labels
plus a per-predicate cardinality map. The review suggests three outcomes (duplicate, supersedes,
keep both) until an evaluation set exists, because the effect of `refines` is unresolved in the
document's own open questions. Evidence: no accuracy measurement exists for either (Q-30).

## C. Over-engineering watch list

Items a research document asks for early, and the independent review's reason each may be
deferrable. All are open, not decided.

- `entity_mention`, `entity_alias` and `entity_merge` tables and `entity.merged_into` from day one
  ([entity-resolution.md](technical/entity-resolution.md)). Review: the phase 1 pipeline never
  merges; these are additive tables and columns; only the rule "never rewrite `entity_id` on
  facts" would force a rewrite if broken.
- A `fact_usage` table, a retrieval log, a `pinned` flag and `last_verified_at` from day one
  ([memory-decay-and-consolidation.md](technical/memory-decay-and-consolidation.md)). Review:
  nothing consumes them before phase 3; only access history is unrecoverable, and an archiving
  window can start when the rule is introduced.
- Blob id, line span and span hash on every phase 1 source
  ([software-development.md](industries/software-development.md), section E). Review: phase 1
  ingests only explicit "remember" calls, most of which have no file or span; these are nullable
  columns that can arrive with later sources.
- Nine entity types and fourteen predicates before any data exists, including `Symbol` and
  `located_at` ([software-development.md](industries/software-development.md), sections B and C).
  Review: start with the four or five that the eight scenarios in section I use.
- A secrets scanner with patterns plus an entropy check
  ([software-development.md](industries/software-development.md), section G). Review: could start
  with patterns only.
- Invalidate-and-copy to close `valid_to`, with a four-kind supersession table and a separate
  `observed_at` ([bi-temporal-modelling.md](technical/bi-temporal-modelling.md), rules 4, 6, 7).
  Review: each ordinary succession costs two new rows with index entries; a one-time `valid_to`
  update recorded in the audit log is simpler; `observed_at` duplicates the source timestamp
  unless a fact has several sources. See D-4 and D-5.
- An asynchronous storage interface over a synchronous driver
  ([sqlite.md](technical/sqlite.md)). Review: not free, because a better-sqlite3 transaction
  cannot span an `await`, so every atomic multi-row write must be one coarse storage method.
- `source.derived_from`, a `qualifier` in the key, and defining `purge` before it is exposed
  ([other-industries.md](industries/other-industries.md), section b). Review: each is a nullable
  column or a later operation by the document's own test; the 19-row capability matrix is
  phase 6 material. See D-1 and D-10.
- `tsc -b` project references, `dist`, a three-entry `exports` map and a custom condition
  ([toolchain.md](technical/toolchain.md)). Review: all of it exists to avoid a stale `dist`,
  which a no-build setup does not have. See D-7.
- Three evaluation layers with record and replay, eight metrics and 110 to 180 hand-reviewed
  cases ([evaluation.md](technical/evaluation.md)). Review: layer A (about 30 cases) is what
  phase 1 needs; start layer B with about 10 scenarios in phase 2.
- Five contradiction labels and an adapter-supplied cardinality map
  ([contradiction-detection.md](technical/contradiction-detection.md)). Review: three outcomes
  cover the table for phase 2. See D-12.
- Graph expansion as a third retriever in phase 1
  ([hybrid-retrieval.md](technical/hybrid-retrieval.md)). Review: its value is unverified;
  vector plus keyword first. See D-11.

## D. Blocked hosts during research

Hosts that could not be reached, or not read, from the research, review or correction sessions on
2026-11-13, and what was used instead. Status codes in the last column are from a probe on
2026-11-13 during the correction pass.

| Host | What was wanted | What was used instead | Observed |
|---|---|---|---|
| `api.github.com`, `github.com` web pages | Issue titles and states, star, fork and issue counts | Git clones over HTTPS worked and were used for all source reading. The counts and issue states in the documents are as recorded by the research sessions and were not re-checked (Q-37, Q-38, Q-08, Q-72). | HTTP 403, "GitHub access to this repository is not enabled for this session" |
| `ecfr.gov` | US regulation text | `law.cornell.edu` (Legal Information Institute mirror) | Redirect to a bot check (HTTP 302) |
| `sec.gov` | SEC rule text | `law.cornell.edu` | HTTP 403 |
| `hhs.gov` | HIPAA guidance | Not read; regulation text from `law.cornell.edu` (Q-63) | HTTP 403 |
| `iso.org` | ISO 9001, 27001, 13485 | Not read (Q-62) | HTTP 403 |
| `eur-lex.europa.eu` | GDPR, AI Act, Regulation (EU) 2026/1744 | `gdpr-info.eu` and `artificialintelligenceact.eu` (unofficial mirrors) (Q-59, Q-60) | Empty response (HTTP 202) |
| `whitecase.com` | Law-firm summary of the AI Act timing | Cited by the research session; the review session received HTTP 403 and could not re-check it | Home page returned HTTP 200 in the correction session; the article was not re-fetched |
| `drata.com`, `bloomberg.com` | Vendor product descriptions | Descriptions labelled "likely" (Q-66) | HTTP 403 |
| OpenAI pricing page | Embedding prices | Read by the research session; the review could not parse it because it is script-rendered (Q-76) | Not probed |

Reachable and used without problems: the npm registry, PyPI, `huggingface.co` and its CDN,
`arxiv.org`, `nodejs.org`, `platform.claude.com`, `code.claude.com`, `law.cornell.edu`.
