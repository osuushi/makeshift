import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Face } from "../src/model/body.js";
import { finish } from "./body-edge-fixtures.js";
import { cutOpenings, rimEdges, sameSolid, stock } from "./fillet-support-fixtures.js";

for (const mode of ["fillet", "chamfer"] as const)
  for (const kind of ["box", "cylinder", "pocket"] as const)
    test(`${kind} ${mode} rim blends from its supports then trims arbitrary opening boundaries`, async () => {
      const owner = new DocumentOwner(),
        reference = new DocumentOwner();
      try {
        await stock(owner, kind);
        const body = await cutOpenings(owner, kind);
        const original = owner.view.data;
        const edges = rimEdges(body);
        assert.equal(edges.length, kind === "cylinder" ? 1 : 4);
        for (const radius of [6, 12]) {
          const result = await finish(owner, body, edges, radius, mode);
          assert.equal(owner.view.edgeSize, radius);
          assert.equal(owner.view.data, original);
          assert.ok(
            result.faces.every((face) =>
              [0, 1, mode === "fillet" ? 4 : 2].includes(face.signature[0]),
            ),
            "No artificial spline patches at the openings",
          );
          assert.equal(
            result.faces.filter((face) => face[mode === "fillet" ? "blend" : "chamfer"]).length,
            kind === "cylinder" ? 1 : 4,
          );
          for (const hole of body.faces.filter((face) => face.cylinder?.outward === -1)) {
            const continued = result.faces.find((face) => face.id === hole.id);
            assert.ok(continued);
            assert.deepEqual(continued.cylinder, hole.cylinder);
          }
          const clean = await stock(reference, kind);
          await finish(reference, clean, rimEdges(clean), radius, mode);
          await reference.call({ kind: "accept" });
          // A 12 mm bevel lies entirely below this 2 mm-deep pocket.
          const expected =
            kind === "pocket" && mode === "chamfer" && radius === 12
              ? reference.view.data.bodies?.[0]
              : await cutOpenings(reference, kind);
          assert.ok(expected);
          await sameSolid(result, expected);
          await reference.call({ kind: "open", document: { units: "mm", sketches: [] } });
        }
        await owner.call({ kind: "accept" });
        const accepted = owner.view.data;
        await owner.call({ kind: "undo" });
        assert.deepEqual(owner.view.data, original);
        await owner.call({ kind: "redo" });
        assert.deepEqual(owner.view.data, accepted);
        assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
        const rounded = owner.view.data.bodies?.[0];
        assert.ok(rounded);
        const faces = rounded.faces
          .filter((face) => face[mode === "fillet" ? "blend" : "chamfer"])
          .map((face) => ({ body: rounded.id, face: face.id }));
        const resized = await owner.call({
          kind: "offset-faces",
          operation: {
            faces,
            radius: 6,
            distance: 0,
            ...(mode === "chamfer" ? { chamfer: true } : {}),
          },
        });
        assert.equal(resized.error, undefined);
        assert.ok(resized.view.candidate?.bodies?.[0]);
        assert.ok(
          resized.view.candidate.bodies[0].faces.every((face) =>
            [0, 1, mode === "fillet" ? 4 : 2].includes(face.signature[0]),
          ),
        );
        assert.ok(
          resized.view.candidate.bodies[0].faces
            .filter((face) => face[mode === "fillet" ? "blend" : "chamfer"])
            .every(
              (face) =>
                Math.abs(
                  (mode === "fillet" ? (face.blend?.radius ?? 0) : (face.chamfer?.distance ?? 0)) -
                    6,
                ) < 1e-7,
            ),
        );
      } finally {
        owner.close();
        reference.close();
      }
    });

for (const mode of ["fillet", "chamfer"] as const)
  test(`captured notched support ${mode} crosses the bore without requiring convex end caps`, async () => {
    const fixture = JSON.parse(readFileSync("tests/fixtures/fillet-notched-bore.json", "utf8"));
    const owner = new DocumentOwner();
    try {
      assert.equal(
        (await owner.call({ kind: "open", document: fixture.document })).error,
        undefined,
      );
      const captured = owner.view.data.bodies?.[0];
      assert.ok(captured);
      // Capture followed acceptance. Recover exactly its original support edge;
      // no replay of the source sketch or invented replacement solid is involved.
      assert.equal(
        (
          await owner.call({
            kind: "delete-topology",
            selection: [
              { body: captured.id, whole: false, faces: fixture.facesToRemove, edges: [] },
            ],
          })
        ).error,
        undefined,
      );
      const body = owner.view.data.bodies?.[0];
      assert.ok(body);
      const edges = body.edges.filter(
        (edge) =>
          edge.curve?.kind === "line" &&
          [edge.curve.a, edge.curve.b].every(
            (p) => Math.abs(p[1] + 9.5) < 1e-7 && Math.abs(p[2] - 28.5) < 1e-7,
          ),
      );
      assert.equal(edges.length, 1);
      for (const radius of [3.5, 6, 12]) {
        const result = await finish(owner, body, edges, radius, mode);
        assert.equal(owner.view.edgeSize, radius);
        assert.equal(result.faces.length, 16);
        assert.ok(result.faces.every((face) => face.plane || face.cylinder));
        assert.equal(
          result.faces.filter((face) => (mode === "fillet" ? face.blend : face.chamfer)).length,
          1,
        );
        assert.ok(
          Math.abs(
            (mode === "fillet"
              ? (result.faces.find((face) => face.blend)?.blend?.radius ?? 0)
              : (result.faces.find((face) => face.chamfer)?.chamfer?.distance ?? 0)) - radius,
          ) < 1e-7,
        );
        const hole: Face | undefined = body.faces.find((face) => face.cylinder?.outward === -1);
        assert.ok(hole);
        assert.deepEqual(result.faces.find((face) => face.id === hole.id)?.cylinder, hole.cylinder);
      }
    } finally {
      owner.close();
    }
  });
