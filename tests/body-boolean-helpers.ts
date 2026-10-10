import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

export async function box(owner: DocumentOwner, x: number, y: number, X: number, Y: number) {
  const points = [
    { x, y },
    { x: X, y },
    { x: X, y: Y },
    { x, y: Y },
  ];
  const sketch = {
    ...emptySketch(planes.XY),
    curves: points.map((a, i) => ({
      id: `edge${i}`,
      kind: "segment" as const,
      a,
      b: points[(i + 1) % 4],
      construction: false,
    })),
  };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  assert.equal(
    (
      await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
          distance: 10,
          mode: "new",
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
  return (owner.view.data.bodies as Body[]).at(-1) as Body;
}
