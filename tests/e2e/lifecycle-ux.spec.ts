/// <reference lib="dom" />

import { expect, test } from "@playwright/test"

import { installMockApi, mockDate } from "./helpers/ux-api"

test("front-end create, save number, look up, cancel and book the released time", async ({
  page,
}) => {
  const store = await installMockApi(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async () => {} },
    })
  })
  await page.goto(`/venues/1?date=${mockDate}&start=08:00&end=09:00`)
  await expect(
    page.getByRole("combobox", { name: "Start", exact: true })
  ).toContainText("08:00")
  await page.getByLabel("Name or organization").fill("Campus team")
  await page.getByLabel("Number of attendees").fill("6")
  await page.getByLabel("Purpose", { exact: true }).fill("Project review")
  await page
    .getByRole("button", { name: "Book 08:00–09:00", exact: true })
    .click()
  await expect(
    page.getByText("Booking confirmed", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Reservation No. 42" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Copy number", exact: true }).click()
  await expect(
    page.getByText("Reservation number copied.", { exact: true })
  ).toBeVisible()
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Reservations", exact: true })
    .click()
  await page.getByLabel("Reservation number", { exact: true }).fill("42")
  await page.getByRole("button", { name: "Look up", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Reservation No. 42" })
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click()
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible()
  await page
    .getByRole("link", { name: "Book another time", exact: true })
    .click()
  await page
    .getByRole("button", { name: "08:00–08:30, free", exact: true })
    .click()
  await page
    .getByRole("button", { name: "08:30–09:00, free", exact: true })
    .click()
  await page.getByLabel("Name or organization").fill("Campus team")
  await page.getByLabel("Number of attendees").fill("6")
  await page.getByLabel("Purpose", { exact: true }).fill("New project review")
  await page
    .getByRole("button", { name: "Book 08:00–09:00", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "Reservation No. 43" })
  ).toBeVisible()
  expect(store.reservations.find((item) => item.id === 42)?.status).toBe(
    "cancelled"
  )
  expect(store.reservations.find((item) => item.id === 43)?.status).toBe(
    "confirmed"
  )
})
