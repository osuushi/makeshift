import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { BodyErosion } from "../src/model/body.js";
import type { SketchDocument } from "../src/sketch/document.js";

const captures = ["rounded-cylinder", "connected-cylinders"] as const;
for (const name of captures) {
  const fixture = JSON.parse(readFileSync(`tests/fixtures/erosion-${name}.json`, "utf8")) as {
    document: SketchDocument;
    operation: BodyErosion;
  };
  test(`captured ${name} erodes without changing source geometry`, async () => {
    const owner = new DocumentOwner();
    try {
      assert.equal(
        (await owner.call({ kind: "open", document: fixture.document })).error,
        undefined,
      );
      const original = owner.view.data;
      const result = await owner.call({
        kind: "erode",
        operation: { ...fixture.operation, method: "accurate" },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.view.data, original);
      const previous = new Set(original.bodies?.map((body) => body.id));
      const generated = result.view.candidate?.bodies?.filter((body) => !previous.has(body.id));
      assert.equal(generated?.length, 1);
      assert.ok(generated);
      const body = generated[0];
      assert.ok(body.faces.length <= 12, "Output remains compact, editable CAD geometry");
      assert.ok(body.faces.some((face) => face.cylinder));
      const t = fixture.operation.thickness,
        e = fixture.operation.allowance ?? 0;
      assert.ok(body.bounds[2] >= t - 1e-6 && body.bounds[2] <= t + e + 1e-6);
      assert.ok(body.bounds[5] <= 34 - t + 1e-6 && body.bounds[5] >= 34 - t - e - 1e-6);
      if (name === "rounded-cylinder") {
        assert.equal(body.faces.length, 3, "Collapsed toroidal rounds leave a simple cylinder");
        const radius = body.faces.find((face) => face.cylinder)?.cylinder?.radius;
        assert.ok(radius && radius >= 10 - t - e - 1e-6 && radius <= 10 - t + 1e-6);
        assert.ok(
          Math.abs(body.volume - Math.PI * radius ** 2 * (body.bounds[5] - body.bounds[2])) < 1e-5,
        );
      }
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      const accepted = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.equal(owner.view.data, original);
      await owner.call({ kind: "redo" });
      assert.equal(owner.view.data, accepted);
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      assert.deepEqual(
        owner.view.data.bodies?.map((body) => body.id),
        accepted.bodies?.map((body) => body.id),
      );
    } finally {
      owner.close();
    }
  });
}
