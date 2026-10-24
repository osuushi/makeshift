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
    // Assemble compatible profiles at fitted pitch spacing. Exploded placement
    // and phase are deliberately independent of the group's profile fit.
    const [first, second] = gears;
    const dx = second.frame.origin[0] - first.frame.origin[0];
    const dy = second.frame.origin[1] - first.frame.origin[1];
    const direction = Math.atan2(dy, dx);
    const spacing = (first.gearPitchRadius ?? 0) + (second.gearPitchRadius ?? 0);
    const target = [
      first.frame.origin[0] + Math.cos(direction) * spacing,
      first.frame.origin[1] + Math.sin(direction) * spacing,
    ];
    const frameAngle = (g: typeof first) => Math.atan2(g.frame.u[1], g.frame.u[0]);
    const phaseA = direction - frameAngle(first) - (Number(first.settings.phase) * Math.PI) / 180;
    const desiredB =
      direction +
      Math.PI -
      frameAngle(second) -
      (Math.PI - phaseA * Number(first.settings.teeth)) / Number(second.settings.teeth);
    const assembly = (desiredB * 180) / Math.PI - Number(second.settings.phase);
    for (let step = 0; step <= 16; step++) {
      const angle = (step * 360) / (16 * Number(gears[0].settings.teeth));
      const solids = gears.map((g, i) => {
        const [x, y] = g.frame.origin;
        const rotation =
          i === 0
            ? angle
            : assembly - (angle * Number(gears[0].settings.teeth)) / Number(g.settings.teeth);
        return scope.keep(
          scope
            .keep(scope.keep(profiles[i].translate([-x, -y, 0])).rotate([0, 0, rotation]))
            .translate(i === 0 ? [x, y, 0] : [target[0], target[1], 0]),
        );
      });
      const volume = scope.keep(solids[0].intersect(solids[1])).volume();
      assert.ok(volume < 1e-5, `${quality} overlap ${volume} at step ${step}`);
    }
  } finally {
    scope.close();
  }
}
