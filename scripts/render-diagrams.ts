// Renders the report diagrams (docs/report-assets/diagrams/*.mmd) to PNG files beside them.
// Usage: bun run diagrams. Mermaid and the fonts come from node_modules, so nothing is fetched
// from the network and the output depends only on the locked dependency versions.
import { readdir, readFile } from "node:fs/promises"
import { extname, join, resolve } from "node:path"

import { chromium } from "@playwright/test"

const root = resolve(import.meta.dirname, "..")
const folder = join(root, "docs/report-assets/diagrams")
// The page is served from a made-up origin; every request is answered from the repository.
const origin = "http://diagrams.local"

// Source Sans 3 has no CJK glyphs, so Chinese text falls back to Noto Sans SC.
// Single quotes: Mermaid copies the family into double-quoted style attributes.
const font = "'Source Sans 3', 'Noto Sans SC', sans-serif"
const config = {
  startOnLoad: false,
  theme: "base",
  fontFamily: font,
  themeVariables: {
    fontFamily: font,
    fontSize: "15px",
    primaryColor: "#f6f8fb",
    primaryBorderColor: "#64748b",
    primaryTextColor: "#1e293b",
    lineColor: "#64748b",
    clusterBkg: "#fbfcfe",
    clusterBorder: "#94a3b8",
    edgeLabelBackground: "#ffffff",
    tertiaryColor: "#ffffff",
    noteBkgColor: "#fffbea",
    noteBorderColor: "#d9b44a",
  },
  flowchart: { wrappingWidth: 320, curve: "basis", padding: 12 },
}

const page = `<!doctype html>
<meta charset="utf-8" />
<link rel="stylesheet" href="/node_modules/@fontsource/source-sans-3/400.css" />
<link rel="stylesheet" href="/node_modules/@fontsource/source-sans-3/600.css" />
<link rel="stylesheet" href="/node_modules/@fontsource/noto-sans-sc/400.css" />
<style>body { margin: 0; padding: 16px; background: #fff; font-family: ${font} }</style>
<span style="position: absolute; opacity: 0">Service 场地</span>
<pre class="mermaid"></pre>
<script type="module">
  import mermaid from "/node_modules/mermaid/dist/mermaid.esm.min.mjs"
  // Initialise before any await: with startOnLoad left on, Mermaid renders on page load
  // with its default font and then skips the diagram.
  mermaid.initialize(${JSON.stringify(config)})
  window.render = async (source) => {
    await document.fonts.ready // label widths are measured with the real fonts
    const node = document.querySelector(".mermaid")
    node.removeAttribute("data-processed")
    node.textContent = source
    await mermaid.run({ nodes: [node] })
  }
  document.body.dataset.ready = "1"
</script>`

const types: Record<string, string> = {
  ".css": "text/css",
  ".mjs": "text/javascript",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
}

const sources = (await readdir(folder)).filter((name) => name.endsWith(".mmd"))
const browser = await chromium.launch()
try {
  const tab = await browser.newPage({ deviceScaleFactor: 2 })
  await tab.route(`${origin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === "/")
      return route.fulfill({ contentType: "text/html", body: page })
    const file = join(root, decodeURIComponent(path))
    if (!file.startsWith(join(root, "node_modules"))) return route.abort()
    return route.fulfill({
      contentType: types[extname(file)] ?? "application/octet-stream",
      body: await readFile(file),
    })
  })
  tab.on("pageerror", (error) => console.error(error))
  await tab.goto(`${origin}/`)
  await tab.waitForSelector("body[data-ready]")

  for (const name of sources) {
    const source = await readFile(join(folder, name), "utf8")
    await tab.evaluate((text) => window.render(text), source)
    const output = join(folder, name.replace(/\.mmd$/, ".png"))
    await tab.locator(".mermaid svg").screenshot({ path: output })
    console.log(`rendered ${name}`)
  }
} finally {
  await browser.close()
}

declare global {
  interface Window {
    render(source: string): Promise<void>
  }
}
