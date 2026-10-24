import { canonicalPlaneSettings } from "./canonical-plane-settings.js";
import { decoratorSettings } from "./decorator-settings.js";
import { experimentalSettings } from "./experimental-settings.js";
import { radialSettings } from "./radial-settings.js";
import { settingsTabs } from "./settings-tabs.js";
import { sketchGridSettings } from "./sketch-grid-settings.js";
import { themeSettings } from "./theme-settings.js";
import { setUiScale, uiScale, uiScaleChoices } from "./ui-scale.js";
import { viewSettings } from "./view-settings.js";
import "./settings.css";
import "./settings-decorators.css";
import "./settings-grid.css";
import "./settings-layout.css";

export function settingsDialog(extra: [string, HTMLElement][] = []): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.className = "application-settings";
  dialog.setAttribute("aria-labelledby", "settings-title");
  const outside = (event: PointerEvent) => {
    const bounds = dialog.getBoundingClientRect();
    return (
      event.target === dialog &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom)
    );
  };
  let backdropPress = false;
  dialog.addEventListener("pointerdown", (event) => {
    backdropPress = event.button === 0 && outside(event);
  });
  dialog.addEventListener("pointerup", (event) => {
    if (backdropPress && outside(event)) dialog.close();
    backdropPress = false;
  });
  dialog.addEventListener("pointercancel", () => {
    backdropPress = false;
  });
  dialog.innerHTML = `<form method="dialog"><h2 id="settings-title">Settings</h2>
    <label>User interface scale<select aria-label="User interface scale"></select></label>
    <div class="settings-actions"><p>Changes saved automatically.</p><button type="button" data-reset>Reset to 100%</button><button value="close">Done</button></div></form>`;
  const select = dialog.querySelector<HTMLSelectElement>("select");
  const reset = dialog.querySelector<HTMLButtonElement>("[data-reset]");
  if (!select || !reset) throw new Error("Missing scale settings controls");
  const form = dialog.querySelector("form");
  if (!form) throw new Error("Missing settings form");
  const general = document.createElement("section");
  const interfaceRow = document.createElement("div");
  interfaceRow.className = "settings-interface";
  const scaleLabel = select.closest("label");
  if (!scaleLabel) throw new Error("Missing scale label");
  interfaceRow.append(themeSettings(), scaleLabel, reset);
  general.append(interfaceRow, radialSettings());
  const view = document.createElement("div");
  view.className = "settings-view";
  view.append(viewSettings(), canonicalPlaneSettings());
  const tabs = settingsTabs([
    ["Interface", general],
    ["Sketch Grid", sketchGridSettings()],
    ["View", view],
    ["Decorators", decoratorSettings()],
    ["Experimental", experimentalSettings()],
    ...extra,
  ]);
  form.querySelector(".settings-actions")?.before(tabs);
  for (const scale of uiScaleChoices)
    select.add(new Option(`${Math.round(scale * 100)}%`, String(scale)));
  const update = () => {
    dialog
      .querySelector('[aria-label="Appearance"]')
      ?.dispatchEvent(new Event("preferences-refresh"));
    dialog
      .querySelector('[aria-label="Circular dimensions"]')
      ?.dispatchEvent(new Event("preferences-refresh"));
    select.value = String(uiScale());
    reset.disabled = uiScale() === 1;
  };
  select.onchange = () => {
    setUiScale(Number(select.value));
    update();
  };
  reset.onclick = () => {
    setUiScale(1);
    update();
    select.focus();
  };
  dialog.addEventListener("beforetoggle", update);
  dialog.addEventListener("preferences-refresh", update);
  update();
  return dialog;
}
