import "../preferences/theme.js";
import "../preferences/theme.css";
import { installToolboxSettings } from "../preferences/toolbox-settings.js";
import type { ToolboxTool } from "../tools/toolbox-row.js";
import "../tools/toolbox.css";
import { settingsDialog } from "../preferences/settings-dialog.js";

import { onViewDisplayChange } from "../preferences/view-display.js";

const toolbox = document.createElement("section");
const dialog = settingsDialog([["Toolbox", toolbox]]);
let tools: ToolboxTool[] = [];
installToolboxSettings(toolbox, () => tools);
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
    makeshiftSettingsWindow?: {
      fit(height: number): Promise<void>;
      tools(): Promise<ToolboxTool[]>;
      onTools(callback: (tools: ToolboxTool[]) => void): void;
    };
  }
).makeshiftSettingsWindow;
const form = dialog.querySelector("form");
if (host && form) {
  new ResizeObserver(() => {
    const padding = parseFloat(getComputedStyle(dialog).paddingTop) * 2;
    void host.fit(Math.ceil(form.getBoundingClientRect().height + padding) + 2);
  }).observe(form);
}

if (host) {
  const updateTools = (next: ToolboxTool[]) => {
    tools = next;
    toolbox.dispatchEvent(new Event("toolbox-refresh"));
  };
  host.onTools(updateTools);
  void host.tools().then(updateTools);
}
