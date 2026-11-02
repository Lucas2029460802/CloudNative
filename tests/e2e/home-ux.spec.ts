import { expect, test } from "@playwright/test"

import { installMockApi, mockDate, mockVenue } from "./helpers/ux-api"

test("cards, filters and view survive shared URLs and carry a real opening into booking", async ({
  page,
}) => {
  await installMockApi(page)
  await page.goto(`/?date=${mockDate}`)
  await expect(
    page.getByRole("button", { name: "Cards", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    page.getByRole("heading", { name: "Rooftop Garden" })
  ).toBeVisible()
  await page.getByLabel("Find a space", { exact: true }).fill("Library, 2F")
  await page.getByLabel("Attendees", { exact: true }).fill("12")
  await page.getByLabel("Booking duration").selectOption("120")
  await page.getByRole("button", { name: "Timeline", exact: true }).click()
  await expect(page).toHaveURL(/view=timeline/)
  await page.reload()
  await expect(page.getByLabel("Find a space", { exact: true })).toHaveValue(
    "Library, 2F"
  )
  await expect(page.getByLabel("Attendees", { exact: true })).toHaveValue("12")
  await expect(page.getByLabel("Booking duration")).toHaveValue("120")
  await expect(
    page.getByRole("button", { name: "Timeline", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "Cards", exact: true }).click()
  await page
    .getByRole("link", {
      name: `Choose a time: ${mockVenue.name}`,
      exact: true,
    })
    .click()
  await expect(page).toHaveURL(/start=08%3A00/)
  await expect(
    page.getByRole("combobox", { name: "Start", exact: true })
  ).toContainText("08:00")
  await expect(
    page.getByRole("combobox", { name: "End", exact: true })
  ).toContainText("10:00")
})

test("unknown availability is never rendered as free while loading or after an error", async ({
  page,
}) => {
  const store = await installMockApi(page)
  let release!: () => void
  store.listGate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.goto(`/?date=${mockDate}`)
  await expect(
    page.getByText("Checking availability for this date…").first()
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: `Choose a time: ${mockVenue.name}` })
  ).toHaveCount(0)
  await expect(page.getByText("Next available", { exact: true })).toHaveCount(0)
  store.listFailure = true
  release()
  await expect(
    page.getByText("Availability could not be confirmed", { exact: true })
  ).toBeVisible()
  await expect(page.getByText("Next available", { exact: true })).toHaveCount(0)
  store.listFailure = false
  store.listGate = null
  await page.getByRole("button", { name: "Try again", exact: true }).click()
  await expect(
    page.getByRole("link", {
      name: `Choose a time: ${mockVenue.name}`,
      exact: true,
    })
  ).toBeVisible()
})

test("multi-word search remains editable and no matches can be cleared", async ({
  page,
}) => {
  await installMockApi(page)
  await page.goto(`/?date=${mockDate}`)
  const search = page.getByLabel("Find a space", { exact: true })
  await search.pressSequentially("Campus Studio")
  await expect(search).toHaveValue("Campus Studio")
  await expect(
    page.getByRole("heading", { name: mockVenue.name })
  ).toBeVisible()
  await search.fill("No such venue")
  await expect(
    page.getByText("No spaces match these filters", { exact: true })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .first()
    .click()
  await expect(search).toHaveValue("")
  await expect(
    page.getByRole("heading", { name: mockVenue.name })
  ).toBeVisible()
})

test("offline availability keeps room information but offers no bookable conclusion", async ({
  page,
}) => {
  const store = await installMockApi(page)
  store.listOffline = true
  await page.goto(`/?date=${mockDate}`)
  await expect(
    page.getByText("Availability could not be confirmed", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: mockVenue.name })
  ).toBeVisible()
  await expect(page.getByText("Next available", { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole("link", {
      name: `Choose a time: ${mockVenue.name}`,
      exact: true,
    })
  ).toHaveCount(0)
})
