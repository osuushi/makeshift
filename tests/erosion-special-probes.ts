import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

type Probe = readonly [number, number, number, boolean];
const probes: Record<string, readonly Probe[]> = {
  "section-bores": [
    [-7, 0, 6, false],
    [-3.5, 0, 6, false],
    [-2.2, 0, 6, true],
    [7, 0, 6, false],
    [9.9, 0, 6, false],
    [10.8, 0, 6, true],
    [0, 7, 1.7, true],
    [0, 7, 0.8, false],
  ],

  "long-thin-fin": [
    [30, 10, 5, false],
    [10, 10, 5, true],
    [19.5, 10, 5, false],
  ],
  "thin-round-branch": [
    [10, 0, 5, false],
    [0, 0, 5, true],
    [4.8, 0, 5, true],
  ],
  torus: [
    [0, 0, 0, false],
    [8, 0, 0, true],
    [10.5, 0, 0, false],
  ],
  "double-torus": [
    [0, 0, 0, false],
    [18, 0, 0, false],
    [9, 0, 0, true],
    [-8, 0, 0, true],
    [26, 0, 0, true],
    [18, 8, 0, true],
  ],
  "two-bore-plate": [
    [10, 10, 5, false],
    [20, 10, 5, false],
    [15, 10, 5, true],
    [12.5, 10, 5, false],
  ],
  "sphere-plane": [
    [0, 0, 0.5, false],
    [0, 0, 2, true],
    [0, 0, 7.5, false],
  ],
  "sphere-plane-fillet": [
    [0, 0, 0.5, false],
    [0, 0, 2, true],
    [0, 0, 7.5, false],
  ],
  "sphere-cylinder": [
    [0, 0, -8, true],
    [2.5, 0, -8, false],
    [0, 0, 0, true],
    [0, 0, 5.5, false],
  ],
  "sphere-cylinder-fillet": [
    [0, 0, -8, true],
    [2.5, 0, -8, false],
    [0, 0, 0, true],
    [0, 0, 5.5, false],
  ],
  "tiny-sealed-cavity": [
    [10, 10, 10, false],
    [11, 10, 10, false],
    [11.5, 10, 10, true],
  ],
  "two-sealed-cavities": [
    [7, 10, 10, false],
    [13, 10, 10, false],
    [10, 10, 10, true],
  ],
  "merging-cavities": [
    [10, 10, 10, false],
    [10, 13, 10, true],
    [8, 10, 10, false],
  ],
  "cavity-breakthrough": [
    [1, 10, 10, false],
    [1, 13, 10, true],
    [1.8, 10, 10, false],
  ],
  "hollow-sphere": [
    [0, 0, 0, false],
    [7, 0, 0, true],
    [6.2, 0, 0, false],
    [7.8, 0, 0, false],
  ],
  "thin-torus": [
    [8, 0, 0, true],
    [8, 0, 0.35, false],
  ],
};

export async function checkErosionMaterial(owner: DocumentOwner, name: string, ids: string[]) {
  if (!ids.length) return;
  assert.ok(probes[name], `Independent material probes defined for ${name}`);
  const untouched = new Set(
    owner.view.data.bodies?.filter((body) => !ids.includes(body.id)).map((body) => body.id),
  );
  for (const [x, y, z, occupied] of probes[name]) {
    const sketch = {
      ...emptySketch({ ...planes.XY, origin: [0, 0, z - 0.03] }),
      curves: [
        {
          id: "probe",
          kind: "circle" as const,
          center: { x, y },
          radius: 0.03,
          construction: false,
        },
      ],
    };
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const reply = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
        distance: 0.06,
        mode: "intersect",
        targets: ids,
      },
    });
    assert.equal(reply.error, undefined);
    const actual = reply.view.candidate?.bodies?.filter((body) => !untouched.has(body.id)) ?? [];
    assert.equal(actual.length, occupied ? 1 : 0, `${name}: material at ${x},${y},${z}`);
    if (occupied) assert.ok(Math.abs(actual[0].volume - Math.PI * 0.03 ** 2 * 0.06) < 1e-8);
    await owner.call({ kind: "discard" });
  }
}
