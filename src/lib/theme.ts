export type ThemePreference = "light" | "dark" | "system"

const THEME_STORAGE_KEY = "papermate-theme"
const DARK_QUERY = "(prefers-color-scheme: dark)"

export function getStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system"
}

export function applyThemePreference(theme: ThemePreference) {
  const prefersDark = window.matchMedia(DARK_QUERY).matches
  const shouldUseDark = theme === "dark" || (theme === "system" && prefersDark)
  document.documentElement.classList.toggle("dark", shouldUseDark)
  document.documentElement.style.colorScheme = shouldUseDark ? "dark" : "light"
}

export function setStoredTheme(theme: ThemePreference) {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  applyThemePreference(theme)
}

export function watchSystemTheme(callback: () => void) {
  const media = window.matchMedia(DARK_QUERY)
  media.addEventListener("change", callback)
  return () => media.removeEventListener("change", callback)
}
