export type Side = "left" | "right";
export type Place = Side | "floating";
export interface Placement {
  place: Place;
  height: number;
  width: number;
  x: number;
  y: number;
  folded: boolean;
  hidden: boolean;
  autoHide: boolean;
  before?: string;
  after?: string;
  rank?: number;
}

export function placement(raw: unknown, defaults: Placement): Placement {
  const state = { ...defaults };
  if (!raw || typeof raw !== "object") return state;
  const values = raw as Partial<Placement>;
  if (values.place === "left" || values.place === "right" || values.place === "floating")
    state.place = values.place;
  for (const k of ["width", "height", "x", "y", "rank"] as const)
    if (typeof values[k] === "number" && Number.isFinite(values[k])) state[k] = values[k];
  for (const k of ["folded", "autoHide", "hidden"] as const)
    if (typeof values[k] === "boolean") state[k] = values[k];
  for (const k of ["before", "after"] as const)
    if (typeof values[k] === "string") state[k] = values[k];
  return state;
}

/** Document panes anchor only to global panes, which survive document switches. */
export function insertion(order: string[], before?: string, after?: string): number {
  const index = before === undefined ? -1 : order.indexOf(before);
  if (before !== undefined && index < 0) return order.length;
  return order[index + 1] === after ? index + 1 : order.length;
}

export function preference<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(`makeshift.panes.${key}`) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function remember(key: string, value: unknown) {
  try {
    localStorage.setItem(`makeshift.panes.${key}`, JSON.stringify(value));
  } catch {
    // Keep the session layout when storage is unavailable.
  }
}
