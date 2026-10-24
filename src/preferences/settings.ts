import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { onCanonicalPlanesChange } from "./canonical-planes.js";
import { onRadialDimensionChange } from "./radial-dimension.js";
import { settingsDialog } from "./settings-dialog.js";
import { nativeSettings } from "./settings-host.js";
import { onSketchGridPreferencesChange } from "./sketch-grid.js";

import { installToolboxSettings } from "./toolbox-settings.js";
import { onUiScaleChange } from "./ui-scale.js";
import { onViewDisplayChange } from "./view-display.js";
import "./settings.css";

export function installSettings(editor: SketchEditor, app: HTMLElement): () => void {
  const button = document.createElement("button");
  button.textContent = "Settings";
  button.className = "settings-trigger";
  button.setAttribute("aria-label", "Application settings");
  button.setAttribute("aria-haspopup", "dialog");
  if (/Mac/.test(navigator.platform)) button.title = "Settings (⌘,)";
  const toolbox = document.createElement("section");
  const dialog = settingsDialog([["Toolbox", toolbox]]);
  const disposeToolbox = installToolboxSettings(toolbox, () => toolCatalog(editor).results());
  const rememberFocus = settingsFocus(dialog);
  const requestOpen = () => {
    if (dialog.open) return;
    rememberFocus();
    void toolCatalog(editor).invoke("settings");
  };
  const open = () => {
    if (editor.blocked || editor.interactions.current) return;
    if (nativeSettings()) {
      const tools = toolCatalog(editor)
        .results()
        .map(({ id, label, description }) => ({
          id,
          label,
          description,
          unavailable: null,
        }));
      void nativeSettings()?.open(tools);
    } else if (!dialog.open) dialog.showModal();
  };
  button.onclick = requestOpen;
  const header = app.querySelector("header");
  header?.append(button);
  const disposeHeader = trackSettingsHeader(editor, app, header);
  document.body.append(dialog);
  const disposeTool = toolCatalog(editor).register({
    id: "settings",
    label: "Settings",
    category: "View",
    description: "Adjust appearance, interface scale, viewport opacity and decorator display",
    aliases: [
      "preferences",
      "dark mode",
      "light mode",
      "system appearance",
      "user interface scale",
      "decorator display",
      "grid opacity",
      "section front opacity",
      "x-ray vision",
      "xray",
      "partial section opacity",
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
  const disposePreferences = refreshSettingsPreferences(editor, dialog);
  const disposeKeyboard = installSettingsKeyboard(requestOpen);
  update();
  return () => {
    disposeToolbox();
    disposeTool();
    disposePreferences();
    editor.world.changed.delete(update);
    disposeKeyboard();
    disposeHeader();
    button.remove();
    for (const section of dialog.querySelectorAll("section"))
      section.dispatchEvent(new Event("preferences-dispose"));
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

function trackSettingsHeader(
  editor: SketchEditor,
  app: HTMLElement,
  header: HTMLElement | null,
): () => void {
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
  return () => {
    headerObserver.disconnect();
    app.style.removeProperty("--editor-header-bottom");
  };
}

function refreshSettingsPreferences(editor: SketchEditor, dialog: HTMLDialogElement): () => void {
  const disposeScale = onUiScaleChange(() => {
    // Refit geometry-relative controls to their new measured dimensions.
    editor.world.draw();
  });
  const refreshPreferences = () => {
    editor.world.requestDraw();
    for (const panel of dialog.querySelectorAll(".view-display-settings"))
      panel.dispatchEvent(new Event("preferences-refresh"));
  };
  const disposeRadial = onRadialDimensionChange(() => {
    editor.world.requestDraw();
    dialog.dispatchEvent(new Event("preferences-refresh"));
  });
  const disposeGrid = onSketchGridPreferencesChange(refreshPreferences);
  const disposeView = onViewDisplayChange(refreshPreferences);
  const disposePlanes = onCanonicalPlanesChange(refreshPreferences);
  return () => {
    disposeScale();
    disposeRadial();
    disposeGrid();
    disposeView();
    disposePlanes();
  };
}
