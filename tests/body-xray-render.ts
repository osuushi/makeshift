import * as THREE from "three";
import { BodyXrayMask } from "../src/sketch/body-xray-mask.js";
import type { World } from "../src/sketch/world.js";

/** GPU coverage is needed for instancing, MAX blending and CSS-pixel feathering. */
export function bodyXrayRenderChecks() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(512, 384);
  document.body.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 30);
  camera.position.z = 10;
  camera.updateMatrixWorld();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 128, 64));
  body.userData.bodyMaskGeometry = [Array.from(body.geometry.getAttribute("position").array)];
  scene.add(body);
  const world = { renderer, scene, camera, canvas: renderer.domElement } as unknown as World;
  const mask = new BodyXrayMask();
  const target = new THREE.WebGLRenderTarget(512, 384, { depthBuffer: false });
  try {
    renderer.info.autoReset = false;
    renderer.info.reset();
    mask.render(world, target, 20);
    if (renderer.info.render.triangles !== 2 || renderer.info.render.calls !== 1)
      throw new Error("Body mask must draw one instanced quad per body, without tessellation");
    maskShapeChecks(world, body, mask, target);
    return {
      triangles: 2,
      calls: 1,
      shape: "ellipse, bleed, feather, overlap, visibility and DPR passed",
    };
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
    const bytes = new Uint8Array(4),
      scale = target.width / 512;
    renderer.readRenderTargetPixels(
      target,
      Math.floor(x * scale),
      Math.floor(y * scale),
      1,
      1,
      bytes,
    );
    return bytes[0];
  };
  const draw = (bleed: number, feather = 0) => {
    scene.updateMatrixWorld(true);
    mask.render(world, target, bleed, feather);
  };
  draw(20);
  if (pixel(369, 192) !== 255 || pixel(375, 192) !== 0)
    throw new Error(
      `Body mask bleed is not measured in CSS pixels: ${pixel(369, 192)}, ${pixel(375, 192)}`,
    );
  body.scale.set(2, 0.3, 1);
  draw(20, 10);
  const tip = pixel(468, 192),
    side = pixel(256, 241);
  if (tip < 95 || tip > 150 || side < 95 || side > 150)
    throw new Error(`Elongated ellipse feather must have consistent pixel width: ${tip}, ${side}`);
  if (pixel(453, 192) !== 255 || pixel(483, 192) !== 0)
    throw new Error("Ellipse feather does not fade across the requested radius");
  const duplicate = body.clone();
  scene.add(duplicate);
  draw(20, 10);
  if (pixel(468, 192) !== tip) throw new Error("Overlapping apertures compounded their feather");
  scene.remove(duplicate);
  renderer.setPixelRatio(2);
  target.setSize(1024, 768);
  draw(20, 10);
  if (Math.abs(pixel(468, 192) - tip) > 8) throw new Error("DPR changed CSS-pixel feather width");
  body.geometry.dispose();
  body.geometry = new THREE.TorusGeometry(1.5, 0.3, 16, 96);
  body.userData.bodyMaskGeometry = [Array.from(body.geometry.getAttribute("position").array)];
  body.scale.set(1, 1, 1);
  draw(20);
  if (pixel(256, 192) !== 255 || pixel(480, 192) !== 0)
    throw new Error("Approximate body ellipsoid must fill holes and remain bounded");
  body.userData.xrayBody = "body";
  draw(20);
  if (pixel(256, 192) !== 0) throw new Error("X-rayed body generated its own aperture");
  body.userData.xrayBody = null;
  body.visible = false;
  draw(20);
  if (pixel(256, 192) !== 0) throw new Error("Hidden bodies retained a stale aperture");
}
