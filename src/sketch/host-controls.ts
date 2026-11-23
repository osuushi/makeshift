import { installAgentDock } from "../agent/dock.js";
import { installInspection } from "../agent/inspection-view.js";
import { installPreviewPane } from "../agent/preview-pane.js";
import { installScriptView } from "../agent-script/view.js";
import type { WorkspacePanes } from "../panes/workspace.js";
import { installControlMenu } from "./control-menu.js";
import type { SketchEditor } from "./editor.js";

export function installHostControls(
  editor: SketchEditor,
  app: HTMLElement,
  panes: WorkspacePanes,
): () => void {
  const disposePreview = installPreviewPane(panes);
  const disposeAgent = installAgentDock(app);
  const disposeInspection = installInspection(editor);
  installControlMenu(app);
  const disposeScript = installScriptView(editor, app);
  return () => {
    disposeAgent();
    disposePreview();
    disposeInspection();
    disposeScript();
  };
}
