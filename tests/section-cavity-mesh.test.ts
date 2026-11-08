import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { readArchive } from "../src/model/document-archive.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/section-cavity-rings.json", "utf8"));
test("captured cavity rings mesh their trimmed area instead of overlapping the floor", async () => {
  const owner = new DocumentOwner();
  try {
    const document = readArchive(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    );
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    // OCCT's read/write cycle normalizes some signed zero coordinates.
    const geometryTokens = (brep: string) =>
      Buffer.from(brep, "hex")
        .toString()
        .split(/\s+/)
        .map((v) => (v === "-0" ? "0" : v));
    assert.deepEqual(
      geometryTokens(body.brep),
      geometryTokens(document.bodies?.[0].brep ?? ""),
      "Meshing must not modify accepted geometry",
    );
    const segments = new Map<string, number>();
    for (const face of body.faces) {
      const v = face.vertices;
      let area = 0;
      for (let i = 0; i < v.length; i += 9) {
        const corners = [0, 3, 6].map((j) =>
          v
            .slice(i + j, i + j + 3)
            .map((n) => Math.round(n * 1e7))
            .join(","),
        );
        if (new Set(corners).size === 3)
          for (let j = 0; j < 3; j++) {
            const key = [corners[j], corners[(j + 1) % 3]].sort().join(";");
            segments.set(key, (segments.get(key) ?? 0) + 1);
          }
        const a = [0, 1, 2].map((j) => v[i + 3 + j] - v[i + j]);
        const b = [0, 1, 2].map((j) => v[i + 6 + j] - v[i + j]);
        area +=
          Math.hypot(
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
          ) / 2;
      }
      assert.ok(
        Math.abs(area - face.signature[2]) < face.signature[2] * 0.1,
        `${face.id}: mesh ${area}, exact ${face.signature[2]}`,
      );
    }
    assert.equal(
      [...segments.values()].filter((count) => count !== 2).length,
      0,
      "Refined rings and adjacent faces must form a closed mesh for section parity",
    );
  } finally {
    owner.close();
  }
});
