/** Displayed keys and keyboard dispatch share the same modeling bindings. */
const bindings = [
  ["extrude", "e", false],
  ["offset", "o", false],
  ["transform", "m", false],
  ["shell", "s", false],
  ["fillet", "f", false],
  ["chamfer", "f", true],
  ["revolve", "r", true],
  ["union", "u", true],
  ["subtract", "s", true],
  ["intersect", "i", true],
  ["loft", "l", false],
] as const;
type ModelingShortcut = (typeof bindings)[number][0];
const idleOnly = new Set<ModelingShortcut>(["union", "subtract", "intersect", "loft"]);

export function modelingShortcutLabel(id: ModelingShortcut | "erode"): string {
  const binding = bindings.find(([tool]) => tool === id);
  return binding ? `${binding[2] ? "⇧" : ""}${binding[1].toUpperCase()}` : "";
}

export function modelingShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey" | "repeat" | "isComposing"
  >,
  editing: boolean,
): ModelingShortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing)
    return null;
  const binding = bindings.find(
    ([id, key, shift]) =>
      key === event.key.toLowerCase() &&
      (shift === event.shiftKey || id === "offset" || id === "transform"),
  );
  if (!binding || (editing && idleOnly.has(binding[0]))) return null;
  return binding[0];
}
