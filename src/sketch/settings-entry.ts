import { settingsDialog } from "../preferences/settings-dialog.js";

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
