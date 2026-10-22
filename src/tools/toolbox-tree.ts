export type ToolboxItem = string | ToolboxGroup;
export interface ToolboxGroup {
  items: ToolboxItem[];
  selected: number;
  /** Named menus open without invoking or remembering a descendant. */
  title?: string;
}
export type ToolboxPath = number[];
export type ToolboxDrop = "before" | "after" | "inside";
export function toolboxGroup(...items: ToolboxItem[]): ToolboxGroup {
  return { items, selected: 0 };
}
export function toolboxLeaf(item: ToolboxItem): string {
  if (typeof item === "string") return item;
  const selected = item.items[item.selected] ?? item.items[0];
  return selected === undefined ? "" : toolboxLeaf(selected);
}
export function toolboxItem(root: ToolboxGroup, path: ToolboxPath): ToolboxItem | undefined {
  let item: ToolboxItem = root;
  for (const index of path) {
    if (typeof item === "string") return undefined;
    item = item.items[index];
    if (item === undefined) return undefined;
  }
  return item;
}
export function toolboxLeaves(item: ToolboxItem): string[] {
  return typeof item === "string" ? [item] : item.items.flatMap(toolboxLeaves);
}
export function selectToolboxPath(root: ToolboxGroup, path: ToolboxPath): ToolboxGroup {
  const next = structuredClone(root);
  let group = next;
  for (const index of path) {
    if (group.title) return root;
    const item = group.items[index];
    if (item === undefined || (typeof item !== "string" && item.title)) return root;
    group.selected = index;
    if (typeof item === "string") break;
    group = item;
  }
  return next;
}
/** Move ownership, never copy. Destination references survive removal and index changes. */
export function moveToolboxItem(
  root: ToolboxGroup,
  from: ToolboxPath,
  to: ToolboxPath,
  drop: ToolboxDrop,
): ToolboxGroup {
  if (!from.length || (from.length <= to.length && from.every((v, i) => to[i] === v))) return root;
  const next = structuredClone(root);
  const source = toolboxItem(next, from);
  const target = toolboxItem(next, to);
  const parent = toolboxItem(next, from.slice(0, -1));
  const targetParent = toolboxItem(next, to.slice(0, -1));
  if (
    source === undefined ||
    target === undefined ||
    !parent ||
    typeof parent === "string" ||
    !targetParent ||
    typeof targetParent === "string"
  )
    return root;
  // Remember selected objects, not indices, while arrays are edited.
  const selected = new Map<ToolboxGroup, ToolboxItem>();
  const remember = (g: ToolboxGroup) => {
    selected.set(g, g.items[g.selected]);
    for (const i of g.items) if (typeof i !== "string") remember(i);
  };
  remember(next);
  parent.items.splice(from.at(-1) as number, 1);
  if (drop === "inside" && typeof target !== "string") target.items.push(source);
  else {
    const index = targetParent.items.indexOf(target);
    if (index < 0) return root;
    if (drop === "inside") {
      const group = toolboxGroup(target, source);
      targetParent.items.splice(index, 1, group);
      if (selected.get(targetParent) === target) selected.set(targetParent, group);
    } else targetParent.items.splice(index + (drop === "after" ? 1 : 0), 0, source);
  }
  const clean = (g: ToolboxGroup): ToolboxItem | null => {
    const previous = selected.get(g);
    const replacements = new Map<ToolboxItem, ToolboxItem | null>();
    for (const item of g.items)
      replacements.set(item, typeof item === "string" ? item : clean(item));
    g.items = g.items.flatMap((item) => {
      const value = replacements.get(item);
      return value == null ? [] : [value];
    });
    g.selected = Math.max(
      0,
      g.items.indexOf(replacements.get(previous as ToolboxItem) ?? (previous as ToolboxItem)),
    );
    if (g.title) return g;
    return g.items.length === 0 ? null : g.items.length === 1 ? g.items[0] : g;
  };
  clean(next);
  return next;
}
/** Reject malformed trees and aliases before accepting device preferences. */
export function validToolboxTree(value: unknown): value is ToolboxGroup {
  const seen = new Set<string>();
  let nodes = 0;
  const visit = (item: unknown, depth: number): boolean => {
    if (++nodes > 1000 || depth > 20) return false;
    if (typeof item === "string") {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    }
    if (!item || typeof item !== "object") return false;
    const g = item as ToolboxGroup;
    return (
      Array.isArray(g.items) &&
      (g.title === undefined ||
        (typeof g.title === "string" && !!g.title.trim() && g.title.length <= 80)) &&
      (g.items.length > 0 || !!g.title) &&
      Number.isInteger(g.selected) &&
      g.selected >= 0 &&
      (g.selected < g.items.length || (g.items.length === 0 && g.selected === 0)) &&
      g.items.every((i) => visit(i, depth + 1))
    );
  };
  return typeof value === "object" && value !== null && visit(value, 0);
}

export function findToolboxPath(root: ToolboxGroup, id: string): ToolboxPath | undefined {
  for (const [index, item] of root.items.entries()) {
    if (item === id) return [index];
    if (typeof item !== "string") {
      const nested = findToolboxPath(item, id);
      if (nested) return [index, ...nested];
    }
  }
  return undefined;
}
