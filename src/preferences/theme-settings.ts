import { setThemePreference, type ThemePreference, themePreference } from "./theme.js";

export function themeSettings(): HTMLElement {
  const label = document.createElement("label");
  label.textContent = "Appearance";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Appearance");
  for (const [value, title] of [
    ["system", "System"],
    ["light", "Light"],
    ["dark", "Dark"],
  ])
    select.add(new Option(title, value));
  const refresh = () => {
    select.value = themePreference();
  };
  select.addEventListener("preferences-refresh", refresh);
  refresh();
  select.onchange = () => setThemePreference(select.value as ThemePreference);
  label.append(select);
  return label;
}
