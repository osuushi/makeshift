import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { gearPaletteColor } from "../src/decorators/gear-colors.js";
import { gearGroupProblem } from "../src/decorators/gear-group.js";
import { inspectGear } from "../src/decorators/gear-support.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { captured } from "./gear-group-fixture.js";

const profiles = (owner: DocumentOwner) =>
  owner.view.data.decorators?.map((d) => ({
    id: d.id,
    group: d.gearGroup,
    color: d.gearColor,
    radius: d.gearPitchRadius,
    settings: d.settings,
  }));

test("explicit groups retain profiles through exploded placement and refit only their own dimensions", async () => {
  const owner = new DocumentOwner();
  try {
    const faces = await captured(owner);
    for (const face of faces) {
      assert.equal(
        (
          await owner.call({
            kind: "decorator",
            edit: { action: "apply", definition: "freac.gear", faces: [face] },
          })
        ).error,
        undefined,
      );
    }
    const independent = owner.view.data.decorators ?? [];
    assert.notEqual(
      independent[0].gearGroup,
      independent[1].gearGroup,
      "Touching cylinders stay independent",
    );
    assert.notEqual(independent[0].gearColor, independent[1].gearColor);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: "freac.gear",
            faces: [faces[1]],
            gearGroup: independent[0].gearGroup,
          },
        })
      ).error,
      undefined,
    );
    const fitted = profiles(owner);
    for (const transform of [
      { translation: [70, -40, 25] as [number, number, number], angle: 0 },
      { translation: [0, 0, 0] as [number, number, number], angle: 0.7 },
    ]) {
      assert.equal(
        (
          await owner.call({
            kind: "transform-bodies",
            transform: {
              ids: [faces[1].body],
              pivot: [0, 0, 0],
              axis: [1, 0, 0],
              duplicate: false,
              ...transform,
            },
          })
        ).error,
        undefined,
      );
      assert.deepEqual(
        profiles(owner),
        fitted,
        "Position and orientation cannot change compatible tooth profiles",
      );
      for (const gear of owner.view.data.decorators ?? [])
        assert.equal(gearGroupProblem(owner.view.data, gear), null);
    }
    const moved = documentArchive(owner.view.data);
    assert.equal(
      (await owner.call({ kind: "offset-faces", operation: { faces: [faces[0]], distance: 0.27 } }))
        .error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const members = owner.view.data.decorators ?? [];
    assert.notDeepEqual(profiles(owner), fitted);
    assert.equal(members[0].problem, undefined);
    const sizes = members.map((d) => inspectGear(owner.view.data, d).normalModule);
    assert.ok(Math.abs(sizes[0] - sizes[1]) < 1e-10);
    const resized = documentArchive(owner.view.data);
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), moved);
    await owner.call({ kind: "redo" });
    assert.equal(documentArchive(owner.view.data), resized);
    await checkReopened(owner, resized);
  } finally {
    owner.close();
  }
});

test("regrouping and color edits persist with atomic history and independent constraints", async () => {
  const owner = new DocumentOwner();
  try {
    const faces = await captured(owner);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "apply", definition: "freac.gear", faces },
        })
      ).error,
      undefined,
    );
    const original = owner.view.data.decorators ?? [];
    const beforeColor = documentArchive(owner.view.data);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "gear-color", id: original[0].id, color: "#12ABCD" },
        })
      ).error,
      undefined,
    );
    assert.ok(owner.view.data.decorators?.every((d) => d.gearColor === "#12abcd"));
    assert.deepEqual(
      owner.view.data.decorators?.map((d) => d.settings),
      original.map((d) => d.settings),
    );
    await owner.call({ kind: "undo" });
    assert.equal(documentArchive(owner.view.data), beforeColor);
    await owner.call({ kind: "redo" });
    const colored = documentArchive(owner.view.data);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: "freac.gear",
            faces: [faces[1]],
            newGearGroup: true,
          },
        })
      ).error,
      undefined,
    );
    const groups = owner.view.data.decorators ?? [];
    assert.notEqual(groups[0].gearGroup, groups[1].gearGroup);
    assert.notEqual(groups[0].gearColor, groups[1].gearColor);
    const untouched = groups[0];
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: { action: "settings", ids: [groups[1].id], patch: { minimumTooth: 10 } },
        })
      ).error,
      undefined,
    );
    assert.deepEqual(owner.view.data.decorators?.[0], untouched);
    assert.match(owner.view.data.decorators?.[1].problem ?? "", /Gear group cannot fit/);
    const saved = documentArchive(owner.view.data);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(saved) })).error,
      undefined,
    );
    assert.equal(documentArchive(owner.view.data), saved);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(colored) })).error,
      undefined,
    );
    assert.ok(owner.view.data.decorators?.every((d) => d.gearColor === "#12abcd"));
  } finally {
    owner.close();
  }
});

test("gear palette distinguishes hue rounds and later lightness/saturation rounds", () => {
  const colors = Array.from({ length: 108 }, (_, i) => gearPaletteColor(i));
  assert.equal(new Set(colors).size, colors.length);
  for (const color of colors) assert.match(color, /^#[\da-f]{6}$/);
});

async function checkReopened(owner: DocumentOwner, archive: string) {
  const geometry = owner.view.data.bodies ?? [];
  const decorators = readArchive(archive).decorators;
  assert.equal(
    (await owner.call({ kind: "open", document: readArchive(archive) })).error,
    undefined,
  );
  assert.deepEqual(owner.view.data.decorators, decorators);
  for (const [index, body] of (owner.view.data.bodies ?? []).entries()) {
    const saved = geometry[index];
    assert.equal(body.id, saved.id);
    assert.ok(Math.abs(body.volume - saved.volume) < 1e-7);
    assert.ok(body.center.every((v, i) => Math.abs(v - saved.center[i]) < 1e-9));
  }
}
