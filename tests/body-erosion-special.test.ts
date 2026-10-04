import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { erosionSpecialCases } from "./erosion-special-fixtures.js";
import { checkErosionMaterial } from "./erosion-special-probes.js";

for (const entry of erosionSpecialCases) {
  test(`special erosion: ${entry.name}`, async () => {
    const owner = new DocumentOwner();
    try {
      const source = await entry.build(owner);
      const before = owner.view.data;
      if (process.env.MAKESHIFT_EROSION_ARTIFACTS) {
        await mkdir(".cache/erosion-special", { recursive: true });
        await writeFile(
          `.cache/erosion-special/${entry.name}.makeshift`,
          JSON.stringify({ format: "makeshift", version: 1, document: before }),
        );
      }
      const reply = await owner.call({
        kind: "erode",
        operation: {
          method: "accurate",
          ids: [source.id],
          thickness: entry.thickness,
          allowance: entry.allowance,
        },
      });
      assert.equal(reply.error, undefined);
      assert.equal(reply.view.data, before);
      const generated = reply.view.candidate?.bodies?.filter((body) => body.id !== source.id) ?? [];
      assert.equal(generated.length, entry.count ?? 1);
      if (entry.volume !== undefined) {
        const actual = generated.reduce((sum, body) => sum + body.volume, 0);
        assert.ok(Math.abs(actual - entry.volume) < 1e-4, `${actual} != ${entry.volume}`);
      }
      assert.ok(
        generated.every((body) => body.faces.length <= 40),
        "Compact editable result",
      );
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data;
      if (generated.length) {
        await owner.call({ kind: "undo" });
        assert.equal(owner.view.data, before);
        await owner.call({ kind: "redo" });
        assert.equal(owner.view.data, accepted);
      }
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      await checkErosionMaterial(
        owner,
        entry.name,
        generated.map((body) => body.id),
      );
    } finally {
      owner.close();
    }
  });
}
