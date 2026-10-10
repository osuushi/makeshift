import type { World } from "../sketch/world.js";

export const defaultCameraPosition = [65, -65, 65] as const;

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  height: number;
}

const vector = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((n) => typeof n === "number" && Number.isFinite(n));

export function validateCameraState(value: unknown): CameraState | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") throw new Error("Invalid saved camera.");
  const camera = value as Partial<CameraState>;
  if (
    !vector(camera.position) ||
    !vector(camera.target) ||
    !vector(camera.up) ||
    typeof camera.height !== "number" ||
    !Number.isFinite(camera.height) ||
    camera.height < 0.5 ||
    camera.height > 10000
  )
    throw new Error("Invalid saved camera.");
  const position = camera.position;
  const target = camera.target;
  const up = camera.up;
  const direction = position.map((n, i) => n - target[i]);
  const distance = Math.hypot(...direction);
  const upLength = Math.hypot(...up);
  const cross = [
    direction[1] * up[2] - direction[2] * up[1],
    direction[2] * up[0] - direction[0] * up[2],
    direction[0] * up[1] - direction[1] * up[0],
  ];
  if (
    !Number.isFinite(distance) ||
    distance < 1e-6 ||
    distance > 1e9 ||
    !Number.isFinite(upLength) ||
    upLength < 1e-6 ||
    Math.hypot(...cross) < distance * upLength * 1e-6
  )
    throw new Error("Invalid saved camera.");
  return camera as CameraState;
}

export function captureCamera(world: World): CameraState {
  world.camera.lookAt(world.target);
  world.camera.updateMatrixWorld();
  return {
    position: world.camera.position.toArray(),
    target: world.target.toArray(),
    up: world.camera.up.toArray(),
    height: world.height,
  };
}

export function restoreCamera(world: World, state: CameraState | undefined): void {
  world.navigation.clear();
  world.cancelCameraMotion();
  if (state) {
    world.camera.position.fromArray(state.position);
    world.target.fromArray(state.target);
    world.camera.up.fromArray(state.up);
    world.height = state.height;
  } else {
    world.camera.position.set(...defaultCameraPosition);
    world.target.set(0, 0, 0);
    world.camera.up.set(0, 0, 1);
    world.height = 80;
  }
  world.draw();
}
