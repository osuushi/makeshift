import type {} from "../ipad/protocol.js";
import { initialTouchMode, type TouchMode } from "./touch-mode.js";

export type { TouchMode } from "./touch-mode.js";

const key = "makeshift.touch-control";
let saved: string | null = null;
try {
  saved = localStorage.getItem(key);
} catch {
  // Touch controls remain usable without browser storage.
}
let mode: TouchMode = initialTouchMode(navigator.platform, saved);

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
