// Page layout for md-to-pdf. Playwright adds this script to the page and calls
// layoutReport(options) once the page and its fonts have loaded, before printing.

const ZERO_WIDTH_SPACE = String.fromCodePoint(8203)
const SHORT_CELL = 6 // characters; shorter cells stay on one line

const isHeading = (el) => el !== null && /^H[1-6]$/.test(el.tagName)

/** Box each run of headings with the paragraph or figure after it; Chrome ignores
 * break-after: avoid across stacked headings. */
function keepHeadings() {
  const headings = document.querySelectorAll(
    ".stackedit__html > :is(h1, h2, h3, h4, h5, h6)"
  )
  for (const heading of headings) {
    if (isHeading(heading.previousElementSibling)) continue
    const run = [heading]
    while (isHeading(run.at(-1).nextElementSibling))
      run.push(run.at(-1).nextElementSibling)
    const next = run.at(-1).nextElementSibling
    if (next?.tagName === "P") run.push(next)
    const box = document.createElement("div")
    box.className = "keep"
    heading.before(box)
    box.append(...run)
  }
}

/** Keep short table cells, such as a name in a narrow column, on one line. */
function markShortCells() {
  for (const cell of document.querySelectorAll("td, th")) {
    if (cell.textContent.trim().length <= SHORT_CELL)
      cell.classList.add("short")
  }
}

/** Split a plain-text code block into one element per line for the hanging indent. */
function splitLines(code) {
  const lines = code.textContent.replace(/\n$/, "").split("\n")
  code.replaceChildren(
    ...lines.map((line) => {
      const span = document.createElement("span")
      span.className = "ln"
      span.textContent = line || ZERO_WIDTH_SPACE
      return span
    })
  )
}

/** Shrink each code block wider than the printed text so its longest line fits,
 * down to codeMinEm; lines that are still too long wrap. */
function fitCode({ textWidthMm, codeEm, codeMinEm }) {
  // Scripts run in screen layout, so measure against the printed text width.
  const probe = document.createElement("div")
  probe.style.width = `${textWidthMm}mm`
  document.querySelector(".stackedit__html").append(probe)
  const room = probe.getBoundingClientRect().width
  probe.remove()

  for (const pre of document.querySelectorAll("pre")) {
    const code = pre.querySelector("code") ?? pre
    if (code.children.length === 0) splitLines(code)
    code.style.whiteSpace = "pre"
    code.style.width = "max-content"
    const need = code.getBoundingClientRect().width
    code.style.removeProperty("white-space")
    code.style.removeProperty("width")
    if (need > room) {
      pre.style.fontSize = `${Math.max(codeMinEm, ((codeEm * room) / need) * 0.99)}em`
    }
  }
}

globalThis.layoutReport = async function layoutReport(options) {
  const root = document.documentElement.style
  root.setProperty("--zoom", String(options.zoom))
  root.setProperty("--image-max-height", `${options.imageMaxHeightMm}mm`)
  keepHeadings()
  markShortCells()
  await document.fonts.ready
  fitCode(options)
}
