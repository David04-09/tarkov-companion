/// <reference lib="webworker" />
/**
 * The natural voice: Kitten TTS micro 0.8 (Apache-2.0) on onnxruntime-web, in this worker so the
 * page stays responsive. Same steps as Kitten's reference code (kittentts_legacy/onnx_model.py):
 * espeak phonemes (en-us, with stress, punctuation kept) -> words and punctuation joined by spaces
 * -> symbol ids, framed as [0, ...ids, 10, 0] -> model with the voice's style row and the speed
 * -> 24 kHz audio minus the last 5000 samples. Files come from the 'tts' content pack.
 * Runs only while speaking; the page ends this worker after a few idle minutes.
 */
import * as ort from 'onnxruntime-web/wasm'
import { phonemize } from 'phonemizer'
import { kittenIds, splitForSpeech } from './kittenText'

interface VoiceIndex {
  aliases: Record<string, string>
  voices: Record<string, { offset: number; rows: number; cols: number }>
}

let ready: Promise<{ session: ort.InferenceSession; index: VoiceIndex; styles: ArrayBuffer }> | null = null

type Message = { type: 'init'; base: string } | { type: 'speak'; id: number; text: string; voice: string; speed: number }

async function load(base: string) {
  ort.env.wasm.wasmPaths = { wasm: `${base}ort/ort-wasm-simd-threaded.wasm` }
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  const [session, index, styles] = await Promise.all([
    ort.InferenceSession.create(`${base}kitten/model.onnx`, { executionProviders: ['wasm'] }),
    fetch(`${base}kitten/voices.json`).then((r) => r.json() as Promise<VoiceIndex>),
    fetch(`${base}kitten/voices.bin`).then((r) => r.arrayBuffer()),
  ])
  return { session, index, styles }
}

/** Phonemes like Kitten's phonemizer backend (preserve_punctuation): punctuation stays where it was. */
async function phonemes(text: string): Promise<string> {
  const parts: string[] = []
  for (const part of splitForSpeech(text)) {
    if (part.punct) parts.push(part.text)
    else parts.push((await phonemize(part.text, 'en-us')).join(' '))
  }
  return parts.join(' ')
}

/**
 * Kitten leaves ~0.4 s of silence before and ~0.3 s after every sentence, which made answers drag.
 * Keep a short natural pause instead (sentences are generated and played one after another).
 */
function trimSilence(s: Float32Array): Float32Array {
  const quiet = 0.01
  let a = 0
  while (a < s.length && Math.abs(s[a]) < quiet) a++
  let b = s.length - 1
  while (b > a && Math.abs(s[b]) < quiet) b--
  if (a >= b) return s
  return s.slice(Math.max(0, a - 0.03 * 24000), Math.min(s.length, b + 1 + 0.12 * 24000))
}

self.onmessage = async (e: MessageEvent<Message>) => {
  const m = e.data
  try {
    if (m.type === 'init') {
      ready ??= load(m.base)
      await ready
      self.postMessage({ type: 'ready' })
      return
    }
    if (!ready) throw new Error('not started')
    const { session, index, styles } = await ready
    const name = index.aliases[m.voice] ?? m.voice
    const v = index.voices[name]
    if (!v) throw new Error(`no voice ${m.voice}`)
    const ids = kittenIds(await phonemes(m.text))
    const row = Math.min(m.text.length, v.rows - 1)
    const style = new Float32Array(styles, v.offset + row * v.cols * 4, v.cols)
    const out = await session.run({
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, (n) => BigInt(n)), [1, ids.length]),
      style: new ort.Tensor('float32', style.slice(), [1, v.cols]),
      speed: new ort.Tensor('float32', new Float32Array([m.speed]), [1]),
    })
    const audio = out[session.outputNames[0]].data as Float32Array
    const samples = trimSilence(audio.slice(0, Math.max(0, audio.length - 5000)))
    self.postMessage({ type: 'audio', id: m.id, samples, rate: 24000 }, [samples.buffer])
  } catch (err) {
    self.postMessage({ type: 'error', id: m.type === 'speak' ? m.id : undefined, message: err instanceof Error ? err.message : String(err) })
  }
}
