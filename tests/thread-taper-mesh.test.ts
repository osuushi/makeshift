import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { cylinderCoordinates, cylinderFrame } from "../src/decorators/cylinder.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { MeshScope } from "../src/decorators/mesh-scope.js";
import { threadTolerance } from "../src/decorators/precision.js";
import { threadMeshes, threadRadius } from "../src/decorators/thread-mesh.js";
import { threadDefaults } from "../src/decorators/thread-settings.js";
import { validateMesh } from "../src/model/export-mesh.js";
import type { Vector } from "../src/sketch/planes.js";
import { roundBody } from "./decorator-domain-fixtures.js";

test("overlapping conical tapers retain sharp profile intersections on rod and hole meshes", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await roundBody(owner, [5]);
    const face = body.faces.find((face) => face.cylinder);
    assert.ok(face?.cylinder);
    const frame = cylinderFrame(face.cylinder);
    for (const profile of ["triangle", "metric", "rounded"] as const)
      for (const cut of ["rod", "hole"] as const)
        for (const outward of [1, -1] as const) {
          const settings = { ...threadDefaults(10), profile, cut, startTaper: 6, endTaper: 7 };
          const support = { ...face, cylinder: { ...face.cylinder, outward } };
          const geometry = threadMeshes(frame, [support], settings);
          assert.ok(geometry);
          const mesh = geometry.fill;
          assert.doesNotThrow(() => validateMesh(mesh), `${profile}/${cut}/${outward} fill`);
          const cutter = geometry.cut;
          if (cutter)
            assert.doesNotThrow(() => validateMesh(cutter), `${profile}/${cut}/${outward} cut`);
          const half = mesh.vertices.length / 2;
          const indices = new Set<number>();
          let deviation = 0;
          for (const triangle of mesh.triangles) {
            if (triangle.some((i) => (outward > 0 ? i < half : i >= half))) continue;
            for (const index of triangle) indices.add(index);
            for (const weights of [
              [1 / 3, 1 / 3, 1 / 3],
              [0.5, 0.5, 0],
              [0, 0.5, 0.5],
              [0.5, 0, 0.5],
            ]) {
              const point = [0, 1, 2].map((axis) =>
                triangle.reduce(
                  (sum, index, corner) => sum + mesh.vertices[index][axis] * weights[corner],
                  0,
                ),
              ) as Vector;
              const { angle, z } = cylinderCoordinates(frame, point);
              const expected = threadRadius(5, angle, z, settings, outward, [0, 10]);
              deviation = Math.max(deviation, Math.abs(Math.hypot(point[0], point[1]) - expected));
            }
          }
          assert.ok(
            deviation <= 2 * threadTolerance(settings),
            `${profile}/${cut}/${outward}: ${deviation} mm`,
          );
          assert.ok(
            [...indices].some((index) => Math.abs(mesh.vertices[index][2] - 60 / 13) < 1e-10),
            "The two cones meet on an explicit mesh row",
          );
        }
  } finally {
    owner.close();
  }
});

test("rounded threads with overlapping cones export watertight mating parts", async () => {
  const owner = new DocumentOwner();
  const scope = new MeshScope(await initializeMeshRuntime());
  try {
    const rod = await roundBody(owner, [5]);
    const hole = await roundBody(owner, [8, 5]);
    const faces = [rod, hole].flatMap((body) =>
      body.faces
        .filter((face) => face.cylinder?.radius === 5)
        .map((face) => ({ body: body.id, face: face.id })),
    );
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: "freac.threads",
            faces,
            settings: { profile: "rounded", preset: "custom", startTaper: 6, endTaper: 7 },
          },
        })
      ).error,
      undefined,
    );
    for (const cut of ["rod", "hole"]) {
      const ids = owner.view.data.decorators?.map((instance) => instance.id) ?? [];
      assert.equal(
        (
          await owner.call({
            kind: "decorator",
            edit: {
              action: "settings",
              ids,
              patch: { cut },
            },
          })
        ).error,
        undefined,
      );
      const result = await owner.call({ kind: "export-geometry" });
      assert.ok(result.exportDocument, result.error);
      const meshes = decoratedMeshes(scope.runtime, result.exportDocument);
      const solids = meshes.map((mesh) => scope.from(mesh));
      assert.ok(
        scope.keep(solids[0].intersect(solids[1])).volume() < 1e-6,
        `${cut}: mating cones must not collide`,
      );
    }
  } finally {
    scope.close();
    owner.close();
  }
});
