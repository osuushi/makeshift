import { canonicalPlaneBounds } from "./canonical-plane-bounds.js";
import { planeCorners } from "./plane-bounds.js";
import type { PlanePatch } from "./plane-target-mesh.js";
import { type PlaneId, planes } from "./planes.js";
import type { World } from "./world.js";

/** Read-only presentation data for capture/inspection, formerly on plane labels. */
export function inspectPlaneTargets(world: World) {
  return world.scene.children
    .filter((object) => object.userData.planeTarget)
    .map((object) => {
      const id = object.userData.planeTarget as PlaneId;
      return {
        id,
        visible: object.visible,
        hovered: !!object.userData.hovered,
        selected: world.selectedPlane === id,
        opacity: object.userData.visibility as number,
        fillOpacity: (object as PlanePatch).material.opacity,
        color: `#${(object as PlanePatch).material.color.getHexString()}`,
        selectable: !!object.userData.selectable,
        bounds: canonicalPlaneBounds(world, planes[id]),
        points: planeCorners(planes[id], canonicalPlaneBounds(world, planes[id])).map((p) =>
          world.project(p),
        ),
      };
    });
}
