export type TouchMode = "camera" | "pointer";

/** Start phone sessions ready for finger editing, preserving explicit choices. */
export function initialTouchMode(platform: string, saved: string | null): TouchMode {
  if (saved === "camera" || saved === "pointer") return saved;
  return /iPhone|iPod/.test(platform) ? "pointer" : "camera";
}
