import type { ToolResult } from "./catalog.js";
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
  const artwork = document.createElement("div");
  artwork.className = group ? "navigator-examples" : "navigator-artwork";
  if (group) {
    for (const example of navigatorExamples(id)) {
      const figure = document.createElement("figure");
      const caption = document.createElement("figcaption");
      caption.textContent = tools.get(example)?.label ?? example;
      figure.append(toolDiagram(example), caption);
      artwork.append(figure);
    }
    button.setAttribute(
      "aria-description",
      `Examples: ${navigatorExamples(id)
        .map((key) => tools.get(key)?.label ?? key)
        .join(", ")}`,
    );
  } else artwork.append(toolDiagram(id));
  const target = document.createElement("span");
  target.className = "navigator-target";
  target.setAttribute("aria-hidden", "true");
  const detail = document.createElement("span");
  detail.className = "navigator-detail";
  detail.textContent = group ? "Explore tools" : (tool?.unavailable ?? diagramCaption(id));
  button.setAttribute("aria-disabled", String(!group && (!tool || !!tool.unavailable)));
  if (!group) button.setAttribute("aria-description", detail.textContent);
  button.append(artwork, target, detail);
  return button;
}
