import assert from "node:assert/strict";
import { gearMeshes } from "../src/decorators/gear-mesh.js";
import { initializeMeshRuntime } from "../src/decorators/mesh-runtime.js";
import { MeshScope } from "../src/decorators/mesh-scope.js";
import type { DisplayDocument } from "../src/model/display-document.js";

export async function assertGearEngagement(
  document: DisplayDocument,
  quality: "preview" | "export",
) {
  const gears = document.decorators ?? [];
  assert.equal(gears.length, 2);
  const scope = new MeshScope(await initializeMeshRuntime());
  try {
    const profiles = gears.map((g) => scope.from(gearMeshes(document, g, quality).geometry.fill));
    for (let step = 0; step <= 16; step++) {
      const angle = (step * 360) / (16 * Number(gears[0].settings.teeth));
      const solids = gears.map((g, i) => {
        const [x, y] = g.frame.origin;
        const rotation =
          i === 0 ? angle : (-angle * Number(gears[0].settings.teeth)) / Number(g.settings.teeth);
        return scope.keep(
          scope
            .keep(scope.keep(profiles[i].translate([-x, -y, 0])).rotate([0, 0, rotation]))
            .translate([x, y, 0]),
        );
      });
      const volume = scope.keep(solids[0].intersect(solids[1])).volume();
      assert.ok(volume < 1e-5, `${quality} overlap ${volume} at step ${step}`);
    }
  } finally {
    scope.close();
  }
}
