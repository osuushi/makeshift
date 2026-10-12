import type {} from "../ipad/protocol.js";

export type TouchMode = "camera" | "pointer";

const key = "makeshift.touch-control";
let mode: TouchMode = "camera";
try {
  if (localStorage.getItem(key) === "pointer") mode = "pointer";
} catch {
  // Touch controls remain usable without browser storage.
}

export function hasTouchControls(): boolean {
  return Boolean(window.makeshiftRemote) || navigator.maxTouchPoints > 0;
}

export function touchMode(): TouchMode {
  return mode;
}

export function setTouchMode(value: TouchMode): void {
  mode = value;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Keep the preference for this window when persistence is unavailable.
  }
}
