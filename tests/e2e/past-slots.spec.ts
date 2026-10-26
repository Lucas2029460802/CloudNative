import { expect, test, type Locator, type Page } from "@playwright/test"

import { daySlots, fromMinutes, toMinutes } from "../../apps/web/src/lib/time"

const runId = Date.now().toString(36)

/** Shanghai wall clock. Playwright pins the browser to this zone; CI itself is UTC. */
function shanghaiNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date())
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""
  const hour = Number(read("hour")) % 24
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    minutes: hour * 60 + Number(read("minute")),
    seconds: Number(read("second")),
  }
}

/**
 * The schedule flips a slot from free to past exactly when its start minute arrives.
 * Within the last 20 seconds of a half-hour that flip can land between this calculation
 * and the page render, so wait the boundary out first.
 */
async function stableShanghaiNow(page: Page) {
  const now = shanghaiNow()
  const secondsLeft = 30 * 60 - ((now.minutes % 30) * 60 + now.seconds)
  if (secondsLeft >= 20) return now
  await page.waitForTimeout((secondsLeft + 1) * 1000)
  return shanghaiNow()
}

function slotName(
  slot: { startTime: string; endTime: string },
  state: "already passed" | "free"
) {
  return `${slot.startTime}\u2013${slot.endTime}, ${state}`
}

async function classTokens(locator: Locator) {
  return (await locator.getAttribute("class"))?.split(/\s+/) ?? []
}

test("grays out a past start and refuses to select it", async ({ page }) => {
  const now = await stableShanghaiNow(page)
  const pastStart = Math.floor(now.minutes / 30) * 30
  const futureStart = pastStart + (now.minutes % 30 >= 25 ? 60 : 30)
  const hasFuture = futureStart < 24 * 60
  const openTime = fromMinutes(pastStart)
  const closeTime = fromMinutes(
    hasFuture ? Math.min(futureStart + 30, 23 * 60 + 59) : 23 * 60 + 59
  )

  const created = await page.request.post("/api/venues", {
    data: {
      name: `Past slots ${runId}`,
      location: "Test Building, 1F",
      capacity: 10,
      openTime,
      closeTime,
    },
  })
  const body = await created.text()
  expect(created.ok(), body).toBeTruthy()
  const venue: { id: number } = JSON.parse(body)

  await page.goto(`/venues/${venue.id}?date=${now.date}`)

  const slots = daySlots(openTime, closeTime)
  const past = slots.find((slot) => toMinutes(slot.startTime) <= now.minutes)
  const future = hasFuture
    ? slots.find((slot) => slot.startTime === fromMinutes(futureStart))
    : undefined
  expect(past, `no past slot in ${openTime}–${closeTime}`).toBeDefined()
  if (hasFuture) {
    expect(
      future,
      `no future slot at ${fromMinutes(futureStart)}`
    ).toBeDefined()
  }
  if (!past) return

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

  if (future) {
    const futureButton = page.getByRole("button", {
      name: slotName(future, "free"),
    })
    await expect(futureButton).toBeEnabled()
    expect(await classTokens(futureButton)).not.toContain("bg-hatch")
    await expect(futureButton).toHaveCSS("background-image", "none")
  }

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

  if (!future) return
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
      name: `Book ${future.startTime}\u2013${future.endTime}`,
    })
  ).toBeVisible()
})
