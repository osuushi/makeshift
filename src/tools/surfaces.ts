import type { SketchEditor } from "../sketch/editor.js";
import { ToolMenu } from "./menu.js";
import { ToolNavigator } from "./navigator.js";
import { Toolbox } from "./toolbox.js";

/** Install discovery surfaces together, with navigator pointer capture before search. */
export function installToolSurfaces(
  editor: SketchEditor,
  app: HTMLElement,
  entities: HTMLElement,
): () => void {
  const navigator = new ToolNavigator(editor, app);
  const search = new ToolMenu(editor, app);
  const toolbox = new Toolbox(editor, app, entities, (host) => {
    navigator.mountTrigger(host);
    search.mountTrigger(host);
  });
  return () => {
    navigator.dispose();
    search.dispose();
    toolbox.dispose();
  };
}
