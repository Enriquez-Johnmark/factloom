// Spike: retrieval quality of local embedding models on 60 code-memory statements,
// alone and fused with a BM25 keyword ranking. Throwaway; see README.md.
//
// Deterministic: fixed corpus and query order, no randomness, ties broken by corpus order.
// Timings vary between runs; rankings do not.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env, pipeline } from "@huggingface/transformers";

const spikeDirectory = dirname(fileURLToPath(import.meta.url));
// Kept inside node_modules so the root .gitignore already covers the downloaded models.
const modelCacheDirectory = join(spikeDirectory, "node_modules", ".cache", "embedding-spike-models");
env.cacheDir = modelCacheDirectory;

const BGE_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: ";
const RRF_K = 60;
const RANK_DEPTH = 10; // MRR@10; recall@5 and recall@1 are read from the same list
const QUERY_GROUPS = ["paraphrase", "keyword", "why", "hard"];

// Question words and function words. Without this list a question such as "How do I ..." gives a
// keyword match to every statement containing "do" or "the". Fixed list, written before it was run.
const STOP_WORDS = new Set(
  ("a an and are as at be been both by can did do does don for from get had has have how i if in into is isn it its " +
    "my not of on or our out s should so someone t than that the their them there they this to until was we were " +
    "what when where which while who why with without").split(" "),
);

// Three ways to fuse the embedding ranking with the keyword ranking. Recipe A was the plan; B and C
// were added after A's first result (see README, "Change made after the first run").
const HYBRID_RECIPES = [
  { key: "A", description: "RRF over full lists (all 60 embedding ranks; every BM25 match)", depth: Infinity, stopWords: false },
  { key: "B", description: "RRF over the top 10 of each list", depth: 10, stopWords: false },
  { key: "C", description: "RRF over the top 10 of each list, BM25 ignoring stop words", depth: 10, stopWords: true },
];

// Each model is loaded once. `variants` are the configurations evaluated from that one load.
const MODELS = [
  {
    repo: "nomic-ai/nomic-embed-text-v1.5",
    dtype: "q8",
    pooling: "mean",
    documentPrefix: "search_document: ",
    variants: [
      { label: "nomic-v1.5 q8, 768d", queryPrefix: "search_query: ", dimensions: 768 },
      { label: "nomic-v1.5 q8, 256d (Matryoshka)", queryPrefix: "search_query: ", dimensions: 256, matryoshka: true },
    ],
  },
  {
    repo: "Xenova/bge-small-en-v1.5",
    dtype: "fp32",
    pooling: "cls",
    documentPrefix: "",
    variants: [
      { label: "bge-small-v1.5 fp32, query instruction", queryPrefix: BGE_QUERY_INSTRUCTION, dimensions: 384 },
      { label: "bge-small-v1.5 fp32, no instruction", queryPrefix: "", dimensions: 384 },
    ],
  },
  {
    // Same weights quantised, so the size comparison with nomic q8 is like for like.
    repo: "Xenova/bge-small-en-v1.5",
    dtype: "q8",
    pooling: "cls",
    documentPrefix: "",
    variants: [
      { label: "bge-small-v1.5 q8, query instruction", queryPrefix: BGE_QUERY_INSTRUCTION, dimensions: 384 },
      { label: "bge-small-v1.5 q8, no instruction", queryPrefix: "", dimensions: 384 },
    ],
  },
  {
    // Floor: the oldest and smallest model in the earlier research.
    repo: "Xenova/all-MiniLM-L6-v2",
    dtype: "fp32",
    pooling: "mean",
    documentPrefix: "",
    variants: [{ label: "all-MiniLM-L6-v2 fp32 (floor)", queryPrefix: "", dimensions: 384 }],
  },
];

// ---------- vectors ----------

/** Scales a vector to unit length so that a dot product equals cosine similarity. */
function normalise(vector) {
  let sumOfSquares = 0;
  for (const value of vector) sumOfSquares += value * value;
  const length = Math.sqrt(sumOfSquares);
  return vector.map((value) => value / length);
}

/** Layer normalisation without learned weights, as the nomic card applies before truncating. */
function applyLayerNorm(vector) {
  const mean = vector.reduce((sum, value) => sum + value, 0) / vector.length;
  const variance = vector.reduce((sum, value) => sum + (value - mean) ** 2, 0) / vector.length;
  const deviation = Math.sqrt(variance + 1e-5);
  return vector.map((value) => (value - mean) / deviation);
}

/** Turns a pooled, un-normalised model output into the unit vector one variant would store. */
function finishVector(pooledVector, variant) {
  if (!variant.matryoshka) return normalise(pooledVector);
  return normalise(applyLayerNorm(pooledVector).slice(0, variant.dimensions));
}

function dotProduct(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index++) sum += left[index] * right[index];
  return sum;
}

// ---------- rankings ----------

/** Orders corpus positions by descending score; equal scores keep corpus order. */
function rankByScore(scores) {
  return scores
    .map((score, position) => ({ score, position }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .map((entry) => entry.position);
}

/** Lowercases and splits on anything that is not a letter, digit or underscore. No stemming. */
function tokenise(text, dropStopWords) {
  const tokens = text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  return dropStopWords ? tokens.filter((token) => !STOP_WORDS.has(token)) : tokens;
}

/** Builds a BM25 (k1 = 1.2, b = 0.75) scorer over the corpus and returns a query -> ranking function. */
function buildBm25Ranker(documentTexts, dropStopWords) {
  const k1 = 1.2;
  const b = 0.75;
  const documentTokens = documentTexts.map((text) => tokenise(text, dropStopWords));
  const averageLength = documentTokens.reduce((sum, tokens) => sum + tokens.length, 0) / documentTokens.length;
  const termFrequencies = documentTokens.map((tokens) => {
    const counts = new Map();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    return counts;
  });
  const documentFrequency = new Map();
  for (const counts of termFrequencies) {
    for (const term of counts.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
  return (queryText) => {
    const queryTerms = [...new Set(tokenise(queryText, dropStopWords))];
    const scores = termFrequencies.map((counts, position) => {
      let score = 0;
      for (const term of queryTerms) {
        const frequency = counts.get(term);
        if (!frequency) continue;
        const containing = documentFrequency.get(term);
        const inverseDocumentFrequency = Math.log(1 + (documentTexts.length - containing + 0.5) / (containing + 0.5));
        const lengthFactor = 1 - b + (b * documentTokens[position].length) / averageLength;
        score += (inverseDocumentFrequency * frequency * (k1 + 1)) / (frequency + k1 * lengthFactor);
      }
      return score;
    });
    return rankByScore(scores);
  };
}

/** Reciprocal rank fusion of the first `depth` entries of several rankings: score = sum of 1 / (k + rank). */
function fuseRankings(rankings, corpusSize, depth) {
  const scores = new Array(corpusSize).fill(0);
  for (const ranking of rankings) {
    ranking.slice(0, depth).forEach((position, index) => {
      scores[position] += 1 / (RRF_K + index + 1);
    });
  }
  return rankByScore(scores);
}

// ---------- metrics ----------

/**
 * Scores one configuration. `rankings[i]` is the ranked corpus positions for query i.
 * recall@k = relevant statements in the top k / min(k, number of relevant statements).
 * MRR@10 uses the first relevant statement in the top 10, 0 if none.
 */
function scoreRankings(rankings, queries, positionOfStatement) {
  const perQuery = queries.map((query, index) => {
    const relevantPositions = new Set(query.relevant.map((id) => positionOfStatement.get(id)));
    const top = rankings[index].slice(0, RANK_DEPTH);
    const firstRelevantIndex = top.findIndex((position) => relevantPositions.has(position));
    const recallAt = (k) =>
      top.slice(0, k).filter((position) => relevantPositions.has(position)).length / Math.min(k, relevantPositions.size);
    return {
      group: query.group,
      firstRelevantRank: firstRelevantIndex === -1 ? null : firstRelevantIndex + 1,
      recallAt1: recallAt(1),
      recallAt5: recallAt(5),
      reciprocalRank: firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1),
    };
  });
  const summarise = (rows) => ({
    count: rows.length,
    recallAt1: mean(rows.map((row) => row.recallAt1)),
    recallAt5: mean(rows.map((row) => row.recallAt5)),
    mrrAt10: mean(rows.map((row) => row.reciprocalRank)),
  });
  const groups = Object.fromEntries(
    QUERY_GROUPS.map((group) => [group, summarise(perQuery.filter((row) => row.group === group))]),
  );
  return { overall: summarise(perQuery), groups, perQuery };
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// ---------- model handling ----------

function measureDirectoryBytes(directory) {
  if (!existsSync(directory)) return 0;
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    total += entry.isDirectory() ? measureDirectoryBytes(path) : statSync(path).size;
  }
  return total;
}

/** Lists the ONNX files cached for a model repo with their sizes. */
function listOnnxFiles(directory, found = []) {
  if (!existsSync(directory)) return found;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) listOnnxFiles(path, found);
    else if (entry.name.endsWith(".onnx")) found.push({ name: entry.name, bytes: statSync(path).size });
  }
  return found;
}

/** Embeds texts one at a time (the way a memory is written or a query arrives) and times them. */
async function embedOneByOne(extractor, pooling, texts) {
  const vectors = [];
  const startedAt = performance.now();
  for (const text of texts) {
    const output = await extractor(text, { pooling, normalize: false });
    vectors.push(Array.from(output.data));
  }
  return { vectors, milliseconds: performance.now() - startedAt };
}

/** Loads one model, embeds the corpus once and the queries once per distinct query prefix. */
async function embedWithModel(model, statements, queries) {
  const repoCacheDirectory = join(modelCacheDirectory, model.repo);
  const wasCached = listOnnxFiles(repoCacheDirectory).some((file) => file.name === onnxFileName(model.dtype));

  const loadStartedAt = performance.now();
  const extractor = await pipeline("feature-extraction", model.repo, { dtype: model.dtype });
  const loadMilliseconds = performance.now() - loadStartedAt;

  await extractor("warm-up", { pooling: model.pooling, normalize: false });

  const documents = await embedOneByOne(
    extractor,
    model.pooling,
    statements.map((statement) => model.documentPrefix + statement.text),
  );
  let embeddedTexts = statements.length;
  let embedMilliseconds = documents.milliseconds;

  const queryVectorsByPrefix = new Map();
  for (const variant of model.variants) {
    if (queryVectorsByPrefix.has(variant.queryPrefix)) continue;
    const embedded = await embedOneByOne(
      extractor,
      model.pooling,
      queries.map((query) => variant.queryPrefix + query.text),
    );
    queryVectorsByPrefix.set(variant.queryPrefix, embedded.vectors);
    embeddedTexts += queries.length;
    embedMilliseconds += embedded.milliseconds;
  }
  await extractor.dispose();

  const onnxFile = listOnnxFiles(repoCacheDirectory).find((file) => file.name === onnxFileName(model.dtype));
  return {
    documentVectors: documents.vectors,
    queryVectorsByPrefix,
    stats: {
      repo: model.repo,
      dtype: model.dtype,
      pooling: model.pooling,
      wasCached,
      loadMilliseconds,
      millisecondsPerText: embedMilliseconds / embeddedTexts,
      embeddedTexts,
      onnxFileName: onnxFile?.name ?? "not found",
      onnxFileBytes: onnxFile?.bytes ?? 0,
    },
  };
}

function onnxFileName(dtype) {
  return dtype === "fp32" ? "model.onnx" : "model_quantized.onnx";
}

// ---------- output ----------

const formatScore = (value) => value.toFixed(3);
const formatMegabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function printMetricsTable(title, rows, pick) {
  console.log(`\n### ${title}\n`);
  console.log("| Configuration | recall@1 | recall@5 | MRR@10 |");
  console.log("|---|---|---|---|");
  for (const row of rows) {
    const metrics = pick(row.result);
    console.log(
      `| ${row.label} | ${formatScore(metrics.recallAt1)} | ${formatScore(metrics.recallAt5)} | ${formatScore(metrics.mrrAt10)} |`,
    );
  }
}

/** Counts queries where one configuration ranks the first relevant statement higher than the other. */
function printPairedComparison(leftRow, rightRow, queries) {
  const rankOrWorst = (rank) => rank ?? RANK_DEPTH + 1;
  const leftBetter = [];
  const rightBetter = [];
  queries.forEach((query, index) => {
    const left = rankOrWorst(leftRow.result.perQuery[index].firstRelevantRank);
    const right = rankOrWorst(rightRow.result.perQuery[index].firstRelevantRank);
    if (left < right) leftBetter.push(`${query.id} (${left} vs ${right})`);
    if (right < left) rightBetter.push(`${query.id} (${right} vs ${left})`);
  });
  console.log(`\n"${leftRow.label}" vs "${rightRow.label}"`);
  console.log(`  same rank of first relevant statement: ${queries.length - leftBetter.length - rightBetter.length} of ${queries.length}`);
  console.log(`  first is better on ${leftBetter.length}: ${leftBetter.join(", ") || "-"}`);
  console.log(`  second is better on ${rightBetter.length}: ${rightBetter.join(", ") || "-"}`);
}

// ---------- main ----------

const cases = JSON.parse(readFileSync(join(spikeDirectory, "cases.json"), "utf8"));
const { statements, queries } = cases;
const positionOfStatement = new Map(statements.map((statement, position) => [statement.id, position]));
for (const query of queries) {
  for (const id of query.relevant) {
    if (!positionOfStatement.has(id)) throw new Error(`Query ${query.id} names unknown statement ${id}`);
  }
}

console.log(`Node ${process.version}, ${process.platform}-${process.arch}, ${cpus().length} x ${cpus()[0].model}`);
console.log(`@huggingface/transformers ${env.version}`);
console.log(`${statements.length} statements, ${queries.length} queries`);

const statementTexts = statements.map((statement) => statement.text);
const rankWithBm25 = buildBm25Ranker(statementTexts, false);
const rankWithBm25NoStopWords = buildBm25Ranker(statementTexts, true);
const bm25Rankings = queries.map((query) => rankWithBm25(query.text));
const bm25NoStopWordRankings = queries.map((query) => rankWithBm25NoStopWords(query.text));

const embeddingRows = [];
const hybridRowsByRecipe = Object.fromEntries(HYBRID_RECIPES.map((recipe) => [recipe.key, []]));
const modelStats = [];

for (const model of MODELS) {
  const embedded = await embedWithModel(model, statements, queries);
  modelStats.push(embedded.stats);
  for (const variant of model.variants) {
    const documentVectors = embedded.documentVectors.map((vector) => finishVector(vector, variant));
    const queryVectors = embedded.queryVectorsByPrefix.get(variant.queryPrefix).map((vector) => finishVector(vector, variant));
    if (documentVectors[0].length !== variant.dimensions) {
      throw new Error(`${variant.label}: expected ${variant.dimensions} dimensions, got ${documentVectors[0].length}`);
    }
    const rankings = queryVectors.map((queryVector) =>
      rankByScore(documentVectors.map((documentVector) => dotProduct(queryVector, documentVector) + 2)),
    );
    embeddingRows.push({ label: variant.label, result: scoreRankings(rankings, queries, positionOfStatement) });
    for (const recipe of HYBRID_RECIPES) {
      const keywordRankings = recipe.stopWords ? bm25NoStopWordRankings : bm25Rankings;
      const fusedRankings = rankings.map((ranking, index) =>
        fuseRankings([ranking, keywordRankings[index]], statements.length, recipe.depth),
      );
      hybridRowsByRecipe[recipe.key].push({
        label: `${variant.label} + BM25 [${recipe.key}]`,
        result: scoreRankings(fusedRankings, queries, positionOfStatement),
      });
    }
  }
}

const bm25Rows = [
  { label: "BM25 only (keyword baseline)", result: scoreRankings(bm25Rankings, queries, positionOfStatement) },
  { label: "BM25 only, ignoring stop words", result: scoreRankings(bm25NoStopWordRankings, queries, positionOfStatement) },
];
const allRows = [...bm25Rows, ...embeddingRows, ...HYBRID_RECIPES.flatMap((recipe) => hybridRowsByRecipe[recipe.key])];

console.log("\n## Models\n");
console.log("| Model repo | dtype | Pooling | ONNX file | Size on disk | Load (cached?) | Mean embed time per text |");
console.log("|---|---|---|---|---|---|---|");
for (const stats of modelStats) {
  console.log(
    `| ${stats.repo} | ${stats.dtype} | ${stats.pooling} | ${stats.onnxFileName} | ${formatMegabytes(stats.onnxFileBytes)} | ` +
      `${(stats.loadMilliseconds / 1000).toFixed(2)} s (${stats.wasCached ? "cached" : "includes download"}) | ` +
      `${stats.millisecondsPerText.toFixed(1)} ms over ${stats.embeddedTexts} texts |`,
  );
}
console.log(`\nModel cache total: ${formatMegabytes(measureDirectoryBytes(modelCacheDirectory))}`);

console.log("\n## Results\n");
console.log(`A difference of ${formatScore(1 / queries.length)} in recall@1 or recall@5 is one query out of ${queries.length}.`);
printMetricsTable(`All ${queries.length} queries: keyword baseline and embedding only`, [...bm25Rows, ...embeddingRows], (result) => result.overall);
for (const recipe of HYBRID_RECIPES) {
  printMetricsTable(
    `All ${queries.length} queries: hybrid recipe ${recipe.key}: ${recipe.description} (k = ${RRF_K})`,
    hybridRowsByRecipe[recipe.key],
    (result) => result.overall,
  );
}
for (const group of QUERY_GROUPS) {
  const groupSize = queries.filter((query) => query.group === group).length;
  printMetricsTable(`Group "${group}" (${groupSize} queries)`, allRows, (result) => result.groups[group]);
}

console.log("\n## Rank of the first relevant statement per query (- = not in top 10)\n");
console.log(`| Configuration | ${queries.map((query) => query.id).join(" | ")} |`);
console.log(`|---|${queries.map(() => "---").join("|")}|`);
for (const row of allRows) {
  console.log(`| ${row.label} | ${row.result.perQuery.map((entry) => entry.firstRelevantRank ?? "-").join(" | ")} |`);
}

console.log("\n## Paired comparisons (rank of first relevant statement, lower is better; 11 = not in top 10)");
const findRow = (rows, label) => {
  const row = rows.find((candidate) => candidate.label === label);
  if (!row) throw new Error(`No configuration labelled "${label}"`);
  return row;
};
const NOMIC = "nomic-v1.5 q8, 768d";
const NOMIC_256 = "nomic-v1.5 q8, 256d (Matryoshka)";
const BGE_Q8 = "bge-small-v1.5 q8, query instruction";
const BGE_FP32 = "bge-small-v1.5 fp32, query instruction";
printPairedComparison(findRow(embeddingRows, NOMIC), findRow(embeddingRows, BGE_FP32), queries);
printPairedComparison(findRow(embeddingRows, NOMIC), findRow(embeddingRows, BGE_Q8), queries);
for (const recipe of HYBRID_RECIPES) {
  const rows = hybridRowsByRecipe[recipe.key];
  const label = (name) => `${name} + BM25 [${recipe.key}]`;
  printPairedComparison(findRow(rows, label(NOMIC)), findRow(rows, label(BGE_FP32)), queries);
  printPairedComparison(findRow(rows, label(NOMIC)), findRow(rows, label(BGE_Q8)), queries);
  printPairedComparison(findRow(rows, label(NOMIC)), findRow(rows, label(NOMIC_256)), queries);
}
