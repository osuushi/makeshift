import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { type PlaneFrame, planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

export const middleCut: PlaneFrame = { ...planes.XY, origin: [0, 0, 10] };
export async function planeCutFixture(owner: DocumentOwner, kind = "box") {
  const base = emptySketch(planes.XY);
  const sketch: Sketch =
    kind === "box" || kind === "twisted"
      ? rectangle(base, { x: 0, y: 0 }, { x: 20, y: 20 }).sketch
      : {
          ...base,
          curves: [
            {
              id: "outer",
              kind: "circle",
              center: { x: 0, y: 0 },
              radius: 10,
              construction: false,
            },
            ...(kind === "hollow"
              ? [
                  {
                    id: "inner",
                    kind: "circle" as const,
                    center: { x: 0, y: 0 },
                    radius: 5,
                    construction: false,
                  },
                ]
              : []),
            ...(kind === "partial"
              ? [
                  {
                    id: "chord",
                    kind: "segment" as const,
                    a: { x: 0, y: -10 },
                    b: { x: 0, y: 10 },
                    construction: false,
                  },
                ]
              : []),
          ],
        };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  const profile = profilesFor(sketch).find((p) => kind !== "hollow" || p.holes.length === 1);
  assert.ok(profile);
  assert.equal(
    (
      await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: profile.key }],
          distance: 20,
          mode: "new",
          ...(kind === "twisted"
            ? { twist: { angle: 90, origin: [0, 0, 0] as [number, number, number] } }
            : {}),
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  return body;
}
