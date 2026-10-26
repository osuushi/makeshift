import * as THREE from "three";
import {
  DecoratorPreviewCompositor,
  decoratorPreviewLayer,
  type PreviewSurface,
} from "../src/decorators/preview-compositor.js";
import { setViewDisplay, viewDisplay } from "../src/preferences/view-display.js";
import { BodyXrayComposite } from "../src/sketch/body-xray-composite.js";
import type { World } from "../src/sketch/world.js";

/** Exercise actual decorator passes inside both body captures, including their opacity. */
export function bodyXrayLayerChecks() {
  const original = viewDisplay();
  const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: true });
  renderer.setSize(128, 96);
  document.body.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("white");
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 30);
  camera.position.z = 10;
  const light = new THREE.AmbientLight("white", 3);
  light.layers.enable(decoratorPreviewLayer);
  scene.add(light);
  const decorators = new DecoratorPreviewCompositor();
  const xray = new BodyXrayComposite();
  const surfaces: PreviewSurface[] = [];
  for (const [id, z, color] of [
    ["front", 1, "red"],
    ["rear", 0, "lime"],
  ] as const) {
    const group = new THREE.Group();
    group.userData.xrayBody = id === "front" ? id : null;
    const body = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ color: "white" }),
    );
    body.position.z = z;
    body.userData.bodyFace = { body: id, face: "face" };
    body.userData.bodyMaskGeometry = [Array.from(body.geometry.getAttribute("position").array)];
    body.userData.decoratorFace = `${id}/face`;
    group.add(body);
    scene.add(group);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), decorators.previewMaterial());
    mesh.material.color.set(color);
    mesh.position.z = z + 0.1;
    mesh.userData.body = id;
    mesh.layers.set(decoratorPreviewLayer);
    scene.add(mesh);
    surfaces.push({ mesh, faces: new Set([`${id}/face`]), displayOpacity: 0.6 });
  }
  const world = { renderer, scene, camera, canvas: renderer.domElement } as unknown as World;
  const target = new THREE.WebGLRenderTarget(128, 96, { stencilBuffer: true });
  const pixel = () => {
    renderer.setRenderTarget(target);
    xray.render(world, () => {
      renderer.render(scene, camera);
      decorators.render(renderer, scene, camera, surfaces);
    });
    const bytes = new Uint8Array(4);
    renderer.readRenderTargetPixels(target, 64, 48, 1, 1, bytes);
    return [...bytes].slice(0, 3);
  };
  try {
    return checkOpacity(pixel);
  } finally {
    setViewDisplay(original);
    xray.dispose();
    decorators.dispose();
    target.dispose();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    });
    renderer.dispose();
    renderer.domElement.remove();
  }
}

function checkOpacity(pixel: () => number[]) {
  setViewDisplay({ ...viewDisplay(), xrayGlobal: true, bodyXrayOpacity: 1 });
  const front = pixel();
  setViewDisplay({ ...viewDisplay(), bodyXrayOpacity: 0 });
  const rear = pixel();
  if (front[0] < front[1] + 50 || rear[1] < rear[0] + 50)
    throw new Error(`Decorators did not follow their owning layer: ${front}; ${rear}`);
  setViewDisplay({ ...viewDisplay(), bodyXrayOpacity: 0.4 });
  const mixed = pixel();
  for (const [i, value] of mixed.entries())
    if (Math.abs(value - (front[i] * 0.4 + rear[i] * 0.6)) > 3)
      throw new Error(
        `Decorator opacity was not blended with its body: ${front}; ${rear}; ${mixed}`,
      );
  setViewDisplay({ ...viewDisplay(), sectionFrontOpacity: 0 });
  if (String(pixel()) !== String(mixed)) throw new Error("Sketch opacity changed the body layer");
  setViewDisplay({ ...viewDisplay(), xrayGlobal: false, xrayBleed: 20, xrayRadius: 10 });
  if (String(pixel()) !== String(mixed)) throw new Error("Local body aperture lost decorators");
  return { front, rear, mixed };
}
