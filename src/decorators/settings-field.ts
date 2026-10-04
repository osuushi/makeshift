import { toolMenuOpen } from "../tools/menu-focus.js";
import type { DecoratorField, DecoratorInstance, Settings } from "./types.js";

/** Field lifecycle shared by accepted numeric edits and provisional application. */
export interface DecoratorFieldDraft {
  blur(): Promise<void>;
  commit(): Promise<boolean>;
  cancel(): void;
}

export function decoratorField(
  root: HTMLElement,
  schema: DecoratorField,
  instances: DecoratorInstance[],
  patch: (patch: Settings, preview: boolean) => unknown,
  draft: DecoratorFieldDraft,
) {
  const values = instances.map((d) => d.settings[schema.key] ?? schema.default);
  const mixed = values.some((v) => v !== values[0]);
  const label = document.createElement("label");
  label.textContent = schema.label + (schema.unit ? ` (${schema.unit})` : "");
  const input =
    schema.type === "enum" ? document.createElement("select") : document.createElement("input");
  input.setAttribute("aria-label", schema.label);
  if (input instanceof HTMLSelectElement) {
    if (mixed) input.add(new Option("Mixed", ""));
    for (const option of schema.options ?? []) input.add(new Option(option.label, option.value));
  } else {
    input.type = "number";
    input.step = "any";
    input.placeholder = mixed ? "Mixed" : "";
    if (schema.min !== undefined) input.min = String(schema.min);
    if (schema.max !== undefined) input.max = String(schema.max);
  }
  const original = mixed ? "" : String(values[0]);
  input.value = original;
  if (input instanceof HTMLInputElement) {
    input.oninput = () => patch({ [schema.key]: input.valueAsNumber }, true);
    input.onblur = (event) => {
      if (toolMenuOpen()) return;
      // The requested discrete action owns acceptance, before reading fresh settings.
      if (
        event.relatedTarget instanceof Element &&
        event.relatedTarget.matches("select, button") &&
        event.relatedTarget.closest(".decorator-panel")
      )
        return;
      void draft.blur();
    };
  } else {
    input.onchange = async () => {
      if ((await patch({ [schema.key]: input.value }, false)) === false) input.value = original;
    };
  }
  input.onkeydown = (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      draft.cancel();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void draft.commit();
    }
  };
  label.append(input);
  root.append(label);
}
