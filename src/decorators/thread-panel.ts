import { type DecoratorFieldDraft, decoratorField } from "./settings-field.js";
import { threadFields } from "./thread-settings.js";
import type { DecoratorInstance, Settings } from "./types.js";

export function appendThreadSettings(
  root: HTMLElement,
  instances: DecoratorInstance[],
  patch: (settings: Settings, preview: boolean) => void,
  draft: DecoratorFieldDraft,
  advancedOpen: boolean,
): void {
  const advanced = document.createElement("details");
  advanced.className = "thread-advanced";
  advanced.open = advancedOpen;
  const summary = document.createElement("summary");
  summary.textContent = "Advanced";
  advanced.append(summary);
  for (const field of threadFields) {
    if (
      field.visibleWhen &&
      !instances.some((d) => field.visibleWhen?.values.includes(d.settings[field.visibleWhen.key]))
    )
      continue;
    const basic = ["preset", "hand", "cut", "clearance"].includes(field.key);
    decoratorField(basic ? root : advanced, field, instances, patch, draft);
    if (field.key === "clearance") {
      const hint = document.createElement("p");
      hint.className = "thread-clearance-hint";
      hint.textContent =
        "Moves hole threads outward, away from the rod. FDM fine starts at 0.25 mm; adjust for your printer and orientation.";
      root.append(hint);
    }
  }
  root.append(advanced);
}
