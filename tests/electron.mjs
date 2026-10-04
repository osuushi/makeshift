import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { launchElectron } from "./native-documents.mjs";
import { arcRoute } from "./ui-arc.mjs";
import { arcLinkRoute } from "./ui-arc-links.mjs";
import { autoUnionRoute } from "./ui-auto-union.mjs";
import { backendPersistence } from "./ui-backend.mjs";
import { bezierRoute } from "./ui-bezier.mjs";
import { blendEditRoute } from "./ui-blend-edit.mjs";
import { bodyAnchorRoute } from "./ui-body-anchor.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { bodyBooleanRoute } from "./ui-body-boolean.mjs";
import { bodyChamferRoute } from "./ui-body-chamfer.mjs";
import { bodyEdgesRoute } from "./ui-body-edges.mjs";
import { bodyFilletRoute } from "./ui-body-fillet.mjs";
import { bodyMoveRoute, bodySnapRoute } from "./ui-body-move.mjs";
import { booleanTargetsRoute } from "./ui-boolean-targets.mjs";
import { constrainedBowRoute } from "./ui-bow-constraints.mjs";
import { bowDirectionRoute } from "./ui-bow-direction.mjs";
import { tangentBowRoute } from "./ui-bow-tangent.mjs";
import { cameraRoute } from "./ui-camera.mjs";
import { circleRoute } from "./ui-circle.mjs";
import { circularTangencyRoute } from "./ui-circular-tangency.mjs";
import { cleanupRoute } from "./ui-cleanup.mjs";
import { coincidenceRoute } from "./ui-coincident.mjs";
import { concentricRoute } from "./ui-concentric.mjs";
import { constraintPanelRoute } from "./ui-constraint-panel.mjs";
import { cornerAngleRoute } from "./ui-corner-angle.mjs";
import { cornerFilletRoute } from "./ui-corner-fillet.mjs";
import { curvedRegionRoute } from "./ui-curved-regions.mjs";
import { curvedRoundingRoute } from "./ui-curved-rounding.mjs";
import { drawingLinksRoute } from "./ui-drawing-links.mjs";
import { edgeCases } from "./ui-edge-cases.mjs";
import { edgeChainRoute } from "./ui-edge-chain.mjs";
import { editIntentRoute } from "./ui-edit-intent.mjs";
import { entitiesRoute } from "./ui-entities.mjs";
import { entityDeleteRoute } from "./ui-entity-delete.mjs";
import { extrudeRoute, extrusionGestureRoute } from "./ui-extrude.mjs";
import { extrudeDraftRoute } from "./ui-extrude-draft.mjs";
import { extrusionWidgetRoute } from "./ui-extrude-widget.mjs";
import { faceOffsetRoute } from "./ui-face-offset.mjs";
import { fillRoute } from "./ui-fill.mjs";
import { filletLossRoute, filletRoute } from "./ui-fillet.mjs";
import { filletConsumptionRoute } from "./ui-fillet-consumption.mjs";
import { filletGuideRoute } from "./ui-fillet-guide.mjs";
import { interactionLifecycleRoute } from "./ui-interaction-lifecycle.mjs";
import { jointBowRoute } from "./ui-joint-bow.mjs";
import { lineRoute } from "./ui-line.mjs";
import { lockRoute } from "./ui-locks.mjs";
import { loopOffsetRoute } from "./ui-loop-offset.mjs";
import { modelToolsRoute } from "./ui-model-tools.mjs";
import { modelingRoute } from "./ui-modeling.mjs";
import { moveToolRoute } from "./ui-move-tool.mjs";
import {
  movementGeometrySnapRoute,
  movementSnappingRoute,
  rectangleEdgeRoute,
  rotatedEdgeRoute,
} from "./ui-movement-snapping.mjs";
import { offsetRoute } from "./ui-offset.mjs";
import { offsetChainRoute } from "./ui-offset-chain.mjs";
import { offsetContactRoute } from "./ui-offset-contact.mjs";
import { pointChoiceRoute } from "./ui-point-choice.mjs";
import { pointEdgeRoute } from "./ui-point-edge.mjs";
import { pointIntentRoute } from "./ui-point-intent.mjs";
import { circleLinkRoute, pointLinkRoute } from "./ui-point-links.mjs";
import { projectionRoute } from "./ui-projection.mjs";
import { projectionFacesRoute } from "./ui-projection-faces.mjs";
import { rectangleRoute } from "./ui-rectangle.mjs";
import { rectangleBowRoute } from "./ui-rectangle-bow.mjs";
import { relationRoute } from "./ui-relations.mjs";
import { revolveRoute } from "./ui-revolve.mjs";
import { revolveSolidRoute } from "./ui-revolve-solid.mjs";
import { screwUnionRoute } from "./ui-screw-union.mjs";
import { selectionRoute } from "./ui-selection.mjs";
import { solidFacesRoute } from "./ui-solid-faces.mjs";
import { tangencyRoute } from "./ui-tangency.mjs";
import { tangentJunctionRoute } from "./ui-tangent-junction.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { transformRoute } from "./ui-transform.mjs";
import { trimCircleRoute, trimLineRoute } from "./ui-trim.mjs";
import { trimArcRoute } from "./ui-trim-arcs.mjs";
import { trimConstraintRoute } from "./ui-trim-constraints.mjs";
import { typedSelectionRoute } from "./ui-typed-selection.mjs";
import { useEdgeRoute, useLineEdgeRoute } from "./ui-use-edge.mjs";
import { widgetNavigationRoute } from "./ui-widget-navigation.mjs";

const { values } = parseArgs({
  options: {
    shard: { type: "string" },
    "without-navigation": { type: "boolean" },
    "navigation-only": { type: "boolean" },
  },
});
assert.ok(!values.shard || /^[1-7]\/7$/.test(values.shard), "Choose Electron shard 1/7–7/7");
assert.ok(!values["navigation-only"] || (!values.shard && !values["without-navigation"]));
const [shard, count] = (values.shard ?? "1/1").split("/").map(Number);

await mkdir(".cache/sketch-review", { recursive: true });
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
try {
  const page = await app.firstWindow();
  // Keep adaptive grid spacing independent of the runner's physical display.
  await page.setViewportSize({ width: 1280, height: 850 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() => !!window.makeshiftInspect);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.getByRole("status").filter({ hasText: "XY sketch" }).waitFor();
  assert.equal(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    false,
  );
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  const routes = [
    [bowDirectionRoute, "electron"],
    [modelingRoute, "electron"],
    [entityDeleteRoute, "electron"],
    [modelToolsRoute, "electron"],
    [extrudeRoute, "electron", app],
    [extrusionGestureRoute],
    [booleanTargetsRoute],
    [useEdgeRoute, "electron"],
    [useLineEdgeRoute],
    [solidFacesRoute, "electron"],
    [jointBowRoute, "electron"],
    [constraintPanelRoute, "electron"],
    [interactionLifecycleRoute, "electron"],
    [editIntentRoute, "electron"],
    [typedSelectionRoute, "electron"],
    [drawingLinksRoute, "electron"],
    [pointEdgeRoute, "electron"],
    [moveToolRoute, "electron"],
    [pointLinkRoute, "electron"],
    [circleLinkRoute, "electron"],
    [arcLinkRoute, "electron"],
    [coincidenceRoute, "electron"],
    [cornerAngleRoute, "electron"],
    [concentricRoute, "electron"],
    [tangencyRoute, "electron"],
    [circularTangencyRoute, "electron"],
    [tangentJunctionRoute, "electron"],
    [filletGuideRoute, "electron"],
    [filletConsumptionRoute, "electron"],
    [curvedRoundingRoute, "electron"],
    [cornerFilletRoute, "electron"],
    [filletRoute, "electron"],
    [filletLossRoute, "electron"],
    [trimLineRoute, "electron"],
    [trimCircleRoute, "electron"],
    [trimConstraintRoute, "electron"],
    [trimArcRoute, "electron"],
    [relationRoute, "electron"],
    [lockRoute, "electron"],
    [extrusionWidgetRoute, "electron"],
    [bodyEdgesRoute, "electron"],
    [bodyFilletRoute, "electron", app],
    [bodyChamferRoute, "electron", app],
    [edgeChainRoute, "electron"],
    [faceOffsetRoute, "electron", app],
    [blendEditRoute, "electron"],
    [offsetChainRoute, "electron"],
    [offsetContactRoute, "electron", app],
    [revolveRoute, "electron", app],
    [revolveSolidRoute, "electron"],
    [screwUnionRoute, "electron", app],
    [bodyBooleanRoute, "electron", app],
    [cleanupRoute, "electron", app],
    [autoUnionRoute, "electron"],
    [extrudeDraftRoute, "electron", app],
    [bodyMoveRoute, "electron"],
    [bodySnapRoute, "electron"],
    [bodyAnchorRoute, "electron"],
    [widgetNavigationRoute, "electron"],
    [bodyArchiveRoute, "electron", app],
    [entitiesRoute, "electron"],
    [cameraRoute, "electron"],
    [bezierRoute, "electron"],
    [projectionRoute, "electron", app],
    [projectionFacesRoute, "electron"],
    [arcRoute, "electron"],
    [pointChoiceRoute, "electron"],
    [circleRoute, "electron"],
    [curvedRegionRoute, "electron"],
    [rectangleBowRoute, "electron"],
    [constrainedBowRoute, "electron"],
    [tangentBowRoute, "electron"],
    [rectangleRoute, "electron"],
    [movementSnappingRoute, "electron"],
    [movementGeometrySnapRoute, "electron"],
    [rectangleEdgeRoute, "electron"],
    [rotatedEdgeRoute, "electron"],
    [lineRoute, "electron"],
    [pointIntentRoute, "electron"],
    [fillRoute, "electron"],
    [selectionRoute, "electron"],
    [transformRoute, "electron"],
    [offsetRoute, "electron"],
    [loopOffsetRoute, "electron"],
    [edgeCases, "electron"],
    [backendPersistence, "electron"],
  ];
  // Preserve dependent fixture sequences (body Move → snapping → pivot, etc.).
  // Each boundary starts a route that explicitly resets the document/camera.
  const boundaries = [
    0,
    routes.findIndex(([route]) => route === pointEdgeRoute),
    routes.findIndex(([route]) => route === filletRoute),
    routes.findIndex(([route]) => route === faceOffsetRoute),
    routes.findIndex(([route]) => route === bodyMoveRoute),
    routes.findIndex(([route]) => route === circleRoute),
    routes.findIndex(([route]) => route === movementSnappingRoute),
    routes.length,
  ];
  assert.ok(boundaries.every((value, index) => index === 0 || value > boundaries[index - 1]));
  const navigation = new Set([widgetNavigationRoute, cameraRoute]);
  const navigationFixture = new Set([bodyMoveRoute, bodySnapRoute, bodyAnchorRoute, ...navigation]);
  const partition = count === 1 ? routes : routes.slice(boundaries[shard - 1], boundaries[shard]);
  const selected = values["navigation-only"]
    ? routes.filter(([route]) => navigationFixture.has(route))
    : partition.filter(([route]) => !values["without-navigation"] || !navigation.has(route));
  console.log(`electron host: ${selected.length}/${routes.length} routes, shard ${shard}/${count}`);
  for (const [route, ...args] of selected) {
    console.log(`electron host: ${route.name}`);
    await route(page, ...args);
  }
  assert.deepEqual(errors, []);
  console.log("Hidden Electron: built renderer, plane entry and sandbox passed");
} catch (error) {
  console.error("electron host: route failed", error);
  throw error;
} finally {
  await app.close();
}
