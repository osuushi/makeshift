import type * as THREE from "three";

export const sketchGridLayer = 6;

/** Present the active grid once, after section fills and X-ray composition. */
export function renderSketchGrid(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): void {
  if (!scene.children.some((object) => object.visible && object.layers.isEnabled(sketchGridLayer)))
    return;
  const background = scene.background;
  const layers = camera.layers.mask;
  const clipping = renderer.clippingPlanes;
  const autoClear = renderer.autoClear;
  try {
    scene.background = null;
    camera.layers.set(sketchGridLayer);
    renderer.clippingPlanes = [];
    renderer.autoClear = false;
    renderer.render(scene, camera);
  } finally {
    scene.background = background;
    camera.layers.mask = layers;
    renderer.clippingPlanes = clipping;
    renderer.autoClear = autoClear;
  }
}
