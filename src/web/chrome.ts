import { installControlMenu } from "../sketch/control-menu.js";
import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";

export function installWebChrome(editor: SketchEditor, app: HTMLElement): () => void {
  installControlMenu(app);
  return toolCatalog(editor).register({
    id: "licenses",
    label: "Third-party licenses",
    category: "Document & Edit",
    showInTools: false,
    reason: () => null,
    run: () => {
      window.open(new URL("./licenses/", location.href), "_blank", "noopener");
    },
  });
}
