import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { pickCutReference } from "../src/model/cut-face-reference.js";
import { planeInteriors } from "../src/model/plane-interior-pick.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { planes } from "../src/sketch/planes.js";

function scene() {
  const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 1000);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const frame = { ...planes.XY, origin: [0, 0, -20] };
  const editor = {
    world: {
      camera,
      target: new THREE.Vector3(),
      height: 100,
      active: null,
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      },
      canonicalVisibility: { states: { XY: { selectable: true }, XZ: {}, YZ: {} } },
      visiblePoint: () => true,
      planeBounds: () => ({ minX: -50, maxX: 50, minY: -50, maxY: 50 }),
    },
    display: { bodies: [{ id: "body", faces: [{ id: "face", plane: frame, vertices: [] }] }] },
    store: {
      data: { constructionPlanes: [{ id: "saved", frame: { ...frame, origin: [0, 0, -10] } }] },
    },
    visibility: { visible: () => true },
  } as unknown as SketchEditor;
  return editor;
}

const screen = { x: 50, y: 50 };
const hit = { body: "body", face: "face", depth: 120 };

test("eligible curved faces precede primary planes but retain saved-plane depth ordering", () => {
  const editor = scene();
  Object.assign(editor, { bodiesVisible: true });
  Object.assign(editor.visibility, { xray: new Set() });
  Object.assign(editor.world, { clippingAt: () => [] });
  const face = editor.display.bodies?.[0].faces[0];
  assert.ok(face);
  Object.assign(face, { plane: null, vertices: [-20, -20, -20, 20, -20, -20, 0, 20, -20] });
  const faces = { accepts: () => true, choose: () => {} };
  const saved = pickCutReference(editor, screen, () => true, faces);
  assert.ok(saved && "source" in saved);
  assert.equal(saved.source.kind, "plane");
  editor.visibility.visible = (id) => id !== "saved";
  const chosen = pickCutReference(editor, screen, () => true, faces);
  assert.ok(chosen && "surface" in chosen);
  assert.deepEqual(chosen.surface, { body: "body", face: "face" });
  const fallback = pickCutReference(editor, screen, () => true, { ...faces, accepts: () => false });
  assert.ok(fallback && "source" in fallback);
  assert.equal(fallback.source.kind, "world-plane");
});

test("nearer primary plane remains behind saved planes and faces", () => {
  const editor = scene();
  assert.deepEqual(
    planeInteriors(editor, screen, () => true, hit).map((p) => p.source.kind),
    ["plane", "face", "world-plane"],
  );
  editor.visibility.visible = () => false;
  assert.deepEqual(
    planeInteriors(editor, screen, () => true, hit).map((p) => p.source.kind),
    ["face", "world-plane"],
  );
});

test("primary plane remains available when other references are ineligible", () => {
  assert.deepEqual(
    planeInteriors(scene(), screen, (frame) => frame.origin[2] === 0, hit).map(
      (p) => p.source.kind,
    ),
    ["world-plane"],
  );
});

test("face wins a coincident saved-plane tie", () => {
  assert.deepEqual(
    planeInteriors(scene(), screen, () => true, { ...hit, depth: 110 }).map((p) => p.source.kind),
    ["face", "plane", "world-plane"],
  );
});
