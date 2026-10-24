import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { strFromU8, unzipSync } from "three/addons/libs/fflate.module.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { type ExportMesh, exportMesh, validateMesh } from "../src/model/export-mesh.js";
import { exportBodies } from "../src/model/mesh-export.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { profileAt } from "../src/sketch/profiles.js";

function decodeSTL(bytes: Uint8Array<ArrayBuffer>): ExportMesh {
  const geometry = new STLLoader().parse(bytes.buffer);
  const points = geometry.attributes.position.array;
  const vertices: number[][] = [],
    triangles: number[][] = [];
  const ids = new Map<string, number>();
  for (let i = 0; i < points.length; i += 9) {
    const triangle: number[] = [];
    for (const offset of [0, 3, 6]) {
      const point = Array.from(points.slice(i + offset, i + offset + 3));
      const key = point.join(",");
      let id = ids.get(key);
      if (id === undefined) {
        id = vertices.length;
        vertices.push(point);
        ids.set(key, id);
      }
      triangle.push(id);
    }
    triangles.push(triangle);
  }
  geometry.dispose();
  return { vertices, triangles };
}
function decode3MF(bytes: Uint8Array<ArrayBuffer>): ExportMesh {
  const model = strFromU8(unzipSync(bytes)["3D/3dmodel.model"]);
  assert.equal((model.match(/<object /g) ?? []).length, 1);
  assert.match(model, /unit="millimeter"/);
  return {
    vertices: [...model.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map((match) =>
      match.slice(1).map(Number),
    ),
    triangles: [...model.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].map((match) =>
      match.slice(1).map(Number),
    ),
  };
}
function volume(mesh: ExportMesh): number {
  return mesh.triangles.reduce((sum, triangle) => {
    const [a, b, c] = triangle.map((id) => mesh.vertices[id]);
    return (
      sum +
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
        6
    );
  }, 0);
}

for (const name of ["tangent-circles", "tangent-circles-post"])
  test(`${name}: rounded crescent exports printable STL and 3MF before and after reopening`, async () => {
    const owner = new DocumentOwner();
    try {
      const document = JSON.parse(readFileSync(`tests/fixtures/${name}.json`, "utf8"))
        .document as SketchDocument;
      assert.equal((await owner.call({ kind: "open", document })).error, undefined);
      const sketch = owner.view.data.sketches[0];
      const profile = profileAt(sketch, { x: -5, y: 0 });
      assert.ok(profile);
      const response = await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: profile.key }],
          distance: 6,
          mode: "auto",
        },
      });
      assert.equal(response.error, undefined);
      const preview = owner.view.candidate?.bodies?.[0];
      assert.ok(preview);
      assert.ok(exportMesh(preview).triangles.length > 0);
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      for (const reopen of [false, true]) {
        if (reopen)
          assert.equal(
            (await owner.call({ kind: "open", document: owner.view.data })).error,
            undefined,
          );
        const before = structuredClone(owner.view);
        const prepared = await owner.call({ kind: "export-geometry" });
        assert.equal(prepared.error, undefined);
        const bodies = prepared.exportDocument?.bodies;
        assert.equal(bodies?.length, 1);
        const body = bodies[0];
        for (const format of ["stl", "3mf"] as const) {
          const bytes = exportBodies(bodies, format);
          const mesh = format === "stl" ? decodeSTL(bytes) : decode3MF(bytes);
          validateMesh(mesh);
          assert.ok(Math.abs(volume(mesh) / body.volume - 1) < 0.002);
        }
        assert.deepEqual(owner.view, before, "Export does not change accepted CAD or Undo");
        // A real missing face still rejects; the rounded relief does not bypass validation.
        assert.throws(
          () => exportBodies([{ ...body, faces: body.faces.slice(1) }], "3mf"),
          /not closed/,
        );
      }
    } finally {
      owner.close();
    }
  });
