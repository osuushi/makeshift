import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";

// Independent cross-section integration: intersect two offset circles at each
// height, including the captured 2.5 mm round at the bore's mouth.
function expectedVolume(size: number, chamfer: boolean) {
  const overlap = (a: number, b: number) => {
    const d = 30;
    if (d + b <= a) return Math.PI * b * b;
    if (d >= a + b) return 0;
    return (
      a * a * Math.acos((d * d + a * a - b * b) / (2 * d * a)) +
      b * b * Math.acos((d * d + b * b - a * a) / (2 * d * b)) -
      0.5 * Math.sqrt((-d + a + b) * (d + a - b) * (d - a + b) * (d + a + b))
    );
  };
  const area = (z: number) => {
    const t = Math.max(0, z - (24 - size));
    const outer = chamfer ? 40 - t : 40 - size + Math.sqrt(size * size - t * t);
    const mouth = Math.max(0, z - 21.5);
    const hole = 6.5 - Math.sqrt(6.25 - mouth * mouth);
    return Math.PI * outer * outer - overlap(outer, hole);
  };
  const n = 40000,
    step = 24 / n;
  let sum = area(0) + area(24);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * area(i * step);
  return (sum * step) / 3;
}

for (const mode of ["fillet", "chamfer"] as const)
  test(`${mode} trims an already rounded hole mouth without a reversed lid or overlapping surfaces`, async () => {
    // Reconstructed from the reported capture's exact sketch and finish sizes;
    // this fixture stores the materialized solid immediately before the bad edit.
    const fixture = JSON.parse(readFileSync("tests/fixtures/fillet-rounded-bore.json", "utf8"));
    const owner = new DocumentOwner();
    try {
      assert.equal(
        (await owner.call({ kind: "open", document: fixture.document })).error,
        undefined,
      );
      const original = owner.view.data;
      const reply = await owner.call({
        kind: "finish-edges",
        operation: { ...fixture.operation, mode },
      });
      assert.equal(reply.error, undefined);
      assert.equal(reply.view.edgeSize, 9.5);
      const body = reply.view.candidate?.bodies?.[0];
      assert.ok(body);
      assert.equal(body.faces.length, 6);
      assert.equal(body.faces.filter((f) => f.plane).length, 2);
      assert.ok(Math.abs(body.volume - expectedVolume(9.5, mode === "chamfer")) < 0.002);
      const mouth = original.bodies?.[0].faces.find((f) => f.blend?.radius === 2.5);
      assert.ok(mouth);
      assert.equal(body.faces.find((f) => f.id === mouth.id)?.blend?.radius, 2.5);
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, original);
      await owner.call({ kind: "redo" });
      assert.deepEqual(owner.view.data, accepted);
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      const outer = body.faces.find((f) =>
        mode === "fillet" ? f.blend?.radius === 9.5 : f.chamfer?.distance === 9.5,
      );
      assert.ok(outer);
      const resized = await owner.call({
        kind: "offset-faces",
        operation: {
          faces: [{ body: body.id, face: outer.id }],
          radius: 8,
          distance: 0,
          ...(mode === "chamfer" ? { chamfer: true } : {}),
        },
      });
      assert.equal(resized.error, undefined);
      const changed = resized.view.candidate?.bodies?.[0];
      assert.ok(changed);
      assert.ok(Math.abs(changed.volume - expectedVolume(8, mode === "chamfer")) < 0.002);
    } finally {
      owner.close();
    }
  });
