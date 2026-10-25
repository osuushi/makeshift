import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { decoratorPreview, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { normalChart } from "../src/decorators/normal-projection-charts.js";
import { rasterNormalProjection } from "../src/decorators/normal-projection-raster.js";
import { NormalProjectionRays } from "../src/decorators/normal-projection-rays.js";
import { type PackedPreviewMesh, packPreviewMesh } from "../src/decorators/preview-wire.js";
import type { Face } from "../src/model/body.js";
import type { SketchDocument } from "../src/sketch/document.js";

function compare(face: Face, mesh: PackedPreviewMesh) {
  // Even resolution avoids sampling the fixture's exact z=13 crease, whose two normals are both valid.
  const chart = normalChart(face, 48);
  const raster = rasterNormalProjection(mesh, chart);
  const reference = new NormalProjectionRays(mesh);
  const point = new THREE.Vector3(),
    normal = new THREE.Vector3();
  for (let y = 0; y < chart.size; y++)
    for (let x = 0; x < chart.size; x++) {
      chart.sample((x + 0.5) / chart.size, (y + 0.5) / chart.size, point, normal);
      const expected = reference
        .normal(point, normal)
        .toArray()
        .map((v) => Math.round((v * 0.5 + 0.5) * 255));
      for (let channel = 0; channel < 3; channel++)
        assert.ok(
          Math.abs(raster[(y * chart.size + x) * 4 + channel] - expected[channel]) <= 1,
          `${face.id}: normal differs at ${x},${y} channel ${channel}`,
        );
    }
}

for (const cone of [false, true])
  test(`${cone ? "cone" : "cylinder"} raster covers curved triangle interiors and seams like exact rays`, () => {
    const geometry = new THREE.CylinderGeometry(cone ? 1 : 2, 2, 2, 17, 3, true).toNonIndexed();
    geometry.rotateY(0.177);
    const vertices = [...geometry.attributes.position.array];
    const face: Face = {
      id: cone ? "cone" : "cylinder",
      vertices,
      edges: [],
      signature: [],
      plane: null,
      ...(cone
        ? {
            cone: {
              apex: [0, 3, 0] as [number, number, number],
              axis: [0, -1, 0] as [number, number, number],
              semiAngle: Math.atan(0.5),
              outward: 1 as const,
            },
          }
        : {
            cylinder: {
              origin: [0, 0, 0] as [number, number, number],
              axis: [0, 1, 0] as [number, number, number],
              radius: 2,
              outward: 1 as const,
            },
          }),
    };
    const positions = new Float32Array(vertices);
    for (let i = 0; i < positions.length; i += 3) {
      const radial =
        1 + 0.15 * Math.sin(positions[i + 1] * 3 + Math.atan2(positions[i + 2], positions[i]) * 5);
      positions[i] *= radial;
      positions[i + 2] *= radial;
    }
    compare(face, {
      positions,
      indices: Uint32Array.from({ length: vertices.length / 3 }, (_, i) => i),
    });
    geometry.dispose();
  });

test("captured male and female thread projections match exact ray normals", async () => {
  const { document } = JSON.parse(
    await readFile("tests/fixtures/thread-preview-rim.json", "utf8"),
  ) as { document: SketchDocument };
  const runtime = await initializeMeshRuntime();
  for (const instance of document.decorators ?? []) {
    const mesh = packPreviewMesh(decoratorPreview(runtime, document, instance));
    for (const reference of instance.faces) {
      const face = document.bodies
        ?.find((body) => body.id === reference.body)
        ?.faces.find((face) => face.id === reference.face);
      assert.ok(face);
      compare(face, mesh);
    }
  }
});
