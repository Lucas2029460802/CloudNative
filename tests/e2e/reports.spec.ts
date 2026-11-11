import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

// Own venue and a date a few weeks ahead (Shanghai time), so the report covers exactly
// the bookings made here and runs never collide with each other or with demo data.
const runId = Date.now().toString(36)
const venueName = `E2E Report ${runId}`
// One anchor for every date, so a run that crosses midnight keeps the same offsets.
const anchor = Date.now()
const dayAhead = (days: number) =>
  new Date(anchor + days * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Shanghai",
  })
const date = dayAhead(28)

test("reports a venue's reservations and booked time", async ({ page }) => {
  // On Kubernetes the report runs as a Job, which takes a while to start.
  test.setTimeout(120_000)

  const venue = await page.request.post("/api/venues", {
    data: {
      name: venueName,
      location: "Test Building, 1F",
      capacity: 10,
      openTime: "08:00",
      closeTime: "22:00",
    },
  })
  expect(venue.ok(), await venue.text()).toBeTruthy()
  const { id: venueId } = (await venue.json()) as { id: number }
  // 90 + 45 minutes.
  for (const [startTime, endTime] of [
    ["10:00", "11:30"],
    ["14:00", "14:45"],
  ]) {
    const booking = await page.request.post("/api/reservations", {
      data: {
        venueId,
        bookerName: `Reporter ${runId}`,
        attendeeCount: 4,
        purpose: "Report check",
        date,
        startTime,
        endTime,
      },
    })
    expect(booking.ok(), await booking.text()).toBeTruthy()
  }

  await page.goto("/reports")
  await page.getByLabel("From", { exact: true }).fill(date)
  await page.getByLabel("To", { exact: true }).fill(date)
  await page.getByRole("button", { name: "Generate report" }).click()

  // The new run is selected; its table appears once the run has succeeded.
  const row = page.getByRole("row", { name: new RegExp(venueName) })
  await expect(row).toBeVisible({ timeout: 90_000 })
  await expect(row.getByRole("cell")).toHaveText(["2", "2 h 15 min"])
  await expect(page.getByRole("button", { pressed: true })).toContainText(
    "Succeeded"
  )

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`)
  ).toEqual([])
})

test("rejects an invalid date range before requesting a report", async ({
  page,
}) => {
  const message =
    "Choose an end date on or after the start date; a report covers at most 366 days."
  const posts: string[] = []
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url())
  })
  await page.goto("/reports")
  await page.getByLabel("From", { exact: true }).fill(date)

  await page.getByLabel("To", { exact: true }).fill(dayAhead(27))
  await page.getByRole("button", { name: "Generate report" }).click()
  await expect(page.getByText(message)).toBeVisible()
  await expect(page.getByLabel("To", { exact: true })).toBeFocused()
  expect(posts).toEqual([])

  await page.getByLabel("To", { exact: true }).fill(dayAhead(28 + 366))
  await expect(page.getByText(message)).toBeVisible()

  await page.getByLabel("To", { exact: true }).fill(dayAhead(28 + 365))
  await expect(page.getByText(message)).toBeHidden()
  expect(posts).toEqual([])
})
