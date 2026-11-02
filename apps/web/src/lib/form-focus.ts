/** Wait for React's validation render, then expose the first invalid field. */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() => {
    const invalid = form?.querySelector<HTMLElement>(
      "[aria-invalid='true']:not(:disabled)"
    )
    invalid?.focus({ preventScroll: true })
    invalid?.scrollIntoView({ block: "center", behavior: "instant" })
  })
}
