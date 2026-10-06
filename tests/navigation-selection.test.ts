import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { captureCamera } from "../src/model/camera-state.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { emptySelection } from "../src/sketch/history-selection.js";
import type { ModelingTarget } from "../src/sketch/model-selection-state.js";
import { NavigationHistory } from "../src/sketch/navigation-history.js";
import { planes } from "../src/sketch/planes.js";
import { SelectionHistory } from "../src/sketch/selection-history.js";
import type { SelectionTarget } from "../src/sketch/selection-target.js";
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
    selected: { targets: [] as SelectionTarget[] },
    store: { busy: false, scriptRunning: false, syncSelection: () => {} },
    interactions: { current: null },
  };
  // Keep the collaborator and editor on the same mutable World for the test.
  Object.assign(world, { navigation });
  editor.world = world as typeof editor.world;
  const history = new SelectionHistory(editor as unknown as SketchEditor);
  history.connectNavigation();
  return { world, navigation, history, modeling, selected: editor.selected };
}
const tick = () => new Promise<void>((resolve) => queueMicrotask(resolve));

test("immediate workspace completion waits for accepted result selection", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { world, navigation, history, modeling } = fixture();
  modeling.targets = [{ kind: "body", body: "source" }];
  history.observe();
  history.take();
  history.accepted();
  modeling.targets = [{ kind: "body", body: "accepted" }];
  navigation.beginWorkspace();
  world.workspace = { key: "XY", frame: planes.XY };
  modeling.targets = [];
  world.draw();
  await tick();
  assert.equal(history.pending, false, "Acceptance still owns its result-selection baseline");
  assert.equal(navigation.active, true, "Immediate view completion waits for that baseline");
  t.mock.timers.tick(1);
  await tick();
  const changes = history.take();
  assert.deepEqual(changes.baseline.modeling, []);
  assert.equal(changes.steps.length, 1, "Immediate completion retains the workspace intent");
  const intent = changes.steps[0];
  assert.ok("navigation" in intent);
  assert.deepEqual(intent.navigation.before.selection.modeling, [
    { kind: "body", body: "accepted" },
  ]);
  assert.equal(intent.navigation.before.selection.workspace, null);
  assert.deepEqual(intent.navigation.after.selection.workspace, world.workspace);
  assert.deepEqual(intent.navigation.after.selection.modeling, []);
});

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

test("accepted geometry does not rebase a new workspace gesture during deferred selection settlement", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { world, navigation, history, modeling } = fixture();
  modeling.targets = [
    { kind: "body", body: "source-b" },
    { kind: "body", body: "source-a" },
  ];
  history.observe();
  history.take();
  const camera = captureCamera(world as unknown as World);
  history.accepted();
  navigation.beginWorkspace();
  world.workspace = { key: "Projected sketch", frame: planes.XY, sketchId: "result" };
  world.cameraTransitioning = true;
  world.camera.position.set(20, -30, 80);
  modeling.targets = [];
  world.draw();
  await tick();
  t.mock.timers.tick(1);
  world.camera.position.set(0, 0, 100);
  world.cameraTransitioning = false;
  world.draw();
  await tick();
  const changes = history.take();
  assert.equal(changes.steps.length, 1);
  const intent = changes.steps[0];
  assert.ok("navigation" in intent);
  assert.deepEqual(
    intent.navigation.before.camera,
    camera,
    "new workspace retains its actual pre-entry pose",
  );
  assert.deepEqual(
    intent.navigation.before.selection,
    {
      ...emptySelection(),
      modeling: [
        { kind: "body", body: "source-b" },
        { kind: "body", body: "source-a" },
      ],
    },
    "new workspace retains original ordered source selection and workspace",
  );
  assert.deepEqual(intent.navigation.after.selection.workspace, world.workspace);
});

test("acceptance rebases a held gesture to the published geometry context", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { world, navigation, history, modeling } = fixture();
  modeling.targets = [{ kind: "body", body: "old" }];
  history.observe();
  history.take();
  navigation.hold("pan");
  world.camera.position.set(50, -65, 65);
  const published = captureCamera(world as unknown as World);
  history.accepted();
  // The accepting controller chooses its result after the async publication,
  // while the same held camera gesture continues moving before settlement.
  modeling.targets = [
    { kind: "body", body: "accepted-b" },
    { kind: "body", body: "accepted-a" },
  ];
  world.camera.position.set(48, -63, 65);
  t.mock.timers.tick(1);
  world.camera.position.set(45, -60, 65);
  navigation.release("pan");
  await tick();
  const changes = history.take();
  assert.equal(changes.steps.length, 1);
  const intent = changes.steps[0];
  assert.ok("navigation" in intent);
  assert.deepEqual(intent.navigation.before.camera, published);
  assert.deepEqual(intent.navigation.before.selection.modeling, modeling.targets);
});

test("deferred accepted selection cannot overwrite a replacement workspace gesture", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { world, navigation, history, modeling } = fixture();
  modeling.targets = [{ kind: "body", body: "source" }];
  history.observe();
  history.take();
  navigation.hold("pan");
  history.accepted();
  navigation.release("pan");
  await tick();
  modeling.targets = [{ kind: "body", body: "accepted-result" }];
  const camera = captureCamera(world as unknown as World);
  navigation.beginWorkspace();
  world.workspace = { key: "Projected sketch", frame: planes.XY, sketchId: "replacement" };
  world.cameraTransitioning = true;
  world.camera.position.set(20, -30, 80);
  modeling.targets = [];
  world.draw();
  await tick();
  t.mock.timers.tick(1);
  world.cameraTransitioning = false;
  world.draw();
  await tick();
  const changes = history.take();
  assert.equal(changes.steps.length, 1);
  const intent = changes.steps[0];
  assert.ok("navigation" in intent);
  assert.deepEqual(intent.navigation.before.camera, camera);
  assert.deepEqual(intent.navigation.before.selection, {
    ...emptySelection(),
    modeling: [{ kind: "body", body: "accepted-result" }],
  });
});

test("workspace entry freezes an accepted held gesture before controller target clearing", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { world, navigation, history, modeling, selected } = fixture();
  modeling.targets = [
    { kind: "body", body: "source-b" },
    { kind: "body", body: "source-a" },
  ];
  selected.targets = [
    { kind: "curve", curve: "source-curve-b" },
    { kind: "curve", curve: "source-curve-a" },
  ];
  history.observe();
  history.take();
  navigation.hold("pan");
  world.camera.position.set(50, -65, 65);
  const published = captureCamera(world as unknown as World);
  const source = structuredClone({
    ...emptySelection(),
    modeling: modeling.targets,
    sketch: selected.targets,
  });
  history.accepted();
  world.camera.position.set(48, -63, 65);
  // Projection freezes entry before releasing its lease and clearing source fills.
  navigation.beginWorkspace();
  modeling.targets = [];
  selected.targets = [];
  world.draw();
  // Ordinary World.enterWorkspace shares the held intent instead of starting another.
  navigation.beginWorkspace();
  world.workspace = { key: "Projected sketch", frame: planes.XY, sketchId: "result" };
  world.cameraTransitioning = true;
  selected.targets = [
    { kind: "curve", curve: "result-b" },
    { kind: "curve", curve: "result-a" },
  ];
  world.draw();
  await tick();
  t.mock.timers.tick(1);
  world.camera.position.set(0, 0, 100);
  world.cameraTransitioning = false;
  world.draw();
  await tick();
  assert.equal(history.pending, false, "Held pan still owns the unfinished intent");
  assert.equal(navigation.active, true);
  navigation.release("pan");
  await tick();
  const changes = history.take();
  assert.equal(changes.steps.length, 1);
  const intent = changes.steps[0];
  assert.ok("navigation" in intent);
  assert.deepEqual(intent.navigation.before.camera, published);
  assert.deepEqual(intent.navigation.before.selection, source);
  assert.deepEqual(intent.navigation.after.selection, {
    workspace: world.workspace,
    modeling: [],
    sketch: selected.targets,
  });
});
