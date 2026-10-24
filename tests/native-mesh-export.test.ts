import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { MeshCalculator } from "../src/backend/mesh-calculator.js";
import { decoratedMeshes, initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { MeshScope } from "../src/decorators/mesh-scope.js";
import { nativeDecoratedMeshes } from "../src/decorators/native-export.js";
import { encodeMeshes } from "../src/model/mesh-export.js";
import { roundBody } from "./decorator-domain-fixtures.js";

async function compare(owner: DocumentOwner) {
  const before = structuredClone(owner.view);
  const prepared = await owner.call({ kind: "export-geometry" });
  assert.equal(prepared.error, undefined);
  assert.ok(prepared.exportDocument);
  const runtime = await initializeMeshRuntime(),
    calculator = new MeshCalculator();
  const scope = new MeshScope(runtime);
  try {
    const native = await nativeDecoratedMeshes(prepared.exportDocument, (input) =>
      calculator.calculate(input),
    );
    const wasm = decoratedMeshes(runtime, prepared.exportDocument);
    assert.equal(native.length, wasm.length);
    for (let i = 0; i < native.length; i++) {
      const a = scope.from(native[i]),
        b = scope.from(wasm[i]);
      const difference = scope.keep(a.subtract(b)).volume() + scope.keep(b.subtract(a)).volume();
      assert.ok(Math.abs(difference) < 0.002, `symmetric difference ${difference} mm³`);
      assert.ok(Math.abs(a.surfaceArea() - b.surfaceArea()) < 0.002);
      for (const format of ["stl", "3mf"] as const)
        assert.ok(encodeMeshes([native[i]], format).length > 100);
    }
    assert.deepEqual(owner.view, before);
  } finally {
    scope.close();
    calculator.close();
  }
}

for (const [definition, internal, cut] of [
  ["freac.threads", false, "rod"],
  ["freac.threads", false, "hole"],
  ["freac.threads", true, "rod"],
  ["freac.threads", true, "hole"],
  ["freac.knurling", false, "rod"],
  ["freac.gear", false, "rod"],
] as const) {
  test(`native export matches WASM: ${definition}, internal=${internal}, cut=${cut}`, async () => {
    const owner = new DocumentOwner();
    try {
      // Default spur fitting needs room for printable tips without undercut teeth.
      const radius = definition === "freac.gear" ? 13 : 5;
      const body = await roundBody(owner, internal ? [8, radius] : [radius], 5);
      const faces = body.faces
        .filter((f) => f.cylinder?.radius === radius)
        .map((f) => ({ body: body.id, face: f.id }));
      assert.equal(
        (
          await owner.call({
            kind: "decorator",
            edit: {
              action: "apply",
              definition,
              faces,
              ...(definition === "freac.threads" ? { settings: { cut } } : {}),
            },
          })
        ).error,
        undefined,
      );
      await compare(owner);
    } finally {
      owner.close();
    }
  });
}
for (const name of ["thread-boolean-sliver", "thread-coarse-exit"]) {
  test(`native export retains precision on ${name}`, async () => {
    const fixture = JSON.parse(readFileSync(`tests/fixtures/${name}.json`, "utf8"));
    const owner = new DocumentOwner();
    try {
      assert.equal(
        (
          await owner.call({
            kind: "open",
            document: fixture.snapshot?.document ?? fixture.document,
          })
        ).error,
        undefined,
      );
      await compare(owner);
    } finally {
      owner.close();
    }
  });
}

test("native clipping preserves a transverse bore", async () => {
  const owner = new DocumentOwner();
  try {
    const original = await roundBody(owner, [5]);
    const { emptySketch } = await import("../src/sketch/document.js");
    const { planes } = await import("../src/sketch/planes.js");
    const { profilesFor } = await import("../src/sketch/profiles.js");
    const sketch = {
      ...emptySketch({ ...planes.YZ, origin: [-10, 4, 5] }),
      curves: [
        {
          id: "bore",
          kind: "circle" as const,
          radius: 3,
          center: { x: 0, y: 0 },
          construction: false,
        },
      ],
    };
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    assert.equal(
      (
        await owner.call({
          kind: "extrude",
          extrusion: {
            sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
            distance: 20,
            mode: "subtract",
            targets: [original.id],
          },
        })
      ).error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: "freac.threads",
            faces: body.faces
              .filter((f) => f.cylinder?.radius === 5)
              .map((f) => ({ body: body.id, face: f.id })),
            settings: { cut: "hole" },
          },
        })
      ).error,
      undefined,
    );
    await compare(owner);
  } finally {
    owner.close();
  }
});

test("native integration accepts enabled custom modifier meshes", async () => {
  const owner = new DocumentOwner(),
    calculator = new MeshCalculator();
  try {
    const definition = JSON.parse(readFileSync("examples/decorators/raised-pad.json", "utf8"));
    const body = await roundBody(owner);
    const cap = body.faces.find((f) => f.plane && Math.abs(f.signature[5] - 10) < 1e-7);
    assert.ok(cap);
    assert.equal(
      (await owner.call({ kind: "decorator-definition", edit: { action: "install", definition } }))
        .error,
      undefined,
    );
    assert.equal(
      (await owner.call({ kind: "decorator-enable", id: definition.id, version: 1, enabled: true }))
        .error,
      undefined,
    );
    assert.equal(
      (
        await owner.call({
          kind: "decorator",
          edit: {
            action: "apply",
            definition: definition.id,
            faces: [{ body: body.id, face: cap.id }],
          },
        })
      ).error,
      undefined,
    );
    const { JavaScriptDecorators } = await import("../src/decorators/javascript-hooks.js");
    const { initializeDecoratorRuntime } = await import("../src/decorators/javascript-runtime.js");
    const hooks = new JavaScriptDecorators(
      await initializeDecoratorRuntime(),
      owner.view.decoratorSources,
    );
    const { exportDocument } = await owner.call({ kind: "export-geometry" });
    assert.ok(exportDocument);
    const meshes = await nativeDecoratedMeshes(
      exportDocument,
      (input) => calculator.calculate(input),
      hooks,
    );
    assert.ok(meshes[0].vertices.some((p) => p[2] > 10.9));
    await assert.rejects(
      nativeDecoratedMeshes(exportDocument, (input) => calculator.calculate(input)),
      /Enable bundled code/,
    );
  } finally {
    owner.close();
    await calculator.cancel();
  }
});
