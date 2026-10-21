/// <reference lib="webworker" />
/**
 * Speech to text for the assistant's questions: Moonshine (Useful Sensors, MIT) on
 * onnxruntime-web, in this worker. Unlike the small Vosk model it copes with real microphones and
 * accents, and its cost grows with the length of what was said (no fixed 30 s window like Whisper).
 * Steps as in transformers.js' Moonshine: 16 kHz samples -> encoder -> greedy decoding from token 1
 * until token 2, re-running the decoder over the tokens so far (a question is ~20 tokens, so no
 * key/value cache is needed) -> SentencePiece-style BPE tokens back to text.
 * Runs only after a question was spoken; the page ends this worker after a few idle minutes.
 */
import * as ort from 'onnxruntime-web/wasm'

type Message = { type: 'init'; base: string; ortBase: string } | { type: 'transcribe'; id: number; samples: Float32Array }

interface Model {
  encoder: ort.InferenceSession
  decoder: ort.InferenceSession
  tokens: string[]
}

let ready: Promise<Model> | null = null

const START = 1
const END = 2
/** Moonshine says ~6.5 tokens per second of speech is plenty; a little more for short clips. */
const maxTokens = (seconds: number) => Math.ceil(seconds * 6.5) + 10

async function load(base: string, ortBase: string): Promise<Model> {
  ort.env.wasm.wasmPaths = { wasm: `${ortBase}ort-wasm-simd-threaded.wasm` }
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  const opts: ort.InferenceSession.SessionOptions = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }
  const [encoder, decoder, tokenizer] = await Promise.all([
    ort.InferenceSession.create(`${base}encoder_model_quantized.onnx`, opts),
    ort.InferenceSession.create(`${base}decoder_model_quantized.onnx`, opts),
    fetch(`${base}tokenizer.json`).then((r) => r.json() as Promise<{ model: { vocab: Record<string, number> } }>),
  ])
  const tokens: string[] = []
  for (const [t, id] of Object.entries(tokenizer.model.vocab)) tokens[id] = t
  return { encoder, decoder, tokens }
}

/** BPE tokens back to text: "▁" = space, "<0xNN>" = a raw byte (UTF-8), special tokens dropped. */
export function decodeTokens(ids: number[], tokens: string[]): string {
  const bytes: number[] = []
  for (const id of ids) {
    const t = tokens[id]
    if (!t || id <= END) continue
    const byte = /^<0x([0-9A-F]{2})>$/.exec(t)
    if (byte) bytes.push(parseInt(byte[1], 16))
    else bytes.push(...new TextEncoder().encode(t.replace(/▁/g, ' ')))
  }
  return new TextDecoder().decode(new Uint8Array(bytes)).trim()
}

async function transcribe(m: Model, samples: Float32Array): Promise<string> {
  const enc = await m.encoder.run({ [m.encoder.inputNames[0]]: new ort.Tensor('float32', samples, [1, samples.length]) })
  const hidden = enc[m.encoder.outputNames[0]]
  const ids = [START]
  const limit = maxTokens(samples.length / 16000)
  while (ids.length < limit) {
    const feeds: Record<string, ort.Tensor> = {}
    for (const name of m.decoder.inputNames) {
      if (name === 'input_ids') feeds[name] = new ort.Tensor('int64', BigInt64Array.from(ids, (n) => BigInt(n)), [1, ids.length])
      else if (name === 'encoder_hidden_states') feeds[name] = hidden
      else throw new Error(`unexpected decoder input ${name}`)
    }
    const out = await m.decoder.run(feeds)
    const logits = out.logits
    const vocab = logits.dims[2]
    const data = logits.data as Float32Array
    const last = (ids.length - 1) * vocab
    let best = 0
    for (let i = 1; i < vocab; i++) if (data[last + i] > data[last + best]) best = i
    for (const t of Object.values(out)) if (t !== logits) t.dispose()
    logits.dispose()
    if (best === END) break
    ids.push(best)
  }
  hidden.dispose()
  return decodeTokens(ids, m.tokens)
}

self.onmessage = async (e: MessageEvent<Message>) => {
  const msg = e.data
  try {
    if (msg.type === 'init') {
      ready ??= load(msg.base, msg.ortBase)
      await ready
      self.postMessage({ type: 'ready' })
      return
    }
    if (!ready) throw new Error('not started')
    const text = await transcribe(await ready, msg.samples)
    self.postMessage({ type: 'text', id: msg.id, text })
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.type === 'transcribe' ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) })
  }
}
