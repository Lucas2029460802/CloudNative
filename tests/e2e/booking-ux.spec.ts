import { expect, test, type Page } from "@playwright/test"

import { installMockApi, mockDate } from "./helpers/ux-api"

const venueUrl = `/venues/1?date=${mockDate}`

function gate() {
  const { promise, resolve } = Promise.withResolvers<void>()
  return { promise, release: resolve }
}

async function chooseTime(page: Page, label: "Start" | "End", time: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click()
  await page.getByRole("option", { name: time, exact: true }).click()
}

async function fillDetails(page: Page) {
  await page.getByLabel("Name or organization").fill("Campus team")
  await page.getByLabel("Number of attendees").fill("6")
  await page.getByLabel("Purpose", { exact: true }).fill("Project review")
}

test("keeps availability unknown while loading and preserves a manually entered draft", async ({
  page,
}) => {
  const store = await installMockApi(page)
  const pending = gate()
  store.listGate = pending.promise
  await page.goto(`${venueUrl}&start=08:00&end=09:00`)

  await expect(page.getByRole("status")).toContainText("Checking availability")
  await expect(page.getByRole("button", { name: /, free$/ })).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Book this time", exact: true })
  ).toBeDisabled()
  await fillDetails(page)
  await chooseTime(page, "Start", "12:00")
  await chooseTime(page, "End", "13:00")

  pending.release()
  await expect(
    page.getByRole("button", { name: "12:00–12:30, selected" })
  ).toBeVisible()
  await expect(
    page.getByRole("combobox", { name: "Start", exact: true })
  ).toContainText("12:00")
  await expect(page.getByLabel("Name or organization")).toHaveValue(
    "Campus team"
  )
  await expect(
    page.getByRole("button", { name: "Book 12:00–13:00", exact: true })
  ).toBeEnabled()
})

test("shows an availability failure and retries without discarding the form", async ({
  page,
}) => {
  const store = await installMockApi(page)
  store.listFailure = true
  await page.goto(venueUrl)
  await fillDetails(page)

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Availability cannot be confirmed right now" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: /, free$/ })).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Book this time", exact: true })
  ).toBeDisabled()
  store.listFailure = false
  await page.getByRole("button", { name: "Try again", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "08:00–08:30, free" })
  ).toBeEnabled()
  await expect(page.getByLabel("Name or organization")).toHaveValue(
    "Campus team"
  )
})

test("validates a recommended range before filling it and keeps later manual edits", async ({
  page,
}) => {
  await installMockApi(page)
  await page.goto(`${venueUrl}&start=08:00&end=09:00`)
  await expect(
    page.getByRole("combobox", { name: "Start", exact: true })
  ).toContainText("08:00")
  await expect(
    page.getByRole("combobox", { name: "End", exact: true })
  ).toContainText("09:00")
  await chooseTime(page, "Start", "12:00")
  await chooseTime(page, "End", "13:00")
  await page.getByLabel("Name or organization").fill("Edited draft")
  await expect(
    page.getByRole("combobox", { name: "Start", exact: true })
  ).toContainText("12:00")
  await expect(
    page.getByRole("combobox", { name: "End", exact: true })
  ).toContainText("13:00")
})

test("rejects an occupied recommendation and clears its notice after a new selection", async ({
  page,
}) => {
  await installMockApi(page)
  await page.goto(`${venueUrl}&start=10:00&end=11:00`)
  await expect(
    page.getByText("The suggested time is no longer available.", {
      exact: false,
    })
  ).toBeVisible()
  await expect(
    page.getByRole("combobox", { name: "Start", exact: true })
  ).toContainText("--:--")
  await page.getByRole("button", { name: "12:00–12:30, free" }).click()
  await expect(
    page.getByText("The suggested time is no longer available.", {
      exact: false,
    })
  ).toHaveCount(0)
})

test("does not combine free endpoints across an occupied period", async ({
  page,
}) => {
  await installMockApi(page)
  await page.goto(venueUrl)
  await page.getByRole("button", { name: "09:30–10:00, free" }).click()
  await page.getByRole("button", { name: "11:00–11:30, free" }).click()
  await expect(
    page.getByText("Choose one continuous free period.", { exact: false })
  ).toBeVisible()
  await expect(
    page.getByRole("combobox", { name: "Start", exact: true })
  ).toContainText("09:30")
  await expect(
    page.getByRole("combobox", { name: "End", exact: true })
  ).toContainText("10:00")
  await expect(
    page.getByRole("button", { name: "11:00–11:30, free" })
  ).toHaveAttribute("aria-pressed", "false")
})

test("recovers from the backend conflict with a same-length alternative and retained details", async ({
  page,
}) => {
  await installMockApi(page)
  await page.goto(venueUrl)
  await expect(
    page.getByRole("button", { name: "10:00–10:30, booked" })
  ).toBeDisabled()
  await chooseTime(page, "Start", "10:30")
  await chooseTime(page, "End", "11:30")
  await fillDetails(page)
  await page
    .getByRole("button", { name: "Book 10:30–11:30", exact: true })
    .click()
  const error = page
    .getByRole("alert")
    .filter({ hasText: "Booking not completed" })
  await expect(error).toContainText("Next available: 11:00–12:00")
  await error
    .getByRole("button", { name: "Use this time", exact: true })
    .click()
  await expect(page.getByLabel("Name or organization")).toHaveValue(
    "Campus team"
  )
  await expect(page.getByLabel("Number of attendees")).toHaveValue("6")
  await expect(page.getByLabel("Purpose", { exact: true })).toHaveValue(
    "Project review"
  )
  await page
    .getByRole("button", { name: "Book 11:00–12:00", exact: true })
    .click()
  await expect(
    page.getByText("Booking confirmed", { exact: true })
  ).toBeVisible()
})

test("withholds old-day slots while a new date is loading", async ({
  page,
}) => {
  const store = await installMockApi(page)
  await page.goto(venueUrl)
  await expect(
    page.getByRole("button", { name: "10:00–10:30, booked" })
  ).toBeDisabled()
  await fillDetails(page)
  const pending = gate()
  store.listGate = pending.promise
  await page.locator('[data-date="2026-11-03"]').click()
  await expect(
    page.getByRole("button", { name: /, (free|booked|selected)$/ })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Book this time", exact: true })
  ).toBeDisabled()
  pending.release()
  await expect(
    page.getByRole("button", { name: "10:00–10:30, free" })
  ).toBeEnabled()
  await expect(page.getByLabel("Name or organization")).toHaveValue(
    "Campus team"
  )
})

test("mobile continue brings the selected booking into the form and frees keyboard space", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await installMockApi(page)
  await page.goto(venueUrl)
  await page.getByRole("button", { name: "09:00–09:30, free" }).click()
  await page.getByRole("button", { name: "09:30–10:00, free" }).click()
  const next = page.getByRole("button", {
    name: "Continue to details",
    exact: true,
  })
  await expect(next).toBeEnabled()
  await next.click()
  const name = page.getByLabel("Name or organization")
  await expect(name).toBeFocused()
  await expect(next).toHaveCount(0)
  await expect(name).toBeInViewport()
})

test("keyboard submission exposes and focuses the shared time error", async ({
  page,
}) => {
  await installMockApi(page)
  await page.goto(venueUrl)
  const submit = page.getByRole("button", {
    name: "Book this time",
    exact: true,
  })
  await expect(submit).toBeEnabled()
  await submit.focus()
  await page.keyboard.press("Enter")
  const start = page.getByRole("combobox", { name: "Start", exact: true })
  await expect(start).toBeFocused()
  await expect(start).toHaveAttribute("aria-describedby", /booking-time-error/)
  await expect(page.locator("#booking-time-error")).toContainText(
    "Choose a start and an end time."
  )
})
