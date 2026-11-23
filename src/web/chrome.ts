import type { BrowserDocuments } from "../model/browser-documents.js";
import { installControlMenu } from "../sketch/control-menu.js";
import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { installWebAgent } from "./agent-tab.js";

export function installWebChrome(
  editor: SketchEditor,
  app: HTMLElement,
  documents: BrowserDocuments,
): () => void {
  installControlMenu(app);
  const disposeAgent = installWebAgent(editor, app, documents);
  const disposeLicense = toolCatalog(editor).register({
    id: "licenses",
    label: "Third-party licenses",
    category: "Document & Edit",
    showInTools: false,
    reason: () => null,
    run: () => {
      window.open(new URL("./licenses/", location.href), "_blank", "noopener");
    },
  });
  return () => {
    disposeLicense();
    disposeAgent();
  };
}
