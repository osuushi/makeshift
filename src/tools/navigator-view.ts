import type { ToolResult } from "./catalog.js";
import { unavailableHelp } from "./navigator-availability.js";
import { diagramCaption } from "./navigator-captions.js";
import { toolDiagram } from "./navigator-diagrams.js";
import { navigatorExamples, navigatorGroups } from "./navigator-tree.js";

export function navigatorCard(id: string, tools: Map<string, ToolResult>): HTMLButtonElement {
  const group = navigatorGroups[id];
  const tool = tools.get(id);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "navigator-card";
  button.dataset.entry = id;
  const title = document.createElement("strong");
  title.textContent = group?.label ?? tool?.label ?? id;
  button.setAttribute("aria-label", title.textContent);
  button.append(title);
  button.setAttribute("aria-disabled", String(!group && (!tool || !!tool.unavailable)));
  const unavailable = group
    ? navigatorExamples(id).every((key) => !tools.get(key) || !!tools.get(key)?.unavailable)
    : !tool || !!tool.unavailable;
  button.dataset.unavailable = String(unavailable);
  if (group) {
    button.classList.add("navigator-group");
    const examples = navigatorExamples(id);
    const summary = document.createElement("span");
    summary.className = "navigator-summary";
    summary.textContent =
      examples
        .slice(0, 3)
        .map((key) => tools.get(key)?.label ?? key)
        .join(", ") + (examples.length > 3 ? " …" : "");
    button.setAttribute("aria-description", summary.textContent);
    button.append(summary);
    if (unavailable) {
      const notice = document.createElement("span");
      notice.className = "navigator-detail";
      notice.textContent = "No tools available right now. Open to see what they require.";
      button.append(notice);
      button.setAttribute("aria-description", `${summary.textContent}. ${notice.textContent}`);
    }
  } else {
    const artwork = document.createElement("div");
    artwork.className = "navigator-artwork";
    artwork.append(toolDiagram(id));
    const detail = document.createElement("span");
    detail.className = "navigator-detail";
    detail.textContent = tool?.unavailable
      ? unavailableHelp(tool.unavailable)
      : tool
        ? diagramCaption(id)
        : "This tool is not available in this build.";
    button.setAttribute("aria-description", detail.textContent);
    button.append(artwork, detail);
  }
  return button;
}
