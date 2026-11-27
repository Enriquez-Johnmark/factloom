import { type Embedder, err, ok, type Result } from '@kronomind/core';
import { type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers';

// What the embedding spike ran (spikes/embedding-retrieval/README.md, "Model configurations")
// and ADR 0014 chose: the Xenova ONNX conversion of BAAI/bge-small-en-v1.5, quantised, with
// CLS pooling. The revision is the full commit the spike's short `ea104da` names, from
// https://huggingface.co/api/models/Xenova/bge-small-en-v1.5 on 2026-11-16. It is pinned
// because the spike notes that an unpinned revision can change results.
const MODEL_REPOSITORY = 'Xenova/bge-small-en-v1.5';
const MODEL_REVISION = 'ea104dacec62c0de699686887e3f920caeb4f3e3';
const QUANTISATION = 'q8';
const POOLING = 'cls';
const DIMENSIONS = 384;
/** Put in front of a question only, as the BAAI/bge-small-en-v1.5 model card says and the spike quotes. */
const QUESTION_INSTRUCTION = 'Represent this sentence for searching relevant passages: ';

/**
 * Names everything that changes the vectors, so the storage adapter refuses a database built
 * with any other: the repository, the revision, the quantisation and the pooling.
 */
const MODEL_NAME = `${MODEL_REPOSITORY}@${MODEL_REVISION}:${QUANTISATION}:${POOLING}`;

export type LocalEmbedderOptions = {
  /** Where the model files are kept. The composition root passes one outside `node_modules`. */
  readonly cacheDirectory: string;
  /** False keeps the embedder to files already in the cache directory. */
  readonly allowDownload: boolean;
};

/** The vectors of a [texts x dimensions] output, one copy per text, in order. */
function splitRows(data: unknown, count: number): Result<readonly Float32Array[]> {
  if (!(data instanceof Float32Array) || data.length !== count * DIMENSIONS) {
    return err(
      'embedding_failed',
      `The embedding model returned output of an unexpected shape for ${count} texts.`,
    );
  }
  return ok(Array.from({ length: count }, (_, row) => data.slice(row * DIMENSIONS, (row + 1) * DIMENSIONS)));
}

/**
 * Creates an `Embedder` that runs BAAI/bge-small-en-v1.5 on this machine: 384 dimensions, no
 * API key, and no text leaving the machine. The model is loaded on the first call to `embed`,
 * downloading it into the cache directory if it is not there. A question gets the model's
 * instruction in front of it; a statement is embedded unchanged. Every failure is
 * `embedding_failed`.
 */
export function createLocalEmbedder(options: LocalEmbedderOptions): Embedder {
  // The loading model, shared by every call. A failed load is forgotten, so a later call tries again.
  let loading: Promise<FeatureExtractionPipeline> | null = null;
  const load = (): Promise<FeatureExtractionPipeline> => {
    loading ??= pipeline('feature-extraction', MODEL_REPOSITORY, {
      revision: MODEL_REVISION,
      dtype: QUANTISATION,
      cache_dir: options.cacheDirectory,
      local_files_only: !options.allowDownload,
    });
    loading.catch(() => {
      loading = null;
    });
    return loading;
  };

  return {
    model: MODEL_NAME,
    dimensions: DIMENSIONS,
    async embed(texts, purpose) {
      if (texts.length === 0) return ok([]);
      let extractor: FeatureExtractionPipeline;
      try {
        extractor = await load();
      } catch (thrown) {
        return err(
          'embedding_failed',
          `The embedding model ${MODEL_REPOSITORY} could not be loaded from ${options.cacheDirectory}. Its first use needs network access to huggingface.co, to download it.`,
          { cause: thrown },
        );
      }
      const inputs = purpose === 'question' ? texts.map((text) => QUESTION_INSTRUCTION + text) : [...texts];
      try {
        const output = await extractor(inputs, { pooling: POOLING, normalize: true });
        return splitRows(output.data, inputs.length);
      } catch (thrown) {
        return err('embedding_failed', 'The embedding model failed to embed the texts.', { cause: thrown });
      }
    },
  };
}
