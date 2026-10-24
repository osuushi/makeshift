import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import { gearGroupProblem } from "../src/decorators/gear-group.js";
import { inspectGear } from "../src/decorators/gear-support.js";
import { documentArchive } from "../src/model/document-archive.js";
import type { SketchDocument } from "../src/sketch/document.js";

export async function captured(owner: DocumentOwner, legacy = false) {
  const fixture: { document: SketchDocument } = JSON.parse(
    await readFile("tests/fixtures/gear-cylinders.json", "utf8"),
  );
  const document = legacy ? fixture.document : { ...fixture.document, decorators: [] };
  assert.equal((await owner.call({ kind: "open", document })).error, undefined);
  return fixture.document.decorators?.flatMap((d) => d.faces) ?? [];
}

export function checkPair(owner: DocumentOwner) {
  const gears = owner.view.data.decorators ?? [];
  assert.equal(gears.length, 2);
  assert.ok(gears[0].gearGroup);
  assert.equal(gears[0].gearGroup, gears[1].gearGroup);
  const dimensions = gears.map((g) => inspectGear(owner.view.data, g));
  assert.ok(Math.abs(dimensions[0].normalModule - dimensions[1].normalModule) < 1e-10);
  assert.deepEqual(
    gears.map((g) => g.settings.teeth).sort((a, b) => Number(a) - Number(b)),
    [21, 39],
  );
  for (const gear of gears) assert.equal(gearGroupProblem(owner.view.data, gear), null);
  return gears;
}

export function geometryArchive(document: SketchDocument) {
  return documentArchive({
    ...document,
    decorators: [],
    decoratorPresets: undefined,
    lastDecoratorChoices: undefined,
  });
}
