import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import {
  boreInteriorVolume,
  erosionBores,
  lobedErosionSource,
} from "./erosion-sections-fixtures.js";
import { checkErosionMaterial } from "./erosion-special-probes.js";

for (const maxFaces of [32, 128]) {
  test(`Fast preserves a useful captured lobed interior with a ${maxFaces}-face budget`, async () => {
    const owner = new DocumentOwner();
    try {
      assert.equal(
        (await owner.call({ kind: "open", document: lobedErosionSource })).error,
        undefined,
      );
      const before = owner.view.data;
      const source = before.bodies?.[0];
      assert(source);
      const reply = await owner.call({
        kind: "erode",
        operation: { ids: [source.id], thickness: 1, maxFaces, method: "fast" },
      });
      assert.equal(reply.error, undefined);
      assert.equal(owner.view.data, before);
      const bodies = reply.view.candidate?.bodies;
      assert(bodies && bodies.length === 2);
      const cavity = bodies[1];
      assert(cavity.volume > source.volume * 0.68 && cavity.volume < source.volume * 0.82);
      assert(cavity.faces.length <= maxFaces);
      const quality = reply.view.erosionQuality?.[0];
      assert(quality && quality.samples > 0 && quality.sampledFitDeviation > 0);
      assert.equal(quality.faces, cavity.faces.length);
      assert(cavity.faces.every((face) => !source.faces.some((old) => old.id === face.id)));
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      const accepted = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.equal(owner.view.data, before);
      await owner.call({ kind: "redo" });
      assert.equal(owner.view.data, accepted);
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      assert.deepEqual(
        owner.view.data.bodies?.[1].faces.map((face) => face.id),
        cavity.faces.map((face) => face.id),
      );
      const moved = await owner.call({
        kind: "transform-bodies",
        transform: {
          ids: [cavity.id],
          pivot: [0, 0, 0],
          axis: [0, 0, 1],
          angle: 0,
          translation: [0.2, 0, 0],
          duplicate: false,
        },
      });
      assert.equal(moved.error, undefined);
      const shifted = moved.view.data.bodies?.find((body) => body.id === cavity.id);
      assert(shifted && Math.abs(shifted.center[0] - cavity.center[0] - 0.2) < 1e-6);
      await owner.call({ kind: "undo" });
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      const cut = await owner.call({
        kind: "boolean-bodies",
        operation: { ids: [source.id, cavity.id], mode: "subtract", keepOriginals: false },
      });
      assert.equal(cut.error, undefined);
      const wall = cut.view.candidate?.bodies;
      assert(wall && wall.length === 1);
      assert(Math.abs(wall[0].volume - source.volume + cavity.volume) < 1e-3);
      await owner.call({ kind: "accept" });
      assert.equal(
        (await owner.call({ kind: "open", document: owner.view.data })).error,
        undefined,
      );
    } finally {
      owner.close();
    }
  });
}

test("Fast preserves two through-bores, their expanded clearances, and required interior", async () => {
  const owner = new DocumentOwner();
  try {
    const source = await erosionBores(owner);
    const before = owner.view.data;
    const reply = await owner.call({
      kind: "erode",
      operation: { ids: [source.id], thickness: 1 },
    });
    assert.equal(reply.error, undefined);
    const cavity = reply.view.candidate?.bodies?.find((body) => body.id !== source.id);
    assert(cavity);
    assert(cavity.volume > boreInteriorVolume(1.25) && cavity.volume < boreInteriorVolume(0.75));
    assert(cavity.faces.length <= 128);
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    await checkErosionMaterial(owner, "section-bores", [cavity.id]);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    const cut = await owner.call({
      kind: "boolean-bodies",
      operation: { ids: [source.id, cavity.id], mode: "subtract", keepOriginals: false },
    });
    assert.equal(cut.error, undefined);
    const wall = cut.view.candidate?.bodies;
    assert(wall && wall.length === 1);
    assert(Math.abs(wall[0].volume - source.volume + cavity.volume) < 1e-3);
    await owner.call({ kind: "accept" });
    assert.equal((await owner.call({ kind: "open", document: owner.view.data })).error, undefined);
  } finally {
    owner.close();
  }
});
