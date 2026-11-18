import type { SketchEditor } from "../sketch/editor.js";
import { ToolMenu } from "./menu.js";
import { Toolbox } from "./toolbox.js";
export function installToolSurfaces(
  editor: SketchEditor,
  app: HTMLElement,
  pane: HTMLElement,
): () => void {
  let footer!: HTMLElement;
  const toolbox = new Toolbox(editor, pane, (host) => {
    footer = host;
  });
  app.querySelector(".toolbar-preferences")?.prepend(toolbox.activeToolLabel);
  const search = new ToolMenu(editor, app, toolbox.close);
  search.mountTrigger(footer);
  return () => {
    search.dispose();
    toolbox.dispose();
  };
}
