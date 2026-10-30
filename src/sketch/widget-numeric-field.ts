/** A handle and its editable quantity are one keyboard stop. */
const fields = new WeakMap<Element, () => HTMLInputElement | null>();
export function bindWidgetField(
  handle: Element,
  field: HTMLInputElement | (() => HTMLInputElement | null),
): void {
  fields.set(handle, typeof field === "function" ? field : () => field);
}
export function widgetField(handle: Element): HTMLInputElement | null {
  return fields.get(handle)?.() ?? null;
}
