import "../preferences/theme.js";
import "../preferences/theme.css";
import { installToolboxSettings } from "../preferences/toolbox-settings.js";
import type { ToolboxTool } from "../tools/toolbox-row.js";
import "../tools/toolbox.css";
import { onRadialDimensionChange } from "../preferences/radial-dimension.js";
import { settingsDialog } from "../preferences/settings-dialog.js";

import { measureSettings, type SettingsSize } from "../preferences/settings-size.js";
import { onUiScaleChange } from "../preferences/ui-scale.js";
import { onViewDisplayChange } from "../preferences/view-display.js";

const toolbox = document.createElement("section");
const dialog = settingsDialog([["Toolbox", toolbox]]);
let tools: ToolboxTool[] = [];
installToolboxSettings(toolbox, () => tools);
document.body.className = "settings-window";
document.body.append(dialog);
window.addEventListener("storage", () => {
  dialog.dispatchEvent(new Event("preferences-refresh"));
  for (const section of dialog.querySelectorAll("section"))
    section.dispatchEvent(new Event("preferences-refresh"));
});
dialog.showModal();
onRadialDimensionChange(() => dialog.dispatchEvent(new Event("preferences-refresh")));

onViewDisplayChange(() => {
  for (const section of dialog.querySelectorAll(".view-display-settings"))
    section.dispatchEvent(new Event("preferences-refresh"));
});

const host = (
  window as Window & {
    makeshiftSettingsWindow?: {
      close(): Promise<void>;
      availableSize(): Promise<{ width: number; height: number }>;
      fitTab(size: SettingsSize): Promise<void>;
      tools(): Promise<ToolboxTool[]>;
      onTools(callback: (tools: ToolboxTool[]) => void): void;
    };
  }
).makeshiftSettingsWindow;

if (host) {
  // Submit/cancel occur before the dialog's queued close event. Let the native
  // host own closing, so another opener cannot reuse a closed HTML dialog.
  const close = (event: Event) => {
    event.preventDefault();
    void host.close();
  };
  dialog.addEventListener("submit", close);
  dialog.addEventListener("cancel", close);
  dialog.addEventListener("close", () => void host.close());
  const fitSelectedTab = async () => {
    const available = await host.availableSize();
    await host.fitTab(measureSettings(dialog, available));
  };
  dialog.addEventListener("settings-tab-change", () => void fitSelectedTab());
  onUiScaleChange(() => void fitSelectedTab());
  void fitSelectedTab();
  const updateTools = (next: ToolboxTool[]) => {
    tools = next;
    toolbox.dispatchEvent(new Event("toolbox-refresh"));
  };
  host.onTools(updateTools);
  void host.tools().then(updateTools);
}
