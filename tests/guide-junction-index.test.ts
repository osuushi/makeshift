import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { incidentEdges } from "../src/guides/edge-junctions.js";
import { edgeFeature, junction, near } from "../src/guides/geometry.js";
import type { BodyGeometry, Edge } from "../src/model/body.js";
import { featureEdges } from "../src/model/feature-edges.js";
import type { SketchDocument } from "../src/sketch/document.js";
import type { Vector } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

function scan(body: BodyGeometry, point: Vector): Edge[] {
  return featureEdges(body).filter((edge) =>
    (["start", "end"] as const).some((feature) => {
      const endpoint = edgeFeature(edge, feature);
      return endpoint && near(point, endpoint);
    }),
  );
}
function line(id: string, a: Vector, b: Vector = [10, 0, 0]): Edge {
  return { id, signature: [], points: [], curve: { kind: "line", a, b } };
}
function body(edges: Edge[]): BodyGeometry {
  return { id: "body", edges, faces: [], volume: 0, center: [0, 0, 0], bounds: [] };
}

test("junction lookup retains exact tolerance across cells, edge order, ambiguity and replaced geometry", () => {
  const source = body([
    line("negative", [-0.2e-7, 0, 0]),
    line("positive", [0.2e-7, 0, 0]),
    line("far", [1.1e-7, 0, 0]),
    line("diagonal", [0.8e-7, 0.8e-7, 0.8e-7]),
    line("short", [0, 0, 0], [0.1e-7, 0, 0]),
  ]);
  for (const point of [
    [0, 0, 0],
    [-1e-7, 0, 0],
    [0.99e-7, 0, 0],
  ] as Vector[])
    assert.deepEqual(incidentEdges(source, point), scan(source, point));
  assert.deepEqual(
    incidentEdges(source, [0, 0, 0]).map((edge) => edge.id),
    ["negative", "positive", "short"],
  );
  const ambiguous = body([line("a", [0, 0, 0]), line("b", [0, 0, 0])]);
  assert.equal(junction(incidentEdges(ambiguous, [0, 0, 0])), null);
  const moved = { ...source, edges: source.edges.map((edge) => line(edge.id, [20, 0, 0])) };
  assert.deepEqual(incidentEdges(moved, [0, 0, 0]), []);
  assert.equal(incidentEdges(source, [0, 0, 0]).length, 3);
});

test("captured perforated solid preserves all junction incidences without scanning every edge per endpoint", async () => {
  const fixture = JSON.parse(
    readFileSync("tests/fixtures/extrude-connected-drain.json", "utf8"),
  ) as {
    document: SketchDocument;
  };
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const sketch = owner.view.data.sketches[0];
    const reply = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
        distance: 5,
        mode: "new",
      },
    });
    assert.equal(reply.error, undefined);
    const solid = reply.view.candidate?.bodies?.[0];
    assert.ok(solid);
    for (const edge of featureEdges(solid))
      for (const feature of ["start", "end"] as const) {
        const point = edgeFeature(edge, feature);
        if (point) assert.deepEqual(incidentEdges(solid, point), scan(solid, point));
      }
  } finally {
    owner.close();
  }
});
