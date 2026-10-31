import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { SectionControls } from "../src/model/section-controls.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { type PlaneFrame, planes } from "../src/sketch/planes.js";

async function fixture(t: test.TestContext) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const canvas = Object.assign(new EventTarget(), { style: { cursor: "" } });
  const world = {
    scene: new THREE.Scene(),
    changed: new Set<() => void>(),
    canvas,
    activeFrame: planes.XY,
    crossSection: null as PlaneFrame | null,
    cameraMoving: false,
    cameraTransitioning: false,
    pointAt: () => ({ x: 0, y: 0 }),
    requestDraw: () => {},
  };
  const editor = {
    world,
    store: {
      data: { bodies: [{ id: "body", brep: "shape" }] },
      sections: async () => [
        {
          body: "body",
          curves: [{ id: "circle", kind: "circle", center: { x: 0, y: 0 }, radius: 5 }],
        },
      ],
    },
    bodiesVisible: true,
    visibility: { key: "", visible: () => true },
    tool: "select",
    interactions: { current: null, dragging: false },
    refresh: () => {
      for (const listener of world.changed) listener();
    },
  };
  const controls = new SectionControls(editor as unknown as SketchEditor);
  t.after(() => controls.dispose());
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(controls.surfaceCount, 1);
  const move = () =>
    canvas.dispatchEvent(
      Object.assign(new Event("pointermove"), {
        buttons: 0,
        clientX: 0,
        clientY: 0,
      }),
    );
  const highlighted = () => {
    let result = false;
    world.scene.traverseVisible((object) => {
      result ||= !!object.userData.sectionBody;
    });
    return result;
  };
  return { world, editor, canvas, move, highlighted };
}

test("section hover survives pending presentation but clears for camera transitions and navigation", async (t) => {
  const { world, editor, canvas, move, highlighted } = await fixture(t);
  move();
  assert.equal(highlighted(), true);
  world.cameraMoving = true;
  editor.refresh();
  assert.equal(highlighted(), true, "GPU backlog is not a change to the hovered section");
  world.cameraTransitioning = true;
  editor.refresh();
  assert.equal(highlighted(), false);
  world.cameraMoving = world.cameraTransitioning = false;
  move();
  assert.equal(highlighted(), true);
  canvas.dispatchEvent(new Event("wheel"));
  assert.equal(highlighted(), false);
});

test("manual cuts on different planes cannot capture an invisible sketch slice", async (t) => {
  const { world, editor, move, highlighted } = await fixture(t);
  for (const frame of [
    planes.XZ,
    { ...planes.XY, origin: [0, 0, 2] as [number, number, number] },
  ]) {
    world.crossSection = frame;
    editor.refresh();
    move();
    assert.equal(highlighted(), false);
  }
  // Reversing the manual cut changes the retained side, not its support plane.
  world.crossSection = { ...planes.XY, v: [0, -1, 0] };
  editor.refresh();
  move();
  assert.equal(highlighted(), true);
  world.crossSection = null;
  editor.refresh();
  move();
  assert.equal(highlighted(), true);
});
