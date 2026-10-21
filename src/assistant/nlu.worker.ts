/// <reference lib="webworker" />
/**
 * Sentence meaning for the assistant: paraphrase-MiniLM-L3-v2 (Apache-2.0) on onnxruntime-web, in
 * this worker. A sentence becomes 384 numbers ("embedding"); sentences that mean the same thing get
 * close numbers. Steps as sentence-transformers does them: BERT uncased word pieces → model → mean
 * of the token vectors (padding left out) → scaled to length 1. It never writes text.
 * Runs only when a question was not understood; the page ends this worker after a few idle minutes.
 */
import * as ort from 'onnxruntime-web/wasm'
import { encodeWordPieces } from './wordPiece'

type Message = { type: 'init'; base: string; ortBase: string } | { type: 'embed'; id: number; texts: string[] }

let ready: Promise<{ session: ort.InferenceSession; vocab: Map<string, number> }> | null = null

async function load(base: string, ortBase: string) {
  ort.env.wasm.wasmPaths = { wasm: `${ortBase}ort-wasm-simd-threaded.wasm` }
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  const [session, vocabText] = await Promise.all([
    ort.InferenceSession.create(`${base}model_quantized.onnx`, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }),
    fetch(`${base}vocab.txt`).then((r) => r.text()),
  ])
  const vocab = new Map<string, number>()
  vocabText.split(/\r?\n/).forEach((t, i) => t && vocab.set(t, i))
  return { session, vocab }
}

async function embed(session: ort.InferenceSession, vocab: Map<string, number>, text: string): Promise<Float32Array> {
  const ids = encodeWordPieces(text, vocab, 64)
  const n = ids.length
  const big = (xs: number[]) => BigInt64Array.from(xs, (x) => BigInt(x))
  const feeds: Record<string, ort.Tensor> = {}
  for (const name of session.inputNames) {
    if (name === 'input_ids') feeds[name] = new ort.Tensor('int64', big(ids), [1, n])
    else if (name === 'attention_mask') feeds[name] = new ort.Tensor('int64', big(ids.map(() => 1)), [1, n])
    else if (name === 'token_type_ids') feeds[name] = new ort.Tensor('int64', big(ids.map(() => 0)), [1, n])
  }
  const out = await session.run(feeds)
  const hidden = out[session.outputNames[0]]
  const dim = hidden.dims[2]
  const data = hidden.data as Float32Array
  const v = new Float32Array(dim)
  for (let t = 0; t < n; t++) for (let d = 0; d < dim; d++) v[d] += data[t * dim + d] / n
  let len = 0
  for (const x of v) len += x * x
  len = Math.sqrt(len) || 1
  for (let d = 0; d < dim; d++) v[d] /= len
  for (const t of Object.values(out)) t.dispose()
  return v
}

self.onmessage = async (e: MessageEvent<Message>) => {
  const m = e.data
  try {
    if (m.type === 'init') {
      ready ??= load(m.base, m.ortBase)
      await ready
      self.postMessage({ type: 'ready' })
      return
    }
    if (!ready) throw new Error('not started')
    const { session, vocab } = await ready
    const vectors: Float32Array[] = []
    for (const t of m.texts) vectors.push(await embed(session, vocab, t))
    self.postMessage({ type: 'vectors', id: m.id, vectors }, vectors.map((v) => v.buffer))
  } catch (err) {
    self.postMessage({ type: 'error', id: m.type === 'embed' ? m.id : undefined, message: err instanceof Error ? err.message : String(err) })
  }
}
