import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { SelectionSection, selectedSectionFrame } from "../src/model/selection-section.js";
import {
  applicationPreferences,
  configurePreferences,
} from "../src/preferences/application-preferences.js";
import { ActiveInteraction } from "../src/sketch/active-interaction.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import type { ModelingTarget } from "../src/sketch/model-selection-state.js";
import { type PlaneFrame, planes } from "../src/sketch/planes.js";
import { cameraSectionClip } from "../src/sketch/view-clipping.js";

const offset: PlaneFrame = { ...planes.XY, origin: [0, 0, 5] };

function editor(targets: ModelingTarget[]): SketchEditor {
  return {
    modeling: { targets },
    store: {
      data: {
        sketches: [
          { id: "sketch", plane: planes.XY },
          { id: "offset", plane: offset },
        ],
        bodies: [
          {
            id: "body",
            faces: [
              { id: "flat", plane: planes.XY },
              { id: "curved", plane: null },
            ],
          },
        ],
      },
    },
  } as unknown as SketchEditor;
}

test("Planar selections resolve accepted planes; ambiguous and curved selections do not", () => {
  const sketch: ModelingTarget = { kind: "sketch", sketch: "sketch" };
  const face: ModelingTarget = { kind: "face", body: "body", face: "flat" };
  assert.deepEqual(selectedSectionFrame(editor([sketch]), undefined), planes.XY);
  assert.deepEqual(selectedSectionFrame(editor([face]), undefined), planes.XY);
  assert.deepEqual(selectedSectionFrame(editor([sketch, face]), undefined), planes.XY);
  assert.deepEqual(selectedSectionFrame(editor([]), offset), offset);
  for (const targets of [
    [],
    [sketch, { kind: "sketch", sketch: "offset" }],
    [{ kind: "face", body: "body", face: "curved" }],
    [{ kind: "body", body: "body" }],
    [{ kind: "sketch", sketch: "missing" }],
  ] as ModelingTarget[][])
    assert.equal(selectedSectionFrame(editor(targets), undefined), null);
});

test("Extrude and revolve hold a copied source plane through preview replacement and cancellation", () => {
  for (const kind of ["extrude", "revolve"] as const) {
    const section = new SelectionSection();
    const interactions = new ActiveInteraction(() => {});
    const source = structuredClone(offset);
    section.read(source, null);
    const lease = interactions.acquire(kind, () => {});
    assert.ok(lease);
    assert.deepEqual(section.read(source, lease), offset);
    source.origin[2] = 100;
    assert.deepEqual(section.read(planes.XZ, lease), offset, "Preview faces cannot shift the cut");
    assert.deepEqual(section.read(null, lease), offset, "Consumed source remains available");
    lease.release();
    assert.equal(section.read(null, interactions.current), null);
    assert.deepEqual(section.read(planes.XZ, null), planes.XZ);
  }
});

test("Reference picking can acquire a section after an operation starts without a source", () => {
  const section = new SelectionSection();
  const interactions = new ActiveInteraction(() => {});
  const lease = interactions.acquire("extrude", () => {});
  assert.equal(section.read(null, lease), null);
  assert.deepEqual(section.read(planes.XY, lease), planes.XY);
  assert.deepEqual(section.read(offset, lease), planes.XY);
});

test("Camera-side clipping reverses across an oblique plane and retains coplanar geometry", () => {
  const frame: PlaneFrame = { origin: [3, -8, 7], u: [0.6, 0.8, 0], v: [0, 0, 1] };
  const origin = new THREE.Vector3(...frame.origin);
  const normal = new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v));
  for (const side of [-1, 1]) {
    const front = origin.clone().addScaledVector(normal, side * 10);
    const rear = origin.clone().addScaledVector(normal, side * -10);
    const clip = cameraSectionClip(frame, front);
    assert.ok(clip.distanceToPoint(front) < 0);
    assert.ok(clip.distanceToPoint(rear) > 0);
    assert.ok(clip.distanceToPoint(origin) > 0);
    assert.ok(clip.clone().negate().distanceToPoint(origin) < 0);
  }
});

test("Section opacity supports both endpoints and invalid patches cannot change other preferences", () => {
  const original = applicationPreferences();
  try {
    for (const opacity of [0, 0.35, 1]) {
      configurePreferences(JSON.stringify({ viewDisplay: { sectionFrontOpacity: opacity } }));
      assert.equal(applicationPreferences().viewDisplay.sectionFrontOpacity, opacity);
    }
    for (const opacity of [-0.1, 1.1, "0.5", null]) {
      assert.throws(() =>
        configurePreferences(
          JSON.stringify({ viewDisplay: { grid: 0, sectionFrontOpacity: opacity } }),
        ),
      );
      assert.equal(applicationPreferences().viewDisplay.grid, original.viewDisplay.grid);
      assert.equal(applicationPreferences().viewDisplay.sectionFrontOpacity, 1);
    }
  } finally {
    configurePreferences(JSON.stringify(original));
  }
});
