import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import type { Extrusion } from "../src/model/body.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { rectangle } from "../src/sketch/geometry.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

export async function extrude(
  owner: DocumentOwner,
  sketch: Sketch,
  distance: number,
  options: Pick<Extrusion, "draft" | "twist"> = {},
) {
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  const profile = profilesFor(sketch)[0];
  assert.ok(profile);
  assert.equal(
    (
      await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: profile.key }],
          distance,
          mode: "new",
          ...options,
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
  const body = owner.view.data.bodies?.at(-1);
  assert.ok(body);
  return body;
}
export async function fixture(owner: DocumentOwner) {
  const target = await extrude(
    owner,
    rectangle(emptySketch(planes.XY), { x: -10, y: -10 }, { x: 10, y: 10 }).sketch,
    20,
  );
  const cutter = await extrude(
    owner,
    {
      ...emptySketch({ ...planes.XY, origin: [3, 0, 30] }),
      curves: [
        { id: "circle", kind: "circle", center: { x: 0, y: 0 }, radius: 5, construction: false },
      ],
    },
    5,
  );
  const face = cutter.faces.find((face) => face.cylinder);
  assert.ok(face);
  return { target, cutter, surface: { body: cutter.id, face: face.id } };
}
