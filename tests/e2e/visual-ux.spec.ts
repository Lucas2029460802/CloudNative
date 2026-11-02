/// <reference lib="dom" />

import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

import { installMockApi, mockDate, mockVenue } from "./helpers/ux-api"

for (const width of [375, 768, 1440]) {
  for (const language of ["en", "zh-CN"]) {
    for (const theme of ["light", "dark"]) {
      test(`responsive pages ${width}px ${language} ${theme}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 900 })
        await page.addInitScript(
          ({ language: savedLanguage, theme: savedTheme }) => {
            localStorage.setItem("language", savedLanguage)
            localStorage.setItem("theme", savedTheme)
          },
          { language, theme }
        )
        const store = await installMockApi(page)
        store.venues.push(
          {
            ...mockVenue,
            id: 3,
            name: "Seminar Room 305",
            location: "Teaching Building B, 3F",
            capacity: 8,
          },
          {
            ...mockVenue,
            id: 4,
            name: "Aurora Lecture Hall",
            location: "Teaching Building A, 1F",
            capacity: 180,
          }
        )
        const errors: string[] = []
        page.on("pageerror", (error) => errors.push(error.message))
        for (const [name, url] of [
          ["home", `/?date=${mockDate}`],
          ["booking", `/venues/1?date=${mockDate}&start=08%3A00&end=09%3A00`],
          ["records", "/reservations"],
        ]) {
          await page.goto(url!)
          if (name === "home")
            await expect(
              page
                .getByText(
                  language === "en" ? "Next available" : "下一段可用时间",
                  { exact: true }
                )
                .first()
            ).toBeVisible()
          if (name === "booking")
            await expect(
              page.getByRole("combobox", {
                name: language === "en" ? "Start" : "开始",
                exact: true,
              })
            ).toContainText("08:00")
          if (name === "records")
            await expect(
              page.getByText("Mock booker", { exact: false })
            ).toBeVisible()
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth
            ),
            `${name} overflows at ${width}px`
          ).toBe(true)
          await page.screenshot({
            path: testInfo.outputPath(`${name}.png`),
            fullPage: true,
          })
          if (
            (width === 375 && language === "en" && theme === "light") ||
            (width === 1440 && language === "zh-CN" && theme === "dark")
          ) {
            const results = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
              .analyze()
            expect(
              results.violations
                .filter(
                  (item) =>
                    item.impact === "serious" || item.impact === "critical"
                )
                .map((item) => `${item.id}: ${item.help}`)
            ).toEqual([])
          }
        }
        expect(errors).toEqual([])
      })
    }
  }
}
