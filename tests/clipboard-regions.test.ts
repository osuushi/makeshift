import assert from "node:assert/strict";
import test from "node:test";
import { cloneClipboard } from "../src/clipboard/geometry.js";
import { copyRegions } from "../src/clipboard/sketch-regions.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { rectangle, segment } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { validateSketch } from "../src/sketch/sketch-validation.js";

test("region copy uses only selected spans and deduplicates shared boundaries", () => {
  const rectangleSketch = rectangle(emptySketch(planes.XY), { x: 0, y: 0 }, { x: 10, y: 5 }).sketch;
  const sketch = {
    ...rectangleSketch,
    curves: [...rectangleSketch.curves, segment({ x: 5, y: -5 }, { x: 5, y: 10 })],
  };
  const profiles = profilesFor(sketch);
  assert.equal(profiles.length, 2);
  const one = copyRegions(sketch, new Set([profiles[0].key]));
  validateSketch(one);
  assert.equal(one.curves.length, 4);
  assert.ok(Math.abs(profilesFor(one)[0].area - 25) < 1e-7);
  assert.equal(one.constraints.length, 0);
  const both = copyRegions(sketch, new Set(profiles.map((profile) => profile.key)));
  assert.equal(both.curves.length, 7, "Shared divider copied once; outside extensions omitted");
  validateSketch(both);
});

test("circular region copy preserves analytic arcs, closure and area", () => {
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [
      { id: "circle", kind: "circle", center: { x: 0, y: 0 }, radius: 5, construction: false },
      segment({ x: -10, y: 0 }, { x: 10, y: 0 }),
    ],
  };
  const profiles = profilesFor(sketch);
  assert.equal(profiles.length, 2);
  for (const profile of profiles) {
    const copy = copyRegions(sketch, new Set([profile.key]));
    validateSketch(copy);
    assert.ok(copy.curves.some((curve) => curve.kind === "arc"));
    assert.ok(Math.abs(profilesFor(copy)[0].area - (Math.PI * 25) / 2) < 1e-7);
  }
});

test("clipboard decorator definitions and face references receive independent identities", () => {
  const definition = {
    id: "example.pattern",
    version: 1,
    name: "Pattern",
    source: "export default {};",
    fields: [],
  };
  const source = {
    sketches: [],
    bodies: [{ id: "body", brep: "exact", faces: [{ id: "face", signature: [1] }], edges: [] }],
    decoratorDefinitions: [definition],
    decorators: [
      {
        id: "instance",
        definition: definition.id,
        version: 1,
        settings: {},
        faces: [{ body: "body", face: "face" }],
        frame: planes.XY,
      },
    ],
  };
  const a = cloneClipboard(source),
    b = cloneClipboard(source);
  assert.notEqual(a.decoratorDefinitions?.[0].id, definition.id);
  assert.notEqual(a.decoratorDefinitions?.[0].id, b.decoratorDefinitions?.[0].id);
  assert.equal(a.decorators?.[0].definition, a.decoratorDefinitions?.[0].id);
  assert.equal(a.decorators?.[0].faces[0].body, a.bodies[0].id);
  assert.equal(a.decorators?.[0].faces[0].face, a.bodies[0].faces[0].id);
  assert.equal(a.decoratorDefinitions?.[0].source, definition.source);
});
