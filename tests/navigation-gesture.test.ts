import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { type CameraState, captureCamera, restoreCamera } from "../src/model/camera-state.js";
import { type NavigationChange, sameNavigation } from "../src/sketch/history-navigation.js";
import { emptySelection } from "../src/sketch/history-selection.js";
import { NavigationHistory } from "../src/sketch/navigation-history.js";
import { planes } from "../src/sketch/planes.js";
import type { World } from "../src/sketch/world.js";

function fixture() {
  const camera = new THREE.OrthographicCamera(-40, 40, 40, -40);
  camera.position.set(55, -70, 65);
  camera.up.set(0, 0, 1);
  const world = {
    camera,
    target: new THREE.Vector3(),
    height: 80,
    workspace: null as World["workspace"],
    orbit: { active: false },
    cameraTransitioning: false,
    cancelCameraMotion: () => {
      world.cameraTransitioning = false;
    },
    draw: () => navigation.settled(),
    animateCamera: (state: CameraState) => restoreCamera(world as unknown as World, state),
  };
  const navigation = new NavigationHistory(world as unknown as World);
  Object.assign(world, { navigation });
  const changes: NavigationChange[] = [];
  navigation.completed = (change) => changes.push(change);
  return { world, navigation, changes };
}
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

test("continuous pointer/trackpad holds and completion animation publish one final view", async () => {
  const { world, navigation, changes } = fixture();
  const before = captureCamera(world as unknown as World);
  navigation.hold("pan");
  navigation.hold("trackpad");
  for (let x = 1; x <= 8; x++) {
    world.target.x = x;
    world.draw();
    await tick();
    assert.equal(changes.length, 0);
  }
  navigation.release("pan");
  world.cameraTransitioning = true;
  navigation.release("trackpad");
  await tick();
  assert.equal(changes.length, 0);
  world.cameraTransitioning = false;
  world.draw();
  await tick();
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].navigation.before.camera, before);
  assert.equal(changes[0].navigation.after.camera.target[0], 8);
  assert.equal(navigation.active, false);
});

test("no-motion/cancelled press and numerical canonical roundoff produce no intent", async () => {
  const { world, navigation, changes } = fixture();
  navigation.hold("pan");
  navigation.release("pan");
  await tick();
  assert.equal(changes.length, 0);
  navigation.begin();
  world.camera.position.x += 1e-12;
  world.draw();
  await tick();
  assert.equal(changes.length, 0);
  const a = { camera: captureCamera(world as unknown as World), selection: emptySelection() };
  const b = structuredClone(a);
  b.camera.target[0] = 1e-3;
  assert.equal(sameNavigation(a, b), false, "Observable pan is retained");
  b.camera.target[0] = 0;
  b.camera.up[0] = 0.001;
  assert.equal(sameNavigation(a, b), false, "Observable roll is retained");
});

test("restore suppresses workspace/camera recording and queued draw completion", async () => {
  const { world, navigation, changes } = fixture();
  navigation.begin();
  world.target.x = 10;
  const snapshot = {
    camera: captureCamera(world as unknown as World),
    selection: {
      ...emptySelection(),
      workspace: { key: "XY", frame: planes.XY },
    },
  };
  world.target.x = 20;
  navigation.restore(snapshot, (selection) => {
    navigation.beginWorkspace();
    world.workspace = selection.workspace;
    world.draw();
  });
  await tick();
  assert.equal(world.target.x, 10);
  assert.deepEqual(world.workspace, snapshot.selection.workspace);
  assert.equal(navigation.active, false);
  assert.equal(changes.length, 0);
});

test("accepted context rebases an unfinished gesture while retaining its lifetime", async () => {
  const { world, navigation, changes } = fixture();
  let selection = emptySelection();
  navigation.readSelection = () => selection;
  navigation.hold("touch");
  world.target.x = 5;
  selection = { ...emptySelection(), modeling: [{ kind: "body", body: "accepted-result" }] };
  navigation.rebase();
  world.target.x = 9;
  world.draw();
  await tick();
  assert.equal(changes.length, 0, "Rebase retains held contacts");
  navigation.release("touch");
  await tick();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].navigation.before.camera.target[0], 5);
  assert.deepEqual(changes[0].navigation.before.selection, selection);
  assert.equal(changes[0].navigation.after.camera.target[0], 9);
});

test("unrecorded movement expires pending view intent while retaining the pan drag guard", async () => {
  const { world, navigation, changes } = fixture();
  let expirations = 0;
  navigation.discarded = () => expirations++;
  navigation.begin();
  world.target.x = 5;
  navigation.hold("pan", false);
  assert.equal(navigation.active, false);
  assert.equal(navigation.dragging, true);
  world.target.x = 10;
  navigation.release("pan");
  await tick();
  assert.equal(expirations, 1);
  assert.equal(changes.length, 0);
  assert.equal(navigation.dragging, false);
});
