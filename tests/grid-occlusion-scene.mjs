import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { setViewDisplay } from "../src/preferences/view-display.ts";
import { GridOcclusion, gridLabelTransmission } from "../src/sketch/grid-occlusion.ts";
import { createGrids } from "../src/sketch/world-grid.ts";

// A GPU regression: late translucent fills and fat sketch lines cross the grid.
export function gridOcclusionPixels(coplanar = false) {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(128, 128);
  const target = new THREE.WebGLRenderTarget(128, 128);
  renderer.setRenderTarget(target);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("white");
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 100);
  if (coplanar) {
    camera.far = 100000;
    camera.updateProjectionMatrix();
    camera.position.set(30, -40, 50);
  } else camera.position.set(0, 0, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const center = new THREE.Vector3();
  const grids = createGrids(scene);
  setViewDisplay({ grid: 0, gridFill: 1 });
  grids.update(camera, center, 40, null, 128, {
    XY: { opacity: 1 },
    XZ: { opacity: 0 },
    YZ: { opacity: 0 },
  });
  const meshes = [-4, 4].map((z, i) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.MeshBasicMaterial({
        color: "blue",
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    mesh.position.set(i ? 6 : -6, 5, coplanar ? 0 : z);
    mesh.renderOrder = 5;
    scene.add(mesh);
    return mesh;
  });
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions([-12, -5, -4, 12, -5, 4]);
  const material = new LineMaterial({
    color: "red",
    transparent: true,
    opacity: 0.8,
    linewidth: 4,
    depthWrite: false,
  });
  material.resolution.set(128, 128);
  const line = new LineSegments2(geometry, material);
  line.renderOrder = 10;
  scene.add(line);
  const axisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-12, -10, -4),
    new THREE.Vector3(12, -10, 4),
  ]);
  const axisMaterial = new THREE.LineBasicMaterial({
    color: "green",
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const axis = new THREE.LineSegments(axisGeometry, axisMaterial);
  axis.renderOrder = -9;
  scene.add(axis);
  const world = { scene, renderer, camera, target: center, height: 40 };
  const occlusion = new GridOcclusion();

  renderer.render(scene, camera);
  const before = readPixels(renderer, target);
  occlusion.update(world);
  renderer.render(scene, camera);
  const after = readPixels(renderer, target);
  const labels = [-4, 4].map((z) => gridLabelTransmission(world, new THREE.Vector3(0, 0, z)));
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  axisGeometry.dispose();
  axisMaterial.dispose();
  geometry.dispose();
  material.dispose();
  grids.dispose();
  target.dispose();
  renderer.dispose();
  return { before, after, labels };
}

function readPixels(renderer, target) {
  const pixels = new Uint8Array(128 * 128 * 4);
  renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
  const pixel = (x, y) => [...pixels.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 3)];
  return {
    pixels: [...pixels],
    behindFill: pixel(45, 80),
    frontFill: pixel(83, 80),
    behindAxis: pixel(45, 31),
    frontAxis: pixel(83, 31),
    behindLine: pixel(45, 48),
    frontLine: pixel(83, 48),
  };
}

export function gridGradientPixels(normal) {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(256, 128);
  const target = new THREE.WebGLRenderTarget(256, 128);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  renderer.setRenderTarget(target);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#808080");
  const camera = new THREE.OrthographicCamera(-40, 40, 20, -20, 0.1, 1000);
  camera.position.fromArray(normal).multiplyScalar(50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const grids = createGrids(scene);
  scene.getObjectByName("world-coordinate-axes").visible = false;
  setViewDisplay({ grid: 0, gridFill: 0.3 });
  grids.update(camera, new THREE.Vector3(), 40, null, 128, {
    XY: { opacity: 1 },
    XZ: { opacity: 0 },
    YZ: { opacity: 0 },
  });
  // Grid updates preserve axis visibility; keep this pixel fixture fill-only.
  scene.getObjectByName("world-coordinate-axes").visible = false;
  renderer.render(scene, camera);
  const pixels = new Uint8Array(256 * 128 * 4);
  renderer.readRenderTargetPixels(target, 0, 0, 256, 128, pixels);
  const at = (x, y) => pixels[(y * 256 + x) * 4];
  const result = {
    center: at(128, 64),
    clearBoundary: at(135, 64),
    horizontal: at(160, 64),
    vertical: at(128, 96),
    edge: at(254, 64),
  };
  grids.dispose();
  target.dispose();
  renderer.dispose();
  return result;
}
