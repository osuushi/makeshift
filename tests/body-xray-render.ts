import * as THREE from "three";
import { BodyXrayMask } from "../src/sketch/body-xray-mask.js";
import type { World } from "../src/sketch/world.js";

export function bodyXrayRenderChecks() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(512, 384);
  document.body.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 30);
  camera.position.z = 10;
  camera.updateMatrixWorld();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 128, 64));
  body.userData.bodyFace = { body: "normal", face: "sphere" };
  scene.add(body);
  const world = { renderer, scene, camera, canvas: renderer.domElement } as unknown as World;
  const mask = new BodyXrayMask();
  const target = new THREE.WebGLRenderTarget(64, 48, { depthBuffer: false });
  const frame = () => {
    scene.updateMatrixWorld(true);
    renderer.info.reset();
    renderer.info.autoReset = false;
    const start = performance.now();
    mask.read(world);
    mask.render(world, target, 100);
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, new Uint8Array(4));
    return {
      milliseconds: performance.now() - start,
      triangles: renderer.info.render.triangles,
      calls: renderer.info.render.calls,
    };
  };
  try {
    const cold = frame();
    const frames = [];
    for (let i = 0; i < 5; i++) {
      body.rotation.y += 0.05;
      frames.push(frame());
    }
    const sourceTriangles = (body.geometry.index?.count ?? 0) / 3;
    if (frames.some((frame) => frame.triangles > sourceTriangles + 32))
      throw new Error("Body mask expanded tessellation into extra geometry");
    maskShapeChecks(world, body, mask, target);
    return { cold, frames, sourceTriangles };
  } finally {
    mask.dispose();
    target.dispose();
    body.geometry.dispose();
    (body.material as THREE.Material).dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }
}

function maskShapeChecks(
  world: World,
  body: THREE.Mesh,
  mask: BodyXrayMask,
  target: THREE.WebGLRenderTarget,
) {
  const { renderer, scene } = world;
  const pixel = (x: number, y: number) => {
    const bytes = new Uint8Array(4);
    renderer.readRenderTargetPixels(target, x, y, 1, 1, bytes);
    return bytes[0];
  };
  const draw = (bleed: number) => {
    scene.updateMatrixWorld(true);
    mask.render(world, target, bleed);
  };
  body.geometry.dispose();
  body.geometry = new THREE.PlaneGeometry(2, 2);
  body.rotation.set(0, 0, 0);
  target.setSize(512, 384);
  draw(20);
  if (pixel(338, 192) !== 255 || pixel(343, 192) !== 0)
    throw new Error("Body mask bleed is not measured in CSS pixels");
  if (pixel(335, 271) !== 0 || pixel(331, 267) !== 255)
    throw new Error("Body bleed must have round corners");
  body.geometry.dispose();
  body.geometry = new THREE.TorusGeometry(1.5, 0.3, 16, 96);
  draw(20);
  if (pixel(256, 192) !== 0 || pixel(328, 192) !== 255 || pixel(400, 192) !== 0)
    throw new Error("Body mask lost its hole or expanded beyond the silhouette");
  body.visible = false;
  draw(20);
  if (pixel(328, 192) !== 0) throw new Error("Hidden bodies retained a stale aperture");
}
