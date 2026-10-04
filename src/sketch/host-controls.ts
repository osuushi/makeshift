import { installAgentDock } from "../agent/dock.js";
import { installInspection } from "../agent/inspection-view.js";
import { installScriptView } from "../agent-script/view.js";
import { installTabletChrome } from "../ipad/connection-screen.js";
import { installIPadButton } from "../ipad/desktop.js";
import type { SketchEditor } from "./editor.js";

export function installHostControls(editor: SketchEditor, app: HTMLElement): () => void {
  const disposeAgent = installAgentDock(app);
  const disposeInspection = installInspection(editor);
  installIPadButton(editor, app);
  installTabletChrome(app);
  const disposeScript = installScriptView(editor, app);
  return () => {
    disposeAgent();
    disposeInspection();
    disposeScript();
  };
}
