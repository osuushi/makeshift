import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { canonicalPlaneSettings } from "./canonical-plane-settings.js";
import { onCanonicalPlanesChange } from "./canonical-planes.js";
import { decoratorSettings } from "./decorator-settings.js";
import { onUiScaleChange, setUiScale, uiScale, uiScaleChoices } from "./ui-scale.js";
import { onViewDisplayChange } from "./view-display.js";
import { viewSettings } from "./view-settings.js";
import "./settings.css";

export function installSettings(editor: SketchEditor, app: HTMLElement): () => void {
  const button = document.createElement("button");
  button.textContent = "Settings";
  button.className = "settings-trigger";
  button.setAttribute("aria-label", "Application settings");
  button.setAttribute("aria-haspopup", "dialog");
  const dialog = settingsDialog();
  const open = () => {
    if (editor.blocked || editor.interactions.current) return;
    if (!dialog.open) dialog.showModal();
  };
  button.onclick = () => void toolCatalog(editor).invoke("settings");
  const header = app.querySelector("header");
  header?.append(button);
  const fitHeader = () => {
    if (!header) return;
    const bottom = `${header.getBoundingClientRect().bottom - app.getBoundingClientRect().top}px`;
    if (app.style.getPropertyValue("--editor-header-bottom") === bottom) return;
    app.style.setProperty("--editor-header-bottom", bottom);
    // Entities moves with this offset after the viewport's resize draw.
    editor.world.requestDraw();
  };
  const headerObserver = new ResizeObserver(fitHeader);
  if (header) headerObserver.observe(header);
  fitHeader();
  document.body.append(dialog);
  const disposeTool = toolCatalog(editor).register({
    id: "settings",
    label: "Settings",
    category: "View",
    description: "Adjust interface scale, viewport opacity and decorator display",
    aliases: [
      "preferences",
      "user interface scale",
      "decorator display",
      "grid opacity",
      "grid thickness",
      "plane visibility",
      "plane palette",
    ],
    reason: () => idleReason(editor),
    run: open,
  });
  const update = () => {
    button.disabled = !!toolCatalog(editor).reason({ reason: () => null });
  };
  editor.world.changed.add(update);
  const disposeScale = onUiScaleChange(() => {
    // Refit geometry-relative controls to their new measured dimensions.
    editor.world.draw();
  });
  const refreshPreferences = () => {
    editor.world.requestDraw();
    for (const panel of dialog.querySelectorAll(".view-display-settings"))
      panel.dispatchEvent(new Event("preferences-refresh"));
  };
  const disposeView = onViewDisplayChange(refreshPreferences);
  const disposePlanes = onCanonicalPlanesChange(refreshPreferences);
  const blockZoom = (event: KeyboardEvent) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      (["+", "=", "-", "_", "0"].includes(event.key) ||
        ["NumpadAdd", "NumpadSubtract", "Numpad0"].includes(event.code))
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  document.addEventListener("keydown", blockZoom, true);
  update();
  return () => {
    disposeTool();
    disposeScale();
    disposeView();
    disposePlanes();
    editor.world.changed.delete(update);
    document.removeEventListener("keydown", blockZoom, true);
    headerObserver.disconnect();
    app.style.removeProperty("--editor-header-bottom");
    button.remove();
    dialog.remove();
  };
}

function settingsDialog(): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.className = "application-settings";
  dialog.setAttribute("aria-labelledby", "settings-title");
  dialog.innerHTML = `<form method="dialog"><h2 id="settings-title">Settings</h2>
    <label>User interface scale<select aria-label="User interface scale"></select></label>
    <p>Changes apply immediately and are saved on this device. Geometry and camera zoom stay independent.</p>
    <div class="settings-actions"><button type="button" data-reset>Reset to 100%</button><button value="close">Done</button></div></form>`;
  const select = dialog.querySelector<HTMLSelectElement>("select");
  const reset = dialog.querySelector<HTMLButtonElement>("[data-reset]");
  if (!select || !reset) throw new Error("Missing scale settings controls");
  dialog
    .querySelector(".settings-actions")
    ?.before(viewSettings(), canonicalPlaneSettings(), decoratorSettings());
  for (const scale of uiScaleChoices)
    select.add(new Option(`${Math.round(scale * 100)}%`, String(scale)));
  const update = () => {
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
  update();
  return dialog;
}
