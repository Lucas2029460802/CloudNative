import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

// Each run books on its own new venue, so runs never collide with each other or with
// demo data. The date is a few weeks ahead so every slot is in the future.
const runId = Date.now().toString(36)
const venueName = `E2E Studio ${runId}`
const bookingDate = (() => {
  const date = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000)
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })
})()

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical"
  )
  expect(
    serious.map((violation) => `${violation.id}: ${violation.help}`)
  ).toEqual([])
}

async function fillBookingDetails(page: Page, bookerName: string) {
  await page.getByLabel("Name or organization").fill(bookerName)
  await page.getByLabel("Number of attendees").fill("6")
  await page.getByLabel("Purpose").fill("Design review")
}

async function pickSlots(page: Page, first: string, last: string) {
  await page.getByRole("button", { name: `${first}, free` }).click()
  await page.getByRole("button", { name: `${last}, free` }).click()
}

test.describe.configure({ mode: "serial" })

let venueUrl = ""
let reservationUrl = ""

test("lists the demo venues on the booking board", async ({ page }) => {
  await page.goto("/")

  await expect(
    page.getByRole("heading", { name: "Book a venue", level: 1 })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Aurora Lecture Hall" })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Rooftop Garden" })
  ).toBeVisible()
  await expect(page.getByText("Not accepting bookings")).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test("adds a venue", async ({ page }) => {
  await page.goto("/venues/new")

  await page.getByRole("button", { name: "Add venue" }).click()
  await expect(
    page.getByText("Enter a venue name, up to 100 characters.")
  ).toBeVisible()

  await page.getByLabel("Venue name").fill(venueName)
  await page.getByLabel("Location").fill("Test Building, 1F")
  await page.getByLabel("Maximum capacity").fill("10")
  await page.getByRole("button", { name: "Add venue" }).click()

  await expect(
    page.getByRole("heading", { name: venueName, level: 1 })
  ).toBeVisible()
  venueUrl = `${new URL(page.url()).pathname}?date=${bookingDate}`
})

test("books a free time slot and shows the confirmation", async ({ page }) => {
  await page.goto(venueUrl)
  await pickSlots(page, "10:00–10:30", "10:30–11:00")
  await fillBookingDetails(page, `Alice ${runId}`)
  await expectNoSeriousA11yViolations(page)

  await page.getByRole("button", { name: "Book 10:00–11:00" }).click()

  await expect(page).toHaveURL(/\/reservations\/\d+\?created=true$/)
  await expect(page.getByText("Booking confirmed")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: /Reservation No\. \d+/ })
  ).toBeVisible()
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible()
  reservationUrl = new URL(page.url()).pathname
  await expectNoSeriousA11yViolations(page)
})

test("finds the new reservation in the list", async ({ page }) => {
  await page.goto("/reservations")
  await page
    .getByRole("searchbox", { name: "Search by name or purpose" })
    .fill(runId)

  await expect(page.getByText("1 reservation", { exact: true })).toBeVisible()
  await expect(page.getByText(`Alice ${runId}`)).toBeVisible()
  await expect(page.getByRole("link", { name: venueName })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test("shows the server's rejection of an overlapping booking", async ({
  page,
}) => {
  await page.goto(venueUrl)
  await expect(
    page.getByRole("button", { name: "10:00–10:30, booked" })
  ).toBeDisabled()

  // Booked slots cannot be clicked, but the time pickers still allow any time.
  await page.getByRole("combobox", { name: "Start" }).click()
  await page.getByRole("option", { name: "10:30" }).click()
  await page.getByRole("combobox", { name: "End" }).click()
  await page.getByRole("option", { name: "11:30" }).click()
  await expect(
    page.getByText("This time overlaps a confirmed booking")
  ).toBeVisible()
  await fillBookingDetails(page, `Bob ${runId}`)
  await page.getByRole("button", { name: "Book 10:30–11:30" }).click()

  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Booking not completed" })
  await expect(alert).toContainText(
    "overlaps a confirmed booking (10:00–11:00)"
  )
  await expect(page).toHaveURL(new RegExp(venueUrl.replace("?", "\\?")))
})

test("cancels the reservation", async ({ page }) => {
  await page.goto(reservationUrl)
  await page.getByRole("button", { name: "Cancel booking" }).click()

  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toContainText("Cancel this booking?")
  await dialog.getByRole("button", { name: "Cancel booking" }).click()

  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible()
  await expect(page.getByText("Cancelled on")).toBeVisible()
})

test("books the same time again after cancellation", async ({ page }) => {
  await page.goto(venueUrl)
  await pickSlots(page, "10:00–10:30", "10:30–11:00")
  await fillBookingDetails(page, `Carol ${runId}`)
  await page.getByRole("button", { name: "Book 10:00–11:00" }).click()

  await expect(page.getByText("Booking confirmed")).toBeVisible()
  expect(new URL(page.url()).pathname).not.toBe(reservationUrl)
})

test("switches the interface to Simplified Chinese", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Switch to Chinese" }).click()

  await expect(
    page.getByRole("heading", { name: "预约场地", level: 1 })
  ).toBeVisible()
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN")
  await page.reload()
  await expect(page.getByRole("link", { name: "预约记录" })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})
