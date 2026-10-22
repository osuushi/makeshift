import type { SketchEditor } from "../sketch/editor.js";
import { ToolMenu } from "./menu.js";
import { Toolbox } from "./toolbox.js";
export function installToolSurfaces(
  editor: SketchEditor,
  app: HTMLElement,
  entities: HTMLElement,
): () => void {
  let footer!: HTMLElement;
  const toolbox = new Toolbox(editor, app, entities, (host) => {
    footer = host;
  });
  const search = new ToolMenu(editor, app);
  search.mountTrigger(footer);
  return () => {
    search.dispose();
    toolbox.dispose();
  };
}
