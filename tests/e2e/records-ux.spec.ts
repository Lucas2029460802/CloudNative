/// <reference lib="dom" />

import { expect, test } from "@playwright/test"

import { installMockApi, mockDate, mockReservation } from "./helpers/ux-api"

test("number lookup validates, opens details, and returns to the original filters", async ({
  page,
}) => {
  await installMockApi(page)
  await page.goto(
    `/reservations?q=Mock&date=${mockDate}&status=confirmed&venueId=1`
  )
  await page.getByLabel("Reservation number", { exact: true }).fill("0")
  await page.getByRole("button", { name: "Look up", exact: true }).click()
  await expect(
    page.getByLabel("Reservation number", { exact: true })
  ).toBeFocused()
  await expect(
    page.getByText(
      "Enter a valid reservation number using positive whole numbers."
    )
  ).toBeVisible()
  await page.getByLabel("Reservation number", { exact: true }).fill("41")
  await page.getByRole("button", { name: "Look up", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Reservation No. 41" })
  ).toBeVisible()
  await page.getByRole("link", { name: "Back to results", exact: true }).click()
  await expect(
    page.getByRole("searchbox", { name: "Search by name or purpose" })
  ).toHaveValue("Mock")
  await expect(page.getByLabel("Specific date", { exact: true })).toHaveValue(
    mockDate
  )
  await expect(page).toHaveURL(/status=confirmed/)
  await expect(
    page.getByText(mockReservation.bookerName, { exact: false })
  ).toBeVisible()
})

test("specific dates reach the existing list API and clearing removes all filters", async ({
  page,
}) => {
  await installMockApi(page)
  await page.goto("/reservations")
  const request = page.waitForRequest(
    (req) =>
      new URL(req.url()).pathname === "/api/reservations" &&
      new URL(req.url()).searchParams.get("date") === mockDate
  )
  await page.getByLabel("Specific date", { exact: true }).fill(mockDate)
  const sent = new URL((await request).url())
  expect(sent.searchParams.has("from")).toBe(false)
  await expect(page).toHaveURL(new RegExp(`date=${mockDate}`))
  await page
    .getByRole("searchbox", { name: "Search by name or purpose" })
    .fill("Missing")
  await expect(
    page.getByText("No reservations match your filters", { exact: true })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .first()
    .click()
  await expect(page.getByLabel("Specific date", { exact: true })).toHaveValue(
    ""
  )
  await expect(
    page.getByRole("searchbox", { name: "Search by name or purpose" })
  ).toHaveValue("")
  await expect(page).not.toHaveURL(/\?/)
})

test("old filtered results are labelled and inert until the new response arrives", async ({
  page,
}) => {
  const store = await installMockApi(page)
  await page.goto("/reservations")
  await expect(
    page.getByText(mockReservation.bookerName, { exact: false })
  ).toBeVisible()
  let release!: () => void
  store.listGate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page
    .getByRole("searchbox", { name: "Search by name or purpose" })
    .fill("Not found")
  await expect(
    page.getByText("Updating reservations…", { exact: true })
  ).toBeVisible()
  await expect(
    page.locator("[inert]").filter({ hasText: mockReservation.bookerName })
  ).toHaveCount(1)
  release()
  await expect(
    page.getByText("No reservations match your filters", { exact: true })
  ).toBeVisible()
})

test("copies the number and a clean booking link, with an honest failure fallback", async ({
  page,
}) => {
  await installMockApi(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          ;(window as unknown as { copied: string }).copied = text
        },
      },
    })
  })
  await page.goto(
    `/reservations/41?created=true&back=${encodeURIComponent(JSON.stringify({ q: "Mock" }))}`
  )
  await page.getByRole("button", { name: "Copy number", exact: true }).click()
  await expect(
    page.getByText("Reservation number copied.", { exact: true })
  ).toBeVisible()
  expect(
    await page.evaluate(() => (window as unknown as { copied: string }).copied)
  ).toBe("41")
  await page
    .getByRole("button", { name: "Copy booking link", exact: true })
    .click()
  expect(
    await page.evaluate(() => (window as unknown as { copied: string }).copied)
  ).toBe(`${new URL(page.url()).origin}/reservations/41`)
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied")
        },
      },
    })
  })
  await page
    .getByRole("button", { name: "Copy booking link", exact: true })
    .click()
  await expect(page.getByLabel("Text to copy")).toHaveValue(
    `${new URL(page.url()).origin}/reservations/41`
  )
  await expect(
    page.getByText(
      "Could not copy. Select the text below to copy manually, or try again.",
      { exact: true }
    )
  ).toBeVisible()
})

test("cancellation cannot be mistaken for keeping a booking while the request is pending", async ({
  page,
}) => {
  const store = await installMockApi(page)
  let release!: () => void
  store.cancelGate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.goto("/reservations/41")
  await page
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click()
  const dialog = page.getByRole("alertdialog")
  await dialog
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click()
  await expect(
    dialog.getByRole("button", { name: "Cancelling…", exact: true })
  ).toBeDisabled()
  await expect(
    dialog.getByRole("button", { name: "Keep booking", exact: true })
  ).toBeDisabled()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeVisible()
  release()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible()
  expect(store.reservations[0]?.status).toBe("cancelled")
})

test("missing numbers retain a safe return path and direct details have a site-local exit", async ({
  page,
}) => {
  await installMockApi(page)
  await page.goto(
    `/reservations/999?back=${encodeURIComponent(JSON.stringify({ q: "Mock", injected: "https://example.com" }))}`
  )
  await expect(
    page.getByText("Reservation not found", { exact: true })
  ).toBeVisible()
  await page.getByRole("link", { name: "Back to results", exact: true }).click()
  await expect(page).toHaveURL(/\/reservations\?q=Mock$/)
  await page.goto("/reservations/41")
  await expect(
    page.getByRole("link", { name: "All reservations", exact: true })
  ).toHaveAttribute("href", "/reservations")
})
