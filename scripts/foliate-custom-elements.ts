import type { Plugin } from "vite"

const definitions = [
  {
    file: "view.js",
    tag: "foliate-view",
    constructor: "View",
  },
  {
    file: "fixed-layout.js",
    tag: "foliate-fxl",
    constructor: "FixedLayout",
  },
  {
    file: "paginator.js",
    tag: "foliate-paginator",
    constructor: "Paginator",
  },
] as const

export function guardFoliateCustomElementRegistration(code: string, id: string) {
  const normalizedId = id.replace(/\\/g, "/").split("?")[0]
  if (!normalizedId.includes("/foliate-js/"))
    return null

  const definition = definitions.find(({ file }) => normalizedId.endsWith(`/${file}`))
  if (!definition)
    return null

  const original = `customElements.define('${definition.tag}', ${definition.constructor})`
  const occurrences = code.split(original).length - 1
  if (occurrences !== 1) {
    throw new Error(`Expected one Foliate custom-element registration in ${id}, found ${occurrences}: ${original}`)
  }

  const guarded = `if (!customElements.get('${definition.tag}')) ${original}`
  return code.replace(original, guarded)
}

export function foliateCustomElementsGuard(): Plugin {
  return {
    name: "foliate-custom-elements-guard",
    enforce: "pre",
    transform(code, id) {
      const transformed = guardFoliateCustomElementRegistration(code, id)
      return transformed === null ? null : { code: transformed, map: null }
    },
  }
}
