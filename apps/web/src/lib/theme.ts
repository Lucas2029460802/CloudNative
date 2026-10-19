// Light or dark theme: follows the system until the person picks one in the header.
const darkScheme = window.matchMedia("(prefers-color-scheme: dark)")

function applyTheme() {
  const theme = localStorage.getItem("theme")
  const dark = theme === "dark" || (theme !== "light" && darkScheme.matches)
  // Swap colors at once instead of animating every element with a transition.
  const freeze = document.head.appendChild(document.createElement("style"))
  freeze.textContent = "*,*::before,*::after{transition:none!important}"
  document.documentElement.classList.toggle("dark", dark)
  requestAnimationFrame(() => requestAnimationFrame(() => freeze.remove()))
}

export function toggleTheme() {
  const dark = document.documentElement.classList.contains("dark")
  localStorage.setItem("theme", dark ? "light" : "dark")
  applyTheme()
}

applyTheme()
darkScheme.addEventListener("change", applyTheme)
// Pick up a theme chosen in another tab.
window.addEventListener("storage", (event) => {
  if (event.key === "theme") applyTheme()
})
