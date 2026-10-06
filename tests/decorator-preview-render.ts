import * as THREE from "three";
import {
  DecoratorPreviewCompositor,
  decoratorPreviewLayer,
  type PreviewSurface,
} from "../src/decorators/preview-compositor.js";

export function previewRenderChecks() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
  renderer.setSize(64, 64);
  document.body.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("white");
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20);
  camera.position.z = 10;
  const light = new THREE.AmbientLight("white", 3);
  light.layers.enable(decoratorPreviewLayer);
  scene.add(light);
  const compositor = new DecoratorPreviewCompositor();
  const target = new THREE.WebGLRenderTarget(64, 64, { stencilBuffer: true });
  const support = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({ color: "white" }),
  );
  support.position.z = 1;
  support.userData.decoratorFace = "support";
  scene.add(support);
  const surface = (color: string, z: number): PreviewSurface => {
    const material = compositor.previewMaterial();
    material.color.set(color);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), material);
    mesh.layers.set(decoratorPreviewLayer);
    mesh.position.z = z;
    scene.add(mesh);
    return { mesh, faces: new Set(["support"]) };
  };
  const red = surface("red", 0),
    green = surface("lime", 0.4);
  green.mesh.visible = false;
  const pixel = pixelReader(renderer, target, compositor, scene, camera);
  try {
    const revealed = pixel([red]);
    if (revealed[0] < revealed[1] + 50)
      throw new Error(`Recessed preview remains occluded: ${revealed}`);
    const faded = checkOpacity(red, pixel, revealed);
    const coincident = checkCoplanarFace(scene, red, pixel);
    const blocker = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({ color: "blue" }),
    );
    blocker.position.z = 2;
    scene.add(blocker);
    const blocked = pixel([red]);
    if (blocked[2] < 240 || blocked[0] > 10) throw new Error(`Foreground blocker lost: ${blocked}`);
    blocker.position.z = 0.5;
    const hiddenBlocker = pixel([red]);
    if (hiddenBlocker.slice(0, 3).some((v) => v < 250))
      throw new Error(`Occluder behind own support lost: ${hiddenBlocker}`);
    blocker.visible = false;
    const results = checkLayers(renderer, camera, support, red, green, pixel);
    target.setSize(96, 80);
    renderer.setSize(96, 80);
    const resized = pixel([red], 48, 40);
    if (resized[0] < resized[1] + 50) throw new Error(`Resize lost preview: ${resized}`);
    if (renderer.getContext().getError() !== 0) throw new Error("WebGL error");
    blocker.geometry.dispose();
    blocker.material.dispose();
    return { revealed, faded, coincident, blocked, hiddenBlocker, resized, ...results };
  } finally {
    disposeMeshes(scene);
    target.dispose();
    compositor.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }
}

function pixelReader(
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  compositor: DecoratorPreviewCompositor,
  scene: THREE.Scene,
  camera: THREE.Camera,
) {
  return (surfaces: PreviewSurface[], x = 32, y = 32) => {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const background = scene.background,
      clip = renderer.clippingPlanes;
    compositor.render(renderer, scene, camera, surfaces);
    if (
      renderer.getRenderTarget() !== target ||
      scene.background !== background ||
      renderer.clippingPlanes !== clip ||
      camera.layers.mask !== 1 ||
      !renderer.autoClear
    )
      throw new Error("Compositor did not restore renderer state");
    const bytes = new Uint8Array(4);
    renderer.readRenderTargetPixels(target, x, y, 1, 1, bytes);
    return [...bytes];
  };
}

function checkCoplanarFace(
  scene: THREE.Scene,
  surface: PreviewSurface,
  pixel: (surfaces: PreviewSurface[]) => number[],
) {
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({
      color: "white",
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
  face.userData.decoratorFace = "neighbor";
  face.position.copy(surface.mesh.position);
  face.rotation.y = surface.mesh.rotation.y = 0.35;
  scene.add(face);
  try {
    surface.clipPlanes = [
      new THREE.Plane(new THREE.Vector3(0, 0, -1).applyQuaternion(surface.mesh.quaternion), -1e-6),
    ];
    const coincident = pixel([surface]);
    if (coincident.slice(0, 3).some((value) => value < 250))
      throw new Error(`Thread profile leaked through its adjacent coplanar face: ${coincident}`);
    surface.clipPlanes = undefined;
    face.position.z -= 0.01;
    const protruding = pixel([surface]);
    if (protruding[0] < protruding[1] + 50)
      throw new Error(`A profile in front of the adjacent face was lost: ${protruding}`);
    if (!face.material.polygonOffset) throw new Error("Face display offset was not restored");
    return coincident;
  } finally {
    surface.clipPlanes = undefined;
    surface.mesh.rotation.y = 0;
    scene.remove(face);
    face.geometry.dispose();
    face.material.dispose();
  }
}

function checkOpacity(
  surface: PreviewSurface,
  pixel: (surfaces: PreviewSurface[]) => number[],
  revealed: number[],
): number[] {
  surface.opacity = 0.5;
  const faded = pixel([surface]);
  if (faded[1] <= revealed[1] + 15 || faded[1] >= 250)
    throw new Error(`Preview opacity did not blend over the support: ${revealed}; ${faded}`);
  surface.opacity = 1;
  return faded;
}

function disposeMeshes(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  });
}

function checkLayers(
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  support: THREE.Mesh,
  red: PreviewSurface,
  green: PreviewSurface,
  pixel: (surfaces: PreviewSurface[], x?: number, y?: number) => number[],
) {
  support.visible = false;
  green.mesh.visible = true;
  red.mesh.visible = false;
  const single = pixel([green]);
  red.mesh.visible = true;
  const forward = pixel([red, green]),
    reverse = pixel([green, red]);
  if (String(single) !== String(forward) || String(single) !== String(reverse))
    throw new Error(
      `Preview overlap depends on order or accumulates alpha: ${single}; ${forward}; ${reverse}`,
    );
  green.mesh.visible = false;
  renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)];
  const clipped = pixel([red], 20, 32),
    retained = pixel([red], 44, 32);
  if (clipped.slice(0, 3).some((v) => v < 250) || retained[0] < retained[1] + 50)
    throw new Error(`Clipping mismatch: ${clipped}; ${retained}`);
  renderer.clippingPlanes = [];
  camera.layers.set(0);
  return { single, forward, reverse, clipped, retained };
}
