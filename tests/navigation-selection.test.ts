import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { SketchEditor } from "../src/sketch/editor.js";
import { emptySelection } from "../src/sketch/history-selection.js";
import type { ModelingTarget } from "../src/sketch/model-selection-state.js";
import { NavigationHistory } from "../src/sketch/navigation-history.js";
import { planes } from "../src/sketch/planes.js";
import { SelectionHistory } from "../src/sketch/selection-history.js";
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
    draw: () => {
      history.observe();
      navigation.settled();
    },
    cancelCameraMotion: () => {
      world.cameraTransitioning = false;
    },
  };
  const navigation = new NavigationHistory(world as unknown as World);
  const modeling = { targets: [] as ModelingTarget[] };
  const editor = {
    world: { ...world, navigation },
    modeling,
    selected: { targets: [] },
    store: { busy: false, scriptRunning: false, syncSelection: () => {} },
    interactions: { current: null },
  };
  // Keep the collaborator and editor on the same mutable World for the test.
  Object.assign(world, { navigation });
  editor.world = world as typeof editor.world;
  const history = new SelectionHistory(editor as unknown as SketchEditor);
  history.connectNavigation();
  return { world, navigation, history, modeling };
}
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

test("workspace entry absorbs its synchronous target clearing into one navigation intent", async () => {
  const { world, navigation, history, modeling } = fixture();
  modeling.targets = [{ kind: "body", body: "input" }];
  history.observe();
  history.take();
  navigation.beginWorkspace();
  world.cameraTransitioning = true;
  world.workspace = { key: "XY", frame: planes.XY };
  world.draw();
  modeling.targets = [];
  world.draw();
  await tick();
  assert.equal(history.pending, false, "Workspace-driven clearing adds no selection step");
  world.cameraTransitioning = false;
  world.draw();
  await tick();
  const changes = history.take();
  assert.equal(changes.steps.length, 1);
  const intent = changes.steps[0];
  assert.ok("navigation" in intent);
  assert.deepEqual(intent.navigation.before.selection.modeling, [{ kind: "body", body: "input" }]);
  assert.deepEqual(intent.navigation.after.selection.modeling, []);
  assert.deepEqual(intent.navigation.after.selection.workspace, world.workspace);
});

test("a later selection finishes navigation before its independent selection step", async () => {
  const { world, navigation, history, modeling } = fixture();
  navigation.beginWorkspace();
  world.cameraTransitioning = true;
  world.workspace = { key: "XY", frame: planes.XY };
  world.draw();
  await tick();
  modeling.targets = [{ kind: "body", body: "later-pick" }];
  world.draw();
  const changes = history.take();
  assert.equal(changes.steps.length, 2);
  assert.ok("navigation" in changes.steps[0]);
  assert.deepEqual(changes.steps[0].navigation.after.selection.modeling, []);
  assert.deepEqual(changes.steps[1], {
    ...emptySelection(),
    workspace: world.workspace,
    modeling: [{ kind: "body", body: "later-pick" }],
  });
});
