import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { canonicalPlaneSettings } from "./canonical-plane-settings.js";
import { onCanonicalPlanesChange } from "./canonical-planes.js";
import { decoratorSettings } from "./decorator-settings.js";
import { experimentalSettings } from "./experimental-settings.js";
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
  if (/Mac/.test(navigator.platform)) button.title = "Settings (⌘,)";
  const dialog = settingsDialog();
  const rememberFocus = settingsFocus(dialog);
  const requestOpen = () => {
    if (dialog.open) return;
    rememberFocus();
    void toolCatalog(editor).invoke("settings");
  };
  const open = () => {
    if (editor.blocked || editor.interactions.current) return;
    if (!dialog.open) dialog.showModal();
  };
  button.onclick = requestOpen;
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
  const disposeKeyboard = installSettingsKeyboard(requestOpen);
  update();
  return () => {
    disposeTool();
    disposeScale();
    disposeView();
    disposePlanes();
    editor.world.changed.delete(update);
    disposeKeyboard();
    headerObserver.disconnect();
    app.style.removeProperty("--editor-header-bottom");
    button.remove();
    dialog.remove();
  };
}

function settingsFocus(dialog: HTMLDialogElement): () => void {
  let opener: HTMLElement | null = null;
  dialog.addEventListener("close", () => {
    // The close event can arrive after the user has focused another control.
    // Restore only while focus still belongs to the closing dialog.
    if (
      opener?.isConnected &&
      (document.activeElement === document.body || dialog.contains(document.activeElement))
    )
      opener.focus();
    opener = null;
  });
  return () => {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };
}

function installSettingsKeyboard(open: () => void): () => void {
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
  const shortcut = (event: KeyboardEvent) => {
    if (
      /Mac/.test(navigator.platform) &&
      event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      event.key === ","
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      open();
    }
  };
  window.addEventListener("keydown", shortcut, true);
  return () => {
    document.removeEventListener("keydown", blockZoom, true);
    window.removeEventListener("keydown", shortcut, true);
  };
}

function settingsDialog(): HTMLDialogElement {
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
    <p>Changes apply immediately and are saved on this device.</p>
    <div class="settings-actions"><button type="button" data-reset>Reset to 100%</button><button value="close">Done</button></div></form>`;
  const select = dialog.querySelector<HTMLSelectElement>("select");
  const reset = dialog.querySelector<HTMLButtonElement>("[data-reset]");
  if (!select || !reset) throw new Error("Missing scale settings controls");
  dialog
    .querySelector(".settings-actions")
    ?.before(viewSettings(), canonicalPlaneSettings(), decoratorSettings(), experimentalSettings());
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
