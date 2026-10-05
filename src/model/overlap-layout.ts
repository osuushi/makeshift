import { uiScale } from "../preferences/ui-scale.js";

/** Fit complete choices into the viewport; excess depth-sorted choices are omitted. */
export function fitOverlapChoices(root: HTMLElement): HTMLButtonElement[] {
  const list = root.querySelector<HTMLElement>(".selection-overlap-items");
  if (!list) return [];
  const buttons = [...list.querySelectorAll("button")];
  const scale = uiScale();
  const availableWidth = Math.max(0, innerWidth - 16);
  const maxColumns = Math.max(1, Math.floor((availableWidth - 14 * scale) / (152 * scale)));
  let columns = Math.min(maxColumns, Math.max(3, Math.ceil(Math.sqrt(buttons.length * 1.5))));
  const size = () => {
    root.style.width = `${Math.min(availableWidth, (columns * 152 + 14) * scale)}px`;
    list.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
  };
  size();
  const rowHeight = buttons[0]?.getBoundingClientRect().height ?? 0;
  const headerHeight = list.getBoundingClientRect().top - root.getBoundingClientRect().top;
  const rows = Math.max(
    0,
    Math.floor((innerHeight - 16 - headerHeight - 3 * scale) / (rowHeight + 8 * scale)),
  );
  if (rows > 0) columns = Math.min(maxColumns, Math.max(columns, Math.ceil(buttons.length / rows)));
  size();
  const omitted = buttons.slice(columns * rows);
  for (const button of omitted) button.remove();
  return omitted;
}
