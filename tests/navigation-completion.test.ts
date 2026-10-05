import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import * as THREE from "three";
import { type CameraState, captureCamera, restoreCamera } from "../src/model/camera-state.js";
import type { NavigationChange } from "../src/sketch/history-navigation.js";
import { emptySelection } from "../src/sketch/history-selection.js";
import { NavigationHistory } from "../src/sketch/navigation-history.js";
import { TrackpadSnap, trackpadIdleMs } from "../src/sketch/trackpad-snap.js";
import type { World } from "../src/sketch/world.js";

function fixture(t: TestContext) {
  const original = globalThis.window;
  globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
  const abort = new AbortController();
  t.after(() => {
    abort.abort();
    globalThis.window = original;
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const camera = new THREE.OrthographicCamera(-40, 40, 40, -40);
  camera.position.set(0, 0, 120);
  camera.up.set(-Math.sin(0.2), Math.cos(0.2), 0);
  let levels = 0;
  const world = {
    camera,
    target: new THREE.Vector3(),
    height: 80,
    workspace: null,
    orbit: { active: false },
    cameraTransitioning: false,
    canNavigate: () => true,
    rollAnimation: { cancel: () => {} },
    cancelCameraMotion: () => {
      world.cameraTransitioning = false;
    },
    draw: () => navigation.settled(),
    animateCamera: (state: CameraState) => restoreCamera(world as unknown as World, state),
    levelHorizon: () => {
      levels++;
      world.cameraTransitioning = true;
    },
  };
  const navigation = new NavigationHistory(world as unknown as World);
  const snap = new TrackpadSnap(
    Object.assign(world, { navigation }) as unknown as World,
    abort.signal,
  );
  navigation.stopCompletion = () => snap.stop();
  const changes: NavigationChange[] = [];
  navigation.completed = (change) => changes.push(change);
  return { world, navigation, snap, changes, levels: () => levels };
}
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

test("history interruption cancels pending idle leveling before restoring a tilted camera", async (t) => {
  const { world, navigation, snap, changes, levels } = fixture(t);
  const before = { camera: captureCamera(world as unknown as World), selection: emptySelection() };
  navigation.begin();
  world.height = 70;
  snap.request();
  navigation.finish();
  assert.equal(changes.length, 1);
  navigation.restore(before, () => {});
  t.mock.timers.tick(trackpadIdleMs + 300);
  await tick();
  assert.equal(levels(), 0, "Old completion timer cannot level the restored camera");
  assert.deepEqual(captureCamera(world as unknown as World), before.camera);
  assert.equal(changes.length, 1, "Restore creates no new navigation intent");
  assert.equal(navigation.active, false);
});

test("clear stops a remaining camera transition without recording it", async (t) => {
  const { world, navigation, changes } = fixture(t);
  navigation.begin();
  world.cameraTransitioning = true;
  world.target.x = 4;
  navigation.clear();
  world.draw();
  await tick();
  assert.equal(world.cameraTransitioning, false);
  assert.equal(changes.length, 0);
  assert.equal(navigation.active, false);
});

test("unpaired release, terminal packet and cancellation cannot start an intent", async (t) => {
  const { navigation, snap, changes, levels } = fixture(t);
  snap.cancel();
  snap.release();
  snap.postpone();
  t.mock.timers.tick(trackpadIdleMs + 300);
  await tick();
  assert.equal(navigation.active, false);
  assert.equal(changes.length, 0);
  assert.equal(levels(), 0);
});

test("ordinary held pinch still completes once after release leveling", async (t) => {
  const { world, navigation, snap, changes, levels } = fixture(t);
  snap.hold();
  world.height = 70;
  snap.request();
  t.mock.timers.tick(trackpadIdleMs + 300);
  assert.equal(levels(), 0, "Held gesture postpones completion");
  snap.release();
  t.mock.timers.tick(trackpadIdleMs);
  await tick();
  assert.equal(levels(), 1);
  assert.equal(changes.length, 0, "Leveling animation remains part of the same gesture");
  world.cameraTransitioning = false;
  world.draw();
  await tick();
  assert.equal(changes.length, 1);
  assert.equal(navigation.active, false);
});

test("accepted-context rebase retains the pending completion timer", async (t) => {
  const { world, navigation, snap, changes, levels } = fixture(t);
  navigation.begin();
  world.height = 70;
  snap.request();
  navigation.rebase();
  world.height = 65;
  t.mock.timers.tick(trackpadIdleMs);
  await tick();
  assert.equal(levels(), 1);
  world.cameraTransitioning = false;
  world.draw();
  await tick();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].navigation.before.camera.height, 70);
  assert.equal(changes[0].navigation.after.camera.height, 65);
});
