/**
 * BERT uncased word pieces (as the paraphrase model was trained): lower case, accents off, split
 * at spaces and punctuation, then each word as the longest known pieces ("leddies" → "led",
 * "##die", "##s"), framed by [CLS] … [SEP]. Pure, so it is tested without the model.
 */
export function encodeWordPieces(text: string, vocab: Map<string, number>, maxLen = 64): number[] {
  const unk = vocab.get('[UNK]') ?? 100
  const cls = vocab.get('[CLS]') ?? 101
  const sep = vocab.get('[SEP]') ?? 102
  const clean = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  const tokens = clean.match(/[a-z0-9]+|[^\sa-z0-9]/g) ?? []
  const ids: number[] = [cls]
  for (const word of tokens) {
    if (word.length > 100) {
      ids.push(unk)
      continue
    }
    const pieces: number[] = []
    let start = 0
    let bad = false
    while (start < word.length) {
      let end = word.length
      let found: number | undefined
      while (start < end) {
        const piece = (start > 0 ? '##' : '') + word.slice(start, end)
        found = vocab.get(piece)
        if (found !== undefined) break
        end--
      }
      if (found === undefined) {
        bad = true
        break
      }
      pieces.push(found)
      start = end
    }
    ids.push(...(bad ? [unk] : pieces))
    if (ids.length >= maxLen - 1) break
  }
  ids.length = Math.min(ids.length, maxLen - 1)
  ids.push(sep)
  return ids
}
