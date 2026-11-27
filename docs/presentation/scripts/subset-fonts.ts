// Writes assets/fonts-subset/*.css: the fontsource faces cut down to the
// characters the deck uses, so the single-file build stays small.
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
// @ts-expect-error subset-font ships no types
import subsetFont from "subset-font"

const root = fileURLToPath(new URL("..", import.meta.url))
const outDir = join(root, "assets/fonts-subset")
const FACES = ["noto-sans-sc/400", "noto-sans-sc/700", "jetbrains-mono/400"]

const sources = [
  "slides.md",
  "global-top.vue",
  ...new Bun.Glob("{components,layouts}/*.vue").scanSync({ cwd: root }),
]
const used = new Set<number>()
for (let cp = 0x20; cp <= 0x7e; cp++) used.add(cp)
for (const file of sources) {
  for (const ch of await readFile(join(root, file), "utf8"))
    used.add(ch.codePointAt(0)!)
}

function inRange(range: string, cp: number) {
  return range.split(",").some((part) => {
    const [lo, hi = lo] = part.trim().replace("U+", "").split("-")
    return cp >= Number.parseInt(lo, 16) && cp <= Number.parseInt(hi, 16)
  })
}

await mkdir(outDir, { recursive: true })
for (const face of FACES) {
  const cssPath = join(root, "node_modules/@fontsource", `${face}.css`)
  const css = await readFile(cssPath, "utf8")
  const name = face.replace("/", "-")
  let out = ""
  let index = 0
  for (const [block] of css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
    const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1] ?? "U+0-10FFFF"
    const chars = [...used].filter((cp) => inRange(range, cp))
    if (chars.length === 0) continue
    const woff2 = /url\(([^)]+\.woff2)\)/.exec(block)![1]
    const font = await readFile(join(dirname(cssPath), woff2))
    const subset: Buffer = await subsetFont(
      font,
      String.fromCodePoint(...chars),
      {
        targetFormat: "woff2",
      }
    )
    const file = `${name}-${index++}.woff2`
    await writeFile(join(outDir, file), subset)
    out +=
      block.replace(/src:[^;]+;/, `src: url(./${file}) format('woff2');`) + "\n"
  }
  await writeFile(join(outDir, `${name}.css`), out)
  console.log(`${name}: ${index} faces`)
}
