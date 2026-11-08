import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { readArchive } from "../src/model/document-archive.js";
import { sectionProfile } from "../src/model/sketch-section.js";
import { emptySketch } from "../src/sketch/document.js";
import type { PlaneFrame } from "../src/sketch/planes.js";
import { insideBoundary, profilesFor } from "../src/sketch/profiles.js";
import { projectedSketch } from "../src/sketch/projected-sketch.js";
import { undoState } from "./undo-state-fixture.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/section-filleted-junction.json", "utf8"));
const frame: PlaneFrame = fixture.frame;

async function openCapture(owner: DocumentOwner) {
  const document = readArchive(
    JSON.stringify({
      format: "makeshift",
      version: 1,
      document: {
        units: "mm",
        sketches: [],
        bodies: [fixture.body],
      },
    }),
  );
  assert.equal((await owner.call({ kind: "open", document })).error, undefined);
}

test("legacy microscopic filleted shelf refuses splitting without changing history", async () => {
  const owner = new DocumentOwner();
  try {
    await openCapture(owner);
    const before = owner.view.data;
    const history = await undoState(owner);
    // This pre-policy capture has a 0.0008 mm shelf. New solids must satisfy
    // the microscopic topology gate even when legacy geometry did not.
    assert.match(
      (
        await owner.call({
          kind: "plane-cut",
          operation: {
            mode: "split",
            targets: [{ body: "captured" }],
            frame,
          },
        })
      ).error ?? "",
      /microscopic topology repair/,
    );
    assert.equal(owner.view.candidate, null);
    assert.deepEqual(owner.view.data, before);
    assert.deepEqual(await undoState(owner), history);
  } finally {
    owner.close();
  }
});

test("legacy filleted section preserves read-only joins and refuses extrusion without losing history", async () => {
  const owner = new DocumentOwner();
  try {
    await openCapture(owner);
    const before = owner.view.data;
    const reply = await owner.call({ kind: "sections", frame, bodies: ["captured"] });
    assert.equal(reply.error, undefined);
    assert.equal(reply.sections?.length, 1);
    const section = reply.sections?.[0];
    assert.ok(section);
    const profile = sectionProfile(section, frame);
    assert.ok(profile, "native closed face must remain closed after sketch conversion");
    assert.equal(profile.holes.length, 0, "the cavity is open at the top");
    assert.equal(insideBoundary(profile.outer, { x: 0, y: -20 }), true);
    assert.equal(insideBoundary(profile.outer, { x: 0, y: 0 }), false);
    assert.deepEqual(owner.view.data, before, "sections are read-only");
    const copy = projectedSketch(emptySketch(frame), section.curves);
    assert.equal((await owner.call({ kind: "edit", sketch: copy })).error, undefined);
    const copied = owner.view.data.sketches[0];
    const copiedProfile = profilesFor(copied)[0];
    assert.ok(copiedProfile);
    assert.ok(Math.abs(copiedProfile.area - profile.area) < 1e-7);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data.sketches[0], copied);
    const withCopy = owner.view.data;
    const copiedHistory = await undoState(owner);
    assert.match(
      (
        await owner.call({
          kind: "extrude",
          extrusion: {
            sources: [{ sketch: copied.id, profile: copiedProfile.key }],
            distance: 2,
            mode: "new",
          },
        })
      ).error ?? "",
      /microscopic topology repair/,
    );
    assert.equal(owner.view.candidate, null);
    assert.ok((await owner.call({ kind: "accept" })).error);
    assert.deepEqual(owner.view.data, withCopy);
    assert.deepEqual(await undoState(owner), copiedHistory);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, withCopy);
  } finally {
    owner.close();
  }
});
