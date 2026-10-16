/** iPad Safari advertises MacIntel in desktop browsing mode. */
export function iosToolSearch(
  platform = navigator.platform,
  touchPoints = navigator.maxTouchPoints,
): boolean {
  return /iPhone|iPad|iPod/.test(platform) || (platform === "MacIntel" && touchPoints > 1);
}

export function toolSearchKey(): string {
  return iosToolSearch() ? "⌘P" : "⌘F";
}

/** Cmd-P is also a Mac alternate; Ctrl-P keeps the browser's Print command. */
export function toolSearchShortcut(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">,
  ios = iosToolSearch(),
): boolean {
  if (event.altKey) return false;
  const key = event.key.toLowerCase();
  return (
    (event.metaKey && key === "p") || (!ios && (event.metaKey || event.ctrlKey) && key === "f")
  );
}
