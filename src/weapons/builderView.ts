/** Which Weapon builder view was used last (localStorage, per PC). */
export type BuilderView = 'modding' | 'list'

const VIEW_KEY = 'tc-weapon-builder-view'

export function readBuilderView(): BuilderView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'modding'
  } catch {
    return 'modding'
  }
}

export function writeBuilderView(view: BuilderView): void {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Storage blocked: the choice just is not remembered.
  }
}
