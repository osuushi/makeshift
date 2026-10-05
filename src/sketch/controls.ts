import { fileControls } from "../model/file-controls.js";
import { fixtureControls } from "../model/fixture-controls.js";
import { toolCatalog } from "../tools/catalog.js";
import { sketchTools } from "../tools/sketch-tools.js";
import { StandardCommandMenu } from "../tools/standard-command-menu.js";
import type { SketchEditor } from "./editor.js";
import { onModelKeydown } from "./model-keys.js";
import type { NumericEdit } from "./numeric-edit.js";
import { focusNumericField } from "./numeric-focus.js";

export function installControls(
  editor: SketchEditor,
  numeric: NumericEdit,
  app: HTMLElement,
): () => void {
  const disposeTools = sketchTools(editor);
  const disposeFiles = fileControls(editor, app);
  const disposeFixtures =
    import.meta.env.DEV || window.makeshiftFixture ? fixtureControls(editor, app) : () => {};
  const abort = installShortcuts(editor, numeric, app);
  const standardMenu = new StandardCommandMenu(editor);
  window.addEventListener(
    "blur",
    () => {
      if (editor.interactions.current?.captured) editor.interactions.requestCancel();
    },
    { signal: abort.signal },
  );
  return () => {
    abort.abort();
    standardMenu.dispose();
    disposeTools();
    disposeFiles();
    disposeFixtures();
  };
}
function installShortcuts(
  editor: SketchEditor,
  numeric: NumericEdit,
  app: HTMLElement,
): AbortController {
  const abort = new AbortController();
  onModelKeydown(
    (event) => {
      if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.defaultPrevented) return;
        if (editor.moveMode && editor.sketch && !editor.interactions.current) {
          event.preventDefault();
          void numeric.focusTransform(event.shiftKey);
        } else if (focusNumericField(app, event.shiftKey)) event.preventDefault();
        return;
      }
      const input =
        event.target instanceof HTMLElement &&
        (event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          event.target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !input) {
        event.preventDefault();
        void toolCatalog(editor).invoke(event.shiftKey ? "redo" : "undo");
        return;
      }
      if (
        !input &&
        (event.metaKey || event.ctrlKey) &&
        (event.code === "KeyA" || event.key.toLowerCase() === "a")
      ) {
        if (event.altKey && event.shiftKey) return;
        event.preventDefault();
        void toolCatalog(editor).invoke(
          event.altKey
            ? "select-all-sketches"
            : event.shiftKey
              ? "select-all-bodies"
              : "select-all-entities",
        );
        return;
      }
      if (input || event.metaKey || event.ctrlKey) return;
      if (event.key === "Escape") {
        event.preventDefault();
        editor.escape();
        return;
      }
      if (event.altKey) return;
      const tool = (
        {
          r: "rectangle",
          b: "bezier",
          l: "line",
          c: "circle",
          t: "trim",
          m: "transform",
          v: "select",
        } as Record<string, string>
      )[event.key.toLowerCase()];
      // Modeling owns L, including while a local solid tool is active.
      if (tool === "line" && !editor.world.active) return;
      if (tool && (!event.shiftKey || tool !== "rectangle")) {
        event.preventDefault();
        void toolCatalog(editor).invoke(tool);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void toolCatalog(editor).invoke("delete");
        return;
      }
      if (/^[0-9.]$/.test(event.key) && !editor.blocked) {
        event.preventDefault();
        numeric.focusFirst(event.key);
      }
    },
    { signal: abort.signal },
  );
  return abort;
}
