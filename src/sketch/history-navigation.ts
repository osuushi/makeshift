import type { CameraState } from "../model/camera-state.js";
import type { HistorySelection } from "./history-selection.js";

/** Transient view context; never saved document geometry or a navigation replay command. */
export interface HistoryNavigation {
  camera: CameraState;
  selection: HistorySelection;
}
export interface NavigationChange {
  navigation: { before: HistoryNavigation; after: HistoryNavigation };
}

/** Ignore pose roundoff at the viewport scale, not changes in view. */
export function sameNavigation(a: HistoryNavigation, b: HistoryNavigation): boolean {
  if (JSON.stringify(a.selection) !== JSON.stringify(b.selection)) return false;
  const scale = Math.max(
    1,
    a.camera.height,
    b.camera.height,
    Math.hypot(...a.camera.position.map((n, i) => n - a.camera.target[i])),
    Math.hypot(...b.camera.position.map((n, i) => n - b.camera.target[i])),
  );
  const near = (x: number, y: number, tolerance: number) => Math.abs(x - y) <= tolerance;
  return (
    near(a.camera.height, b.camera.height, scale * 1e-10) &&
    a.camera.position.every((n, i) => near(n, b.camera.position[i], scale * 1e-10)) &&
    a.camera.target.every((n, i) => near(n, b.camera.target[i], scale * 1e-10)) &&
    a.camera.up.every((n, i) => near(n, b.camera.up[i], 1e-10))
  );
}
