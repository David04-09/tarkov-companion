/** Map drawings fetched this session (switching maps, layers or floors used to download them again). */
const svgCache = new Map<string, Promise<string>>()

/** The text of a tarkov.dev map SVG, downloaded once per session and shared by the map and the assistant's routes. */
export function svgText(url: string, signal?: AbortSignal): Promise<string> {
  let p = svgCache.get(url)
  if (!p) {
    p = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.text()
    })
    p.catch(() => svgCache.delete(url))
    svgCache.set(url, p)
  }
  if (!signal) return p
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    p.then(resolve, reject)
  })
}
