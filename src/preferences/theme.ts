export type ThemePreference = "system" | "light" | "dark";
export type ColorTheme = Exclude<ThemePreference, "system">;
const key = "makeshift.theme";
const listeners = new Set<() => void>();
const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
let preference: ThemePreference = "system";
try {
  preference = validTheme(localStorage.getItem(key));
} catch {
  // Private browsing and embedded clients can deny storage.
}

function validTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
export function themePreference(): ThemePreference {
  return preference;
}
export function colorTheme(): ColorTheme {
  return preference === "system" ? (media?.matches ? "dark" : "light") : preference;
}
function apply(): void {
  if (typeof document !== "undefined") {
    const theme = colorTheme();
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#161e29" : "#f8f9fb");
  }
  for (const listener of listeners) listener();
}
export function setThemePreference(value: ThemePreference): void {
  preference = validTheme(value);
  try {
    localStorage.setItem(key, preference);
  } catch {
    // Keep the choice for this window when persistence is unavailable.
  }
  apply();
}
export function onThemeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const systemChanged = () => {
  if (preference === "system") apply();
};
if (media?.addEventListener) media.addEventListener("change", systemChanged);
else media?.addListener?.(systemChanged);
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = validTheme(event.newValue);
    apply();
  });
}
apply();
