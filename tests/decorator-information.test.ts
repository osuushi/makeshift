import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { threadInformation } from "../src/decorators/thread-information.js";
import { threadDefinition } from "../src/decorators/thread-settings.js";
import type { Body } from "../src/model/body.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { retainHalf, roundBody } from "./decorator-domain-fixtures.js";

async function information(owner: DocumentOwner, body: Body, radius: number, cut: "rod" | "hole") {
  const refs = body.faces
    .filter((f) => f.cylinder && Math.abs(f.cylinder.radius - radius) < 1e-7)
    .map((f) => ({ body: body.id, face: f.id }));
  assert.equal(
    (
      await owner.call({
        kind: "decorator",
        edit: {
          action: "apply",
          definition: threadDefinition,
          faces: refs,
          settings: { cut, preset: "metric" },
        },
      })
    ).error,
    undefined,
  );
  const instance = owner.view.data.decorators?.at(-1);
  assert.ok(instance);
  return threadInformation(owner.view.data.bodies ?? [], instance);
}

test("thread warnings identify opposite thin walls without warning on additions or thick walls", async () => {
  for (const [radii, radius, cut, warning] of [
    [[5, 4.5], 5, "rod", true],
    [[5, 4.5], 5, "hole", false],
    [[5.3, 5], 5, "hole", true],
    [[5.3, 5], 5, "rod", false],
    [[8, 5], 5, "hole", false],
  ] as const) {
    const owner = new DocumentOwner();
    try {
      const body = await roundBody(owner, [...radii]);
      const result = await information(owner, body, radius, cut);
      assert.equal(result.warnings.length > 0, warning);
      if (warning) {
        assert.match(result.warnings[0].message, /pierce/);
        assert.equal(result.warnings[0].faces.length, 2);
        assert.ok(
          result.warnings[0].faces.every((ref) => body.faces.some((f) => f.id === ref.face)),
        );
      }
    } finally {
      owner.close();
    }
  }
});

test("open internal threads need no flat warning and keep the exact nonstandard reference", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await retainHalf(
      owner,
      await roundBody(owner, [8, 5.15]),
      { ...planes.YZ, origin: [3, 0, 0] },
      (b) => b.center[0] < 3,
    );
    const result = await information(owner, body, 5.15, "hole");
    assert.match(result.description, /Ø10.3 mm/);
    assert.match(result.description, /nonstandard diameter/);
    assert.match(result.description, /rod minor/);
    assert.deepEqual(result.warnings, []);
  } finally {
    owner.close();
  }
});

test("captured open half-hole needs no flat warning in either cut mode", () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/thread-open-hole.json", "utf8"));
  const document = fixture.document as SketchDocument;
  const instance = document.decorators?.[0];
  assert.ok(instance);
  for (const cut of ["rod", "hole"]) {
    const result = threadInformation(document.bodies ?? [], {
      ...instance,
      settings: { ...instance.settings, cut },
    });
    assert.deepEqual(result.warnings, []);
  }
});
