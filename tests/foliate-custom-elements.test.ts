import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"
import { guardFoliateCustomElementRegistration } from "../scripts/foliate-custom-elements"

const cases = [
  ["view.js", "foliate-view", "View"],
  ["fixed-layout.js", "foliate-fxl", "FixedLayout"],
  ["paginator.js", "foliate-paginator", "Paginator"],
] as const

describe("guardFoliateCustomElementRegistration", () => {
  it.each(cases)("makes %s registration idempotent", (file, tag, constructor) => {
    const source = `customElements.define('${tag}', ${constructor})`
    const result = guardFoliateCustomElementRegistration(source, `C:\\repo\\node_modules\\foliate-js\\${file}`)

    expect(result).toBe(`if (!customElements.get('${tag}')) ${source}`)

    const registry = new Map<string, unknown>()
    const customElements = {
      get: (name: string) => registry.get(name),
      define: (name: string, value: unknown) => {
        if (registry.has(name))
          throw new DOMException(`Custom element ${name} already exists`, "NotSupportedError")
        registry.set(name, value)
      },
    }
    const elementConstructor = class {}
    const context = {
      customElements,
      [constructor]: elementConstructor,
    }

    expect(() => {
      runInNewContext(result!, context)
      runInNewContext(result!, context)
    }).not.toThrow()
    expect(registry.get(tag)).toBe(elementConstructor)
  })

  it.each(cases)("transforms the pinned Foliate %s source", (file, tag) => {
    const id = resolve("node_modules", "foliate-js", file)
    const source = readFileSync(id, "utf8")
    const result = guardFoliateCustomElementRegistration(source, id)

    expect(result).toContain(`if (!customElements.get('${tag}'))`)
  })

  it("ignores files outside the Foliate dependency", () => {
    expect(guardFoliateCustomElementRegistration("const value = 1", "C:/repo/src/index.ts")).toBeNull()
  })

  it("fails when the pinned Foliate source no longer has the expected registration", () => {
    expect(() => guardFoliateCustomElementRegistration("export class View {}", "C:/repo/node_modules/foliate-js/view.js"))
      .toThrow("Expected one Foliate custom-element registration")
  })
})
