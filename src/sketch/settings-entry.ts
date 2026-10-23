import { settingsDialog } from "../preferences/settings-dialog.js";

import { onViewDisplayChange } from "../preferences/view-display.js";

const dialog = settingsDialog();
document.body.className = "settings-window";
document.body.append(dialog);
dialog.addEventListener("close", () => window.close());
window.addEventListener("storage", () => {
  dialog.dispatchEvent(new Event("preferences-refresh"));
  for (const section of dialog.querySelectorAll("section"))
    section.dispatchEvent(new Event("preferences-refresh"));
});
dialog.showModal();

onViewDisplayChange(() => {
  for (const section of dialog.querySelectorAll(".view-display-settings"))
    section.dispatchEvent(new Event("preferences-refresh"));
});

const host = (
  window as Window & {
    makeshiftSettingsWindow?: { fit(height: number): Promise<void> };
  }
).makeshiftSettingsWindow;
const form = dialog.querySelector("form");
if (host && form) {
  new ResizeObserver(() => {
    const padding = parseFloat(getComputedStyle(dialog).paddingTop) * 2;
    void host.fit(Math.ceil(form.getBoundingClientRect().height + padding) + 2);
  }).observe(form);
}
