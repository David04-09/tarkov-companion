/**
 * Map drawings come from tarkov.dev's CDN and are inserted into the live page (Leaflet needs
 * real SVG nodes to style floors). A tampered file must not be able to run script, so the tree
 * is rebuilt from an allow-list: drawing elements only, no event handlers, no foreign HTML,
 * links only to fragments inside the drawing or to inline images.
 */
const ALLOWED = new Set(
  [
    'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textPath',
    'defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'pattern', 'symbol', 'marker', 'use',
    'image', 'title', 'desc', 'style', 'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix',
    'feComposite', 'feFlood', 'feMerge', 'feMergeNode', 'feMorphology', 'feDropShadow',
  ].map((n) => n.toLowerCase()),
)

const LINK_ATTRS = new Set(['href', 'xlink:href'])

function safeLink(value: string): boolean {
  const v = value.trim().toLowerCase()
  return v.startsWith('#') || /^data:image\/(png|jpe?g|gif|webp);/.test(v)
}

/** Removes everything that is not plain drawing from `root` (in place). Returns how many nodes were dropped. */
export function sanitizeSvg(root: Element): number {
  let dropped = 0
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (!ALLOWED.has(child.localName.toLowerCase())) {
        child.remove()
        dropped++
        continue
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase()
        const value = attr.value
        const bad =
          name.startsWith('on') ||
          (LINK_ATTRS.has(name) && !safeLink(value)) ||
          /javascript:|vbscript:|data:text\/html/i.test(value) ||
          (name === 'style' && /url\(\s*['"]?(?!#|data:image\/)/i.test(value))
        if (bad) child.removeAttribute(attr.name)
      }
      // <style> may only hold CSS for the drawing: no imports or remote resources.
      if (child.localName.toLowerCase() === 'style' && /@import|url\(\s*['"]?(?!#|data:image\/)/i.test(child.textContent ?? '')) {
        child.remove()
        dropped++
        continue
      }
      walk(child)
    }
  }
  walk(root)
  return dropped
}
