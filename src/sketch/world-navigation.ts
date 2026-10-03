import { panCamera } from "./camera-motion.js";
import { installOrbitDrag } from "./orbit-input.js";
import { installOrientationCube } from "./orientation-cube.js";
import { installTabletInput } from "./tablet-input.js";
import { installTrackpad } from "./trackpad-input.js";
import { TrackpadSnap } from "./trackpad-snap.js";
import type { World } from "./world.js";

export function installNavigation(world: World): () => void {
  const canvas = world.canvas;
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const snap = new TrackpadSnap(world, abort.signal);
  world.navigation.stopCompletion = () => snap.stop();
  const removeCube = installOrientationCube(world);
  installTabletInput(world, abort.signal);
  let drag: { id: number; x: number; y: number } | null = null;
  for (const surface of [canvas, world.overlay])
    surface.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button === 0) return;
        if ((event.button !== 1 && event.button !== 2) || drag || !world.canNavigate()) return;
        event.preventDefault();
        event.stopPropagation();
        world.navigation.hold("pan");
        world.cancelCameraMotion();
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
      },
      { ...options, capture: true },
    );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) < 1) return;
      panCamera(world, dx, dy, canvas.clientHeight);
      drag.x = event.clientX;
      drag.y = event.clientY;
      world.requestDraw();
    },
    options,
  );
  const stop = () => {
    const id = drag?.id;
    drag = null;
    if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    if (id !== undefined) world.navigation.release("pan");
  };
  canvas.addEventListener("pointerup", stop, options);
  canvas.addEventListener("pointercancel", stop, options);
  canvas.addEventListener("lostpointercapture", stop, options);
  window.addEventListener("blur", stop, options);
  for (const surface of [canvas, world.overlay])
    surface.addEventListener("contextmenu", (event) => event.preventDefault(), options);
  installOrbitDrag(world, abort.signal);
  installTrackpad(world, abort.signal, snap);
  return () => {
    stop();
    removeCube();
    abort.abort();
  };
}
