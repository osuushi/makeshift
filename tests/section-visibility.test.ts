import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { BodyPickProbe } from "../src/model/body-picking.js";
import { readArchive } from "../src/model/document-archive.js";
import { pickBodyEdge } from "../src/model/edge-selection.js";
import { sectionKeepsBody } from "../src/model/section-visibility.js";
import type { PlaneFrame } from "../src/sketch/planes.js";
import { flipSectionFrame, sectionClip } from "../src/sketch/view-clipping.js";
import { pickingEditor } from "./body-picking-fixtures.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/section-tangent-body.json", "utf8"));
const frame: PlaneFrame = fixture.frame;

test("captured section hides a removed body's boundary without hiding the retained solid", async () => {
  const owner = new DocumentOwner();
  try {
    const document = readArchive(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    );
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    const before = structuredClone(owner.view.data);
    const bodies = owner.view.data.bodies;
    assert.ok(bodies);
    const [removed, retained] = bodies;
    assert.equal(sectionKeepsBody(removed, frame), false);
    assert.equal(sectionKeepsBody(retained, frame), true);
    const flipped = flipSectionFrame(frame);
    assert.equal(sectionKeepsBody(removed, flipped), true);
    assert.equal(sectionKeepsBody(retained, flipped), false);
    assert.equal(sectionKeepsBody(removed, null), true);
    // The GPU/picker clip padding admits the boundary; shell visibility must not.
    const clip = sectionClip(frame);
    clip.constant += 1e-4;
    const editor = pickingEditor(bodies, [0, -100, -40], [clip]);
    editor.world.crossSection = frame;
    const point = editor.world.project([20, 0, -1]);
    const probe = new BodyPickProbe(editor, point);
    assert.deepEqual(
      probe.bodies.map((body) => body.id),
      [retained.id],
    );
    assert.deepEqual(probe.faces(), []);
    const rim = editor.world.project([30, 0, -1]);
    assert.equal(pickBodyEdge(editor, rim), null, "The vanished rim cannot be picked");
    editor.world.crossSection = null;
    assert.equal(new BodyPickProbe(editor, point).bodies.length, 2);
    assert.deepEqual(owner.view.data, before, "View clipping never edits accepted geometry");
  } finally {
    owner.close();
  }
});

test("oblique tangent shells disappear even when their axis-aligned box crosses the cut", () => {
  const shell = {
    bounds: [0, 0, 0, 1, 1, 1],
    faces: [
      [1, 0, 0, 0, 1, 0, 0, 0, 1],
      [1, 0, 0, 1, 1, 1, 0, 1, 0],
      [0, 1, 0, 1, 1, 1, 0, 0, 1],
      [0, 0, 1, 1, 1, 1, 1, 0, 0],
    ],
  };
  const oblique: PlaneFrame = {
    origin: [1, 0, 0],
    u: [Math.SQRT1_2, -Math.SQRT1_2, 0],
    v: [-1 / Math.sqrt(6), -1 / Math.sqrt(6), 2 / Math.sqrt(6)],
  };
  assert.equal(sectionKeepsBody(shell, oblique), false);
  assert.equal(sectionKeepsBody(shell, flipSectionFrame(oblique)), true);
  assert.equal(
    sectionKeepsBody(shell, { ...oblique, origin: [1.00001, 0, 0] }),
    true,
    "Material thinner than the raster clipping padding must remain visible",
  );
});
