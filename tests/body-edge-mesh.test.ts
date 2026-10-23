import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import { featureEdges } from "../src/model/feature-edges.js";

function vertex(values: number[], offset: number): string {
  return values
    .slice(offset, offset + 3)
    .map((v) => Math.round(v * 1e7))
    .join(",");
}
function segment(a: string, b: string): string {
  return [a, b].sort().join(";");
}
function assertMeshBoundaries(body: Body): void {
  for (const edge of featureEdges(body)) {
    const adjacent = body.faces.filter((face) => face.edges.includes(edge.id));
    assert.ok(adjacent.length > 0);
    assert.ok(edge.points.length >= 6);
    for (const face of adjacent) {
      const segments = new Map<string, number>();
      for (let i = 0; i < face.vertices.length; i += 9) {
        const corners = [0, 3, 6].map((j) => vertex(face.vertices, i + j));
        for (let j = 0; j < 3; j++) {
          const key = segment(corners[j], corners[(j + 1) % 3]);
          segments.set(key, (segments.get(key) ?? 0) + 1);
        }
      }
      for (let i = 3; i < edge.points.length; i += 3)
        assert.equal(
          segments.get(segment(vertex(edge.points, i - 3), vertex(edge.points, i))),
          1,
          `Edge ${edge.id} segment ${i / 3} must follow adjacent face ${face.id}'s mesh`,
        );
    }
  }
}

// The captured circular chords cut underneath the fillet triangles between samples.
// Checking complete segments (not just endpoints) prevents independent resampling.
test("captured rounded rim edges follow both adjacent meshes after open and translation", async () => {
  const body = JSON.parse(readFileSync("tests/fixtures/rounded-rim.json", "utf8")) as Body;
  const owner = new DocumentOwner();
  try {
    const opened = await owner.call({
      kind: "open",
      document: { units: "mm", sketches: [], bodies: [body] },
    });
    assert.equal(opened.error, undefined);
    const restored = owner.view.data.bodies?.[0];
    assert.ok(restored);
    assertMeshBoundaries(restored);
    assert.ok(Math.abs(restored.volume - body.volume) < 1e-7);
    assert.deepEqual(
      restored.edges.map((e) => e.id),
      body.edges.map((e) => e.id),
    );
    const moved = await owner.call({
      kind: "transform-bodies",
      transform: {
        ids: [restored.id],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
        translation: [23, -17, 8],
        duplicate: false,
      },
    });
    assert.equal(moved.error, undefined);
    const translated = owner.view.data.bodies?.[0];
    assert.ok(translated);
    for (const [i, offset] of [23, -17, 8].entries())
      assert.ok(Math.abs(translated.center[i] - restored.center[i] - offset) < 1e-7);
    assertMeshBoundaries(translated);
  } finally {
    owner.close();
  }
});
