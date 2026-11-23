import { dockLayout } from "../agent/dock-layout.js";
import "../agent/style.css";
import "./agent-tab.css";
import type { BrowserDocuments } from "../model/browser-documents.js";
import type { SketchEditor } from "../sketch/editor.js";
import { installSiteTools } from "./site-tools.js";

export function installWebAgent(
  editor: SketchEditor,
  app: HTMLElement,
  documents: BrowserDocuments,
) {
  const panel = document.createElement("section");
  panel.className = "agent-dock web-agent";
  panel.dataset.focus = "controls";
  panel.setAttribute("aria-label", "Agent");
  panel.innerHTML = `<div class="agent-header"><button type="button" data-collapse aria-controls="agent-guide" aria-expanded="false">Agent</button></div>
    <div class="agent-body" id="agent-guide"><h3>Use your agent with this drawing</h3>
    <ol><li>Open Makeshift in your agent’s WebMCP-enabled browser. For example, ask Codex desktop to open <strong>web.makeshift.horse</strong> in its built-in browser.</li>
    <li>Open or import your drawing in that tab. Allow site tools if your browser asks.</li>
    <li>Try asking, “Use <code>makeshift_run</code> to make a cylinder 20 mm across and 30 mm tall.” Your agent can also use <code>makeshift_workspace</code> to keep scripts and notes in the drawing.</li></ol>
    <p role="status"></p></div>`;
  document.body.append(panel);
  const layout = dockLayout(panel, app);
  const toggle = panel.querySelector("button");
  if (!toggle) throw new Error("Missing Agent tab.");
  toggle.onclick = () => {
    const open = toggle.getAttribute("aria-expanded") === "false";
    toggle.setAttribute("aria-expanded", String(open));
    layout.collapse(!open);
  };
  const progress = document.createElement("div");
  progress.className = "calculation-progress";
  progress.hidden = true;
  progress.innerHTML =
    '<span class="calculation-spinner" aria-hidden="true"></span><span>Running agent script…</span><button type="button">Cancel script</button>';
  app.append(progress);
  const status = panel.querySelector<HTMLElement>("[role=status]");
  const cancel = progress.querySelector("button");
  if (!status || !cancel) throw new Error("Missing Agent controls.");
  const dispose = installSiteTools(editor, documents, status, progress, cancel);
  return () => {
    dispose();
    layout.dispose();
    progress.remove();
    panel.remove();
  };
}
