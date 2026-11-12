// Renders a Mermaid file to PNG with the repository's Playwright Chromium.
// Usage (from the repo root): node docs/report-assets/lab2/render-diagram.mjs <in.mmd> <out.png>
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const { chromium } = createRequire(`${process.cwd()}/`)("@playwright/test")
const [input, output] = process.argv.slice(2)
const source = readFileSync(input, "utf8")

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2 })
// Source Sans 3 has no CJK glyphs, so Chinese text falls back to Noto Sans SC.
// Single quotes: Mermaid copies this into double-quoted style attributes.
const font = "'Source Sans 3', 'Noto Sans SC', sans-serif"
await page.setContent(`<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&family=Noto+Sans+SC:wght@400;500&display=block">
<style>body { margin: 0; background: #fff; font-family: ${font} }</style>
<body>
<span style="position:absolute;opacity:0">Service 场地</span>
<pre class="mermaid"></pre>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs"
  document.querySelector(".mermaid").textContent = ${JSON.stringify(source)}
  // Initialise first: with startOnLoad left on, Mermaid renders on page load with default fonts.
  mermaid.initialize({ startOnLoad: false, theme: "neutral", fontFamily: ${JSON.stringify(font)}, flowchart: { wrappingWidth: 320 } })
  // Wait for both fonts before Mermaid measures label widths.
  await document.fonts.ready
  await mermaid.run()
  document.body.dataset.done = "1"
</script>`)
await page.waitForSelector("body[data-done] svg", { timeout: 30_000 })
await page.locator(".mermaid svg").screenshot({ path: output })
await browser.close()
