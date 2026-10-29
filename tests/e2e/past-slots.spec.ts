import { expect, test, type Locator } from "@playwright/test"

const runId = Date.now().toString(36)

// The page's clock is fixed at 10:12 on one day, Shanghai time, which Playwright uses
// as the browser's zone. On a venue opening at 10:00, the first slot has started and
// the next one is still free, on every run.
const date = "2026-01-15"
const now = new Date(`${date}T10:12:00+08:00`)
const past = { startTime: "10:00", endTime: "10:30" }
const future = { startTime: "10:30", endTime: "11:00" }

function slotName(
  slot: { startTime: string; endTime: string },
  state: "already passed" | "free"
) {
  return `${slot.startTime}–${slot.endTime}, ${state}`
}

async function classTokens(locator: Locator) {
  return (await locator.getAttribute("class"))?.split(/\s+/) ?? []
}

test("grays out a past start and refuses to select it", async ({ page }) => {
  await page.clock.setFixedTime(now)

  const created = await page.request.post("/api/venues", {
    data: {
      name: `Past slots ${runId}`,
      location: "Test Building, 1F",
      capacity: 10,
      openTime: past.startTime,
      closeTime: future.endTime,
    },
  })
  const body = await created.text()
  expect(created.ok(), body).toBeTruthy()
  const venue: { id: number } = JSON.parse(body)

  await page.goto(`/venues/${venue.id}?date=${date}`)

  const pastButton = page.getByRole("button", {
    name: slotName(past, "already passed"),
  })
  await expect(pastButton).toBeDisabled()
  expect(await classTokens(pastButton)).toContain("bg-hatch")
  await expect(pastButton).toHaveCSS("background-image", /linear-gradient/)
  await expect(pastButton).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await pastButton.click({ force: true })
  await expect(pastButton).toHaveAttribute("aria-pressed", "false")
  await expect(
    page.getByRole("button", { name: "Book this time" })
  ).toBeVisible()

  const futureButton = page.getByRole("button", {
    name: slotName(future, "free"),
  })
  await expect(futureButton).toBeEnabled()
  expect(await classTokens(futureButton)).not.toContain("bg-hatch")
  await expect(futureButton).toHaveCSS("background-image", "none")

  await page.getByRole("combobox", { name: "Start" }).click()
  const pastOption = page.getByRole("option", {
    name: past.startTime,
    exact: true,
  })
  await expect(pastOption).toBeDisabled()
  await expect(pastOption).toHaveCSS("opacity", "0.5")
  await expect(pastOption).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await pastOption.click({ force: true })
  await expect(page.getByRole("combobox", { name: "Start" })).toContainText(
    "--:--"
  )

  await page.keyboard.press("Escape")
  await page.getByRole("combobox", { name: "Start" }).click()
  const futureOption = page.getByRole("option", {
    name: future.startTime,
    exact: true,
  })
  await expect(futureOption).toBeEnabled()
  await expect(futureOption).toHaveCSS("opacity", "1")
  await futureOption.click()
  await expect(page.getByRole("combobox", { name: "Start" })).toContainText(
    future.startTime
  )
  await expect(
    page.getByRole("button", {
      name: `Book ${future.startTime}–${future.endTime}`,
    })
  ).toBeVisible()
})
