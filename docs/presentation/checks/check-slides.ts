import path from "node:path"
import { AxeBuilder } from "@axe-core/playwright"
import { parse } from "@slidev/parser"
import { blend, parse as parseColor, wcagContrast } from "culori"
import { chromium, type Page } from "playwright-chromium"

type Finding = {
  slide: number
  rule: string
  detail: string
}

// The DOM rules run in the page, where the UMD build sets window.culori.
type PageWindow = Window & { culori: typeof import("culori") }

type ContrastNodeInput = {
  selector: string | null
  html: string
  summary: string
}

type ContrastNodeInspection = {
  active: boolean
  allowed: boolean
  summary: string
  snippet: string
  fg: string | null
  fontSize: number
  fontWeight: number
}

const BASE_URL = (Bun.argv[2] ?? "http://localhost:3030").replace(/\/+$/, "")
const PAPER = "#f3f2ee"
const CULORI_UMD = path.join(
  path.dirname(Bun.resolveSync("culori/package.json", import.meta.dir)),
  "bundled/culori.umd.js"
)

function truncate(text: string, maxLen: number): string {
  const singleLine = text.replace(/\s+/g, " ").trim()
  if (singleLine.length <= maxLen) return singleLine
  return `${singleLine.slice(0, maxLen - 1)}…`
}

function checkStaticVmark(slides: { content: string }[]): Finding[] {
  const findings: Finding[] = []

  for (let i = 0; i < slides.length; i += 1) {
    const body = slides[i]?.content ?? ""
    const matches = body.match(/\bv-mark\b/g)
    const count = matches ? matches.length : 0
    if (count > 2) {
      findings.push({
        slide: i + 1,
        rule: "t8-vmark",
        detail: `${count} v-mark occurrences (max 2)`,
      })
    }
  }

  return findings
}

function firstSelector(target: readonly unknown[]): string | null {
  const first = target[0]
  if (typeof first === "string") return first
  if (Array.isArray(first)) {
    const last = first[first.length - 1]
    return typeof last === "string" ? last : null
  }
  return null
}

async function checkDomRules(page: Page, slide: number): Promise<Finding[]> {
  return page.evaluate((slideNumber: number) => {
    const root =
      document.querySelector("#slide-content") ??
      document.querySelector(".slidev-page")
    if (!root) {
      return [
        {
          slide: slideNumber,
          rule: "slide-root",
          detail: "missing #slide-content or .slidev-page",
        },
      ]
    }

    const ignoredTags = new Set([
      "STYLE",
      "SCRIPT",
      "NOSCRIPT",
      "TEMPLATE",
      "TITLE",
      "DESC",
      "METADATA",
      "SOURCE",
      "TRACK",
    ])

    const charExcludedSelector = [
      "h1",
      "h2",
      "table",
      "pre",
      "code",
      "figcaption",
      ".caption",
      ".slidev-vclick-hidden",
      "[data-check-skip]",
    ].join(", ")

    // el or an ancestor inside the slide matches the selector.
    const withinSlide = (el: Element, selector: string): boolean => {
      const match = el.closest(selector)
      return match !== null && root.contains(match)
    }

    const isRuleAllowed = (el: Element, ruleId: string): boolean =>
      withinSlide(el, `[data-check-allow~="${ruleId}"]`)

    const isVisible = (el: Element): boolean => {
      if (
        !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      ) {
        return false
      }
      for (let cur: Element | null = el; cur; cur = cur.parentElement) {
        if (ignoredTags.has(cur.tagName)) return false
      }
      return !withinSlide(el, "[data-check-skip]")
    }

    const hasDirectText = (el: Element): boolean => {
      if (ignoredTags.has(el.tagName)) return false
      for (const child of Array.from(el.childNodes)) {
        if (
          child.nodeType === Node.TEXT_NODE &&
          /\S/.test(child.nodeValue ?? "")
        ) {
          return true
        }
      }
      return false
    }

    const parseFontWeight = (value: string): number => {
      if (value === "normal") return 400
      if (value === "bold") return 700
      return Number.parseFloat(value)
    }

    const { formatHex, rgb } = (window as unknown as PageWindow).culori

    const describeEl = (el: Element): string => {
      const tag = el.tagName.toLowerCase()
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim()
      return text ? `${tag} "${text.slice(0, 40)}"` : tag
    }

    const findings: Array<{ slide: number; rule: string; detail: string }> = []
    const record = (rule: string, detail: string) => {
      findings.push({ slide: slideNumber, rule, detail })
    }

    const allElements = Array.from(root.querySelectorAll("*"))
    const visibleElements = allElements.filter((el) => isVisible(el))

    // rule1-oneline
    for (const el of visibleElements) {
      if (el.tagName !== "H1" && el.tagName !== "H2") continue
      if (isRuleAllowed(el, "rule1-oneline")) continue
      const range = document.createRange()
      range.selectNodeContents(el)
      const rects = Array.from(range.getClientRects())
        .filter((r) => r.width > 0 && r.height > 0)
        .toSorted((a, b) => a.top - b.top)
      const lineTops: number[] = []
      for (const rect of rects) {
        const prev = lineTops[lineTops.length - 1]
        if (prev === undefined || Math.abs(rect.top - prev) >= 4) {
          lineTops.push(rect.top)
        }
      }
      if (lineTops.length !== 1) {
        record(
          "rule1-oneline",
          `${describeEl(el)} renders as ${lineTops.length} lines`
        )
      }
    }

    // rule1-orphan
    for (const el of visibleElements) {
      const isTarget =
        el.matches("p, li, figcaption, td, th, h3") ||
        el.classList.contains("callout")
      if (!isTarget || isRuleAllowed(el, "rule1-orphan")) continue

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const lines: Array<{ top: number; text: string }> = []
      let currentNode = walker.nextNode()
      while (currentNode) {
        const parent = currentNode.parentElement
        if (parent && isVisible(parent)) {
          const textValue = currentNode.nodeValue ?? ""
          const range = document.createRange()
          let offset = 0
          for (const ch of textValue) {
            const nextOffset = offset + ch.length
            range.setStart(currentNode, offset)
            range.setEnd(currentNode, nextOffset)
            const rect = range.getClientRects()[0]
            if (rect && rect.width > 0 && rect.height > 0) {
              const matchLine = lines.find(
                (line) => Math.abs(line.top - rect.top) < 4
              )
              if (matchLine) {
                matchLine.text += ch
              } else {
                lines.push({ top: rect.top, text: ch })
              }
            }
            offset = nextOffset
          }
        }
        currentNode = walker.nextNode()
      }

      const nonEmptyLines = lines
        .filter((line) => /\S/.test(line.text))
        .toSorted((a, b) => a.top - b.top)
      if (nonEmptyLines.length > 1) {
        const lastLine = nonEmptyLines[nonEmptyLines.length - 1]
        if (lastLine) {
          const nonWsLen = Array.from(lastLine.text.replace(/\s+/g, "")).length
          if (nonWsLen <= 2) {
            record("rule1-orphan", lastLine.text.trim())
          }
        }
      }
    }

    // rule3-lines
    for (const el of visibleElements) {
      if (isRuleAllowed(el, "rule3-lines")) continue
      if (el.tagName === "HR") {
        record("rule3-lines", "hr element is forbidden")
        continue
      }
      const style = getComputedStyle(el)
      const isFrameOrImg =
        el.tagName === "IMG" || el.classList.contains("frame")
      const sides = [
        {
          name: "border-left",
          width: Number.parseFloat(style.borderLeftWidth),
          borderStyle: style.borderLeftStyle,
          color: style.borderLeftColor,
        },
        {
          name: "border-top",
          width: Number.parseFloat(style.borderTopWidth),
          borderStyle: style.borderTopStyle,
          color: style.borderTopColor,
        },
      ]
      for (const side of sides) {
        if (
          !Number.isFinite(side.width) ||
          side.borderStyle === "none" ||
          side.width <= 1
        ) {
          continue
        }
        const color = rgb(side.color)
        const alpha = color?.alpha ?? 1
        if (color && alpha <= 0.001) continue
        const isInk =
          color !== undefined &&
          formatHex(color) === "#1d1b18" &&
          alpha >= 0.999
        // Only img and .frame may use a 2px ink border; > 1px fails elsewhere.
        if (isFrameOrImg && isInk && side.width <= 2) continue
        record(
          "rule3-lines",
          `${describeEl(el)} ${side.name} ${side.width}px ${side.color}`
        )
      }
    }

    // rule4-radius
    for (const el of visibleElements) {
      if (isRuleAllowed(el, "rule4-radius")) continue
      if (withinSlide(el, "[data-allow-radius]")) continue
      const style = getComputedStyle(el)
      const radii = [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ]
      const hasRadius = radii.some((r) =>
        r.split(/\s+/).some((part) => {
          const val = Number.parseFloat(part)
          return Number.isFinite(val) && val !== 0
        })
      )
      if (hasRadius) {
        record("rule4-radius", `${describeEl(el)} radius ${radii.join(" ")}`)
      }
    }

    // rule6-cover
    if (slideNumber === 1) {
      const h1 = visibleElements.find((el) => el.tagName === "H1")
      if (!h1) {
        if (!isRuleAllowed(root, "rule6-cover")) {
          record("rule6-cover", "slide 1 has no visible h1")
        }
      } else if (!isRuleAllowed(h1, "rule6-cover")) {
        const h1Size = Number.parseFloat(getComputedStyle(h1).fontSize)
        if (Number.isFinite(h1Size)) {
          const largeEls = visibleElements.filter((el) => {
            if (isRuleAllowed(el, "rule6-cover") || !hasDirectText(el)) {
              return false
            }
            const size = Number.parseFloat(getComputedStyle(el).fontSize)
            return Number.isFinite(size) && size >= h1Size
          })
          if (largeEls.length !== 1) {
            record(
              "rule6-cover",
              `expected 1 element >= ${h1Size}px, found ${largeEls.length}`
            )
          }
        }
      }
    }

    // rule8-chars
    {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let charCount = 0
      let node = walker.nextNode()
      while (node) {
        const parent = node.parentElement
        if (parent && isVisible(parent) && !ignoredTags.has(parent.tagName)) {
          const excluded = withinSlide(parent, charExcludedSelector)
          if (!excluded && !isRuleAllowed(parent, "rule8-chars")) {
            const nonWs = (node.nodeValue ?? "").replace(/\s+/g, "")
            charCount += Array.from(nonWs).length
          }
        }
        node = walker.nextNode()
      }
      if (charCount > 60) {
        record("rule8-chars", `${charCount} visible chars (max 60)`)
      }

      for (const el of visibleElements) {
        if (el.tagName !== "TABLE" || isRuleAllowed(el, "rule8-chars")) continue
        const table = el as HTMLTableElement
        let bodyRows = 0
        if (table.tBodies.length > 0) {
          for (const tbody of Array.from(table.tBodies)) {
            bodyRows += Array.from(tbody.rows).filter((tr) =>
              isVisible(tr)
            ).length
          }
        } else {
          const visibleRows = Array.from(table.rows).filter((tr) =>
            isVisible(tr)
          ).length
          bodyRows = Math.max(0, visibleRows - 1)
        }
        if (bodyRows > 6) {
          record("rule8-chars", `table has ${bodyRows} body rows (max 6)`)
        }
      }
    }

    // rule9-center
    for (const el of visibleElements) {
      if (el.tagName !== "P" && el.tagName !== "LI") continue
      if (isRuleAllowed(el, "rule9-center")) continue
      if (el.closest(".cover, .divider") !== null) continue
      const align = getComputedStyle(el).textAlign
      if (align === "center" || align === "-webkit-center") {
        record("rule9-center", `${describeEl(el)} text-align is ${align}`)
      }
    }

    // t1-minfont
    for (const el of visibleElements) {
      if (!hasDirectText(el) || isRuleAllowed(el, "t1-minfont")) continue
      const fontSize = Number.parseFloat(getComputedStyle(el).fontSize)
      if (!Number.isFinite(fontSize)) continue
      if (fontSize < 16) {
        record("t1-minfont", `${describeEl(el)} font-size ${fontSize}px < 16px`)
      }
    }

    const rootRect = root.getBoundingClientRect()
    const scale = rootRect.width / 980
    if (Number.isFinite(scale) && scale > 0) {
      // t2-margins
      for (const el of visibleElements) {
        if (isRuleAllowed(el, "t2-margins")) continue
        if (withinSlide(el, "[data-full-bleed]")) continue
        const isTopSvg =
          el.tagName.toLowerCase() === "svg" &&
          el.parentElement?.closest("svg") === null
        const isMedia = el.tagName === "IMG" || el.tagName === "VIDEO"
        if (!isMedia && !isTopSvg && !hasDirectText(el)) continue

        const rect = el.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue
        const left = (rect.left - rootRect.left) / scale
        const right = (rect.right - rootRect.left) / scale
        const top = (rect.top - rootRect.top) / scale
        const bottom = (rect.bottom - rootRect.top) / scale
        if (
          !Number.isFinite(left) ||
          !Number.isFinite(right) ||
          !Number.isFinite(top) ||
          !Number.isFinite(bottom)
        ) {
          continue
        }
        if (left < 58 || right > 922 || top < 42 || bottom > 510) {
          const coords = [
            Math.round(left),
            Math.round(top),
            Math.round(right),
            Math.round(bottom),
          ]
          const box = `${coords[0]},${coords[1]}..${coords[2]},${coords[3]}`
          record("t2-margins", `${describeEl(el)} box (${box}) outside margins`)
        }
      }

      // t3-measure
      for (const el of visibleElements) {
        if (el.tagName !== "P" && el.tagName !== "LI") continue
        if (isRuleAllowed(el, "t3-measure")) continue
        const fontSize = Number.parseFloat(getComputedStyle(el).fontSize)
        if (!Number.isFinite(fontSize) || fontSize <= 0) continue

        const range = document.createRange()
        range.selectNodeContents(el)
        const rects = Array.from(range.getClientRects())
          .filter((r) => r.width > 0 && r.height > 0)
          .map((r) => ({
            left: (r.left - rootRect.left) / scale,
            right: (r.right - rootRect.left) / scale,
            top: (r.top - rootRect.top) / scale,
          }))
          .filter(
            (r) =>
              Number.isFinite(r.left) &&
              Number.isFinite(r.right) &&
              Number.isFinite(r.top)
          )
          .toSorted((a, b) => a.top - b.top)

        const lines: Array<{ top: number; left: number; right: number }> = []
        for (const rect of rects) {
          const matchLine = lines.find(
            (line) => Math.abs(line.top - rect.top) < 4
          )
          if (matchLine) {
            matchLine.left = Math.min(matchLine.left, rect.left)
            matchLine.right = Math.max(matchLine.right, rect.right)
          } else {
            lines.push({ top: rect.top, left: rect.left, right: rect.right })
          }
        }

        let width = 0
        for (const line of lines) {
          width = Math.max(width, line.right - line.left)
        }
        if (!Number.isFinite(width)) continue
        const maxWidth = 30 * fontSize + 2
        if (width > maxWidth) {
          const w = Math.round(width)
          const max = Math.round(maxWidth)
          record("t3-measure", `${describeEl(el)} width ${w}px > ${max}px`)
        }
      }
    }

    // t5-weight
    for (const el of visibleElements) {
      if (!hasDirectText(el) || isRuleAllowed(el, "t5-weight")) continue
      const weight = parseFontWeight(getComputedStyle(el).fontWeight)
      if (Number.isFinite(weight) && weight < 400) {
        record("t5-weight", `${describeEl(el)} font-weight ${weight} < 400`)
      }
    }

    // t13-code
    for (const el of visibleElements) {
      if (el.tagName !== "PRE" || isRuleAllowed(el, "t13-code")) continue
      if (
        Number.isFinite(el.scrollWidth) &&
        Number.isFinite(el.clientWidth) &&
        el.scrollWidth > el.clientWidth + 1
      ) {
        const sw = el.scrollWidth
        const cw = el.clientWidth
        record("t13-code", `pre overflows: scrollWidth ${sw} > ${cw}`)
      }
      const code = el.querySelector("code")
      if (code && isVisible(code) && !isRuleAllowed(code, "t13-code")) {
        const codeSize = Number.parseFloat(getComputedStyle(code).fontSize)
        if (Number.isFinite(codeSize) && codeSize < 16) {
          record("t13-code", `pre code font-size ${codeSize}px < 16px`)
        }
      }
    }

    return findings
  }, slide)
}

async function inspectContrastNodes(
  page: Page,
  inputs: ContrastNodeInput[]
): Promise<ContrastNodeInspection[]> {
  return page.evaluate((nodes: ContrastNodeInput[]) => {
    const root =
      document.querySelector("#slide-content") ??
      document.querySelector(".slidev-page")

    // el or an ancestor inside the slide matches the selector.
    const withinSlide = (el: Element, selector: string): boolean => {
      const match = el.closest(selector)
      return match !== null && root !== null && root.contains(match)
    }

    const isRuleAllowed = (el: Element): boolean =>
      withinSlide(el, '[data-check-allow~="rule2-contrast"]')

    const ignoredTags = new Set([
      "STYLE",
      "SCRIPT",
      "NOSCRIPT",
      "TEMPLATE",
      "TITLE",
      "DESC",
      "METADATA",
      "SOURCE",
      "TRACK",
    ])

    const isActive = (el: Element): boolean => {
      if (
        !root ||
        !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      ) {
        return false
      }
      for (let cur: Element | null = el; cur; cur = cur.parentElement) {
        if (ignoredTags.has(cur.tagName)) return false
      }
      return !withinSlide(el, "[data-check-skip]")
    }

    const parseFontWeight = (value: string): number => {
      if (value === "normal") return 400
      if (value === "bold") return 700
      return Number.parseFloat(value)
    }

    return nodes.map((node) => {
      const el = node.selector ? document.querySelector(node.selector) : null
      if (!el) {
        return {
          active: true,
          allowed: false,
          summary: node.summary || node.html,
          snippet: node.html.slice(0, 40),
          fg: null,
          fontSize: 16,
          fontWeight: 400,
        }
      }
      const style = getComputedStyle(el)
      const tag = el.tagName.toLowerCase()
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim()
      const snippet = text ? `${tag} "${text.slice(0, 40)}"` : tag
      const parsedFontSize = Number.parseFloat(style.fontSize)
      const parsedFontWeight = parseFontWeight(style.fontWeight)
      return {
        active: isActive(el),
        allowed: isRuleAllowed(el),
        summary: node.summary || node.html,
        snippet,
        fg: style.color,
        fontSize: Number.isFinite(parsedFontSize) ? parsedFontSize : 16,
        fontWeight: Number.isFinite(parsedFontWeight) ? parsedFontWeight : 400,
      }
    })
  }, inputs)
}

async function checkContrast(
  page: Page,
  slide: number
): Promise<{ violations: Finding[]; info: Finding[] }> {
  const hasSlideContent = await page.evaluate(() =>
    Boolean(document.querySelector("#slide-content"))
  )
  const includeSelector = hasSlideContent ? "#slide-content" : ".slidev-page"
  const results = await new AxeBuilder({ page })
    .withRules(["color-contrast"])
    .include(includeSelector)
    .analyze()

  const violationInputs: ContrastNodeInput[] = []
  for (const res of results.violations) {
    for (const node of res.nodes) {
      violationInputs.push({
        selector: firstSelector(node.target),
        html: node.html,
        summary: node.failureSummary ?? node.any[0]?.message ?? node.html,
      })
    }
  }

  const incompleteInputs: ContrastNodeInput[] = []
  for (const res of results.incomplete) {
    for (const node of res.nodes) {
      incompleteInputs.push({
        selector: firstSelector(node.target),
        html: node.html,
        summary: node.failureSummary ?? node.any[0]?.message ?? node.html,
      })
    }
  }

  const violations: Finding[] = []
  const info: Finding[] = []

  if (violationInputs.length > 0) {
    const inspected = await inspectContrastNodes(page, violationInputs)
    for (const item of inspected) {
      if (!item.active || item.allowed) continue
      violations.push({
        slide,
        rule: "rule2-contrast",
        detail: `${item.snippet}: ${item.summary}`,
      })
    }
  }

  if (incompleteInputs.length > 0) {
    const inspected = await inspectContrastNodes(page, incompleteInputs)
    for (const item of inspected) {
      if (!item.active || item.allowed) continue
      const fg = item.fg ? parseColor(item.fg) : undefined
      if (!fg) {
        violations.push({
          slide,
          rule: "rule2-contrast",
          detail: `${item.snippet}: unable to resolve color`,
        })
        continue
      }
      const ratio = wcagContrast(blend([PAPER, fg]), PAPER)
      if (!Number.isFinite(ratio)) continue
      const isLarge =
        item.fontSize >= 24 ||
        (item.fontWeight >= 700 && item.fontSize >= 18.66)
      const required = isLarge ? 3 : 4.5
      const ratioStr = ratio.toFixed(2)
      const detail = `${item.snippet} contrast ${ratioStr}:1 vs #f3f2ee (req ${required}:1)`
      if (ratio < required) {
        violations.push({ slide, rule: "rule2-contrast", detail })
      } else {
        info.push({ slide, rule: "rule2-contrast", detail })
      }
    }
  }

  return { violations, info }
}

const violations: Finding[] = []
const info: Finding[] = []

const slidesPath = path.join(import.meta.dir, "..", "slides.md")
// window.__slidev__ exists only on the dev server, so count the slides here.
const { slides } = await parse(await Bun.file(slidesPath).text(), slidesPath)
violations.push(...checkStaticVmark(slides))

const browser = await chromium.launch()
try {
  // axe-core needs a page from an explicit context.
  const page = await (
    await browser.newContext({
      viewport: { width: 980, height: 552 },
      deviceScaleFactor: 1,
    })
  ).newPage()
  await page.addInitScript({ path: CULORI_UMD })

  for (let slide = 1; slide <= slides.length; slide += 1) {
    await page.goto(`${BASE_URL}/#/${slide}?clicks=99`, { waitUntil: "load" })
    await page.waitForFunction(() =>
      Boolean(
        document.querySelector("#slide-content") ??
        document.querySelector(".slidev-page")
      )
    )
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await page.waitForTimeout(600)
    // Magic-move tokens fade in and out; measure them only once they settle.
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every(
          (a) =>
            a.playState !== "running" ||
            a.effect?.getTiming().iterations === Infinity
        )
    )

    const domViolations = await checkDomRules(page, slide)
    violations.push(...domViolations)

    const contrast = await checkContrast(page, slide)
    violations.push(...contrast.violations)
    info.push(...contrast.info)
  }
} finally {
  await browser.close()
}

const sortedViolations = [...violations].toSorted((a, b) => a.slide - b.slide)
for (const v of sortedViolations) {
  console.log(`slide ${v.slide}  ${v.rule}  ${truncate(v.detail, 120)}`)
}
console.log(`${violations.length} violations, ${info.length} info`)

const reportPath = Bun.env.CHECK_REPORT
if (reportPath) {
  await Bun.write(
    reportPath,
    `${JSON.stringify({ violations: sortedViolations, info }, null, 2)}\n`
  )
}

if (violations.length > 0) {
  process.exitCode = 1
}
