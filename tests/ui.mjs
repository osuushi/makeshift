import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { arcRoute } from "./ui-arc.mjs";
import { arcLinkRoute } from "./ui-arc-links.mjs";
import { autoUnionRoute } from "./ui-auto-union.mjs";
import { backendPersistence, delayedBackend, rejectedReply } from "./ui-backend.mjs";
import {
  bezierFusionRoute,
  bezierRoute,
  bezierTangencyRoute,
  cubicTangentCouplingRoute,
} from "./ui-bezier.mjs";
import { blendEditRoute } from "./ui-blend-edit.mjs";
import { bodyAnchorRoute } from "./ui-body-anchor.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { bodyBooleanRoute } from "./ui-body-boolean.mjs";
import { bodyChamferRoute } from "./ui-body-chamfer.mjs";
import { bodyEdgesRoute } from "./ui-body-edges.mjs";
import { bodyFilletRoute } from "./ui-body-fillet.mjs";
import { bodyMoveRoute, bodySnapRoute } from "./ui-body-move.mjs";
import { bodySelectionEntryRoute } from "./ui-body-selection-entry.mjs";
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
import { extrusionCancelRoute, extrusionPreviewRoute } from "./ui-extrude-preview.mjs";
import { extrusionWidgetRoute } from "./ui-extrude-widget.mjs";
import { faceOffsetRoute } from "./ui-face-offset.mjs";
import { fillRoute } from "./ui-fill.mjs";
import { filletLossRoute, filletRoute } from "./ui-fillet.mjs";
import { filletConsumptionRoute } from "./ui-fillet-consumption.mjs";
import { filletGuideRoute } from "./ui-fillet-guide.mjs";
import { gridEdgeSnappingRoute } from "./ui-grid-edge-snapping.mjs";
import { interactionLifecycleRoute } from "./ui-interaction-lifecycle.mjs";
import { jointBowRoute } from "./ui-joint-bow.mjs";
import { lineRoute } from "./ui-line.mjs";
import { lockRoute } from "./ui-locks.mjs";
import { loopOffsetRoute } from "./ui-loop-offset.mjs";
import { modelFrustumSelectionRoute } from "./ui-model-frustum-selection.mjs";
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
import { planeTargetsRoute } from "./ui-plane-targets.mjs";
import { pointChoiceRoute } from "./ui-point-choice.mjs";
import { pointEdgeRoute } from "./ui-point-edge.mjs";
import { pointGroupsRoute } from "./ui-point-groups.mjs";
import { pointIntentRoute } from "./ui-point-intent.mjs";
import { circleLinkRoute, pointLinkRoute, pointTangentRoute } from "./ui-point-links.mjs";
import { projectionRoute } from "./ui-projection.mjs";
import { projectionFacesRoute } from "./ui-projection-faces.mjs";
import { rectangleRoute } from "./ui-rectangle.mjs";
import { rectangleBowRoute } from "./ui-rectangle-bow.mjs";
import { relationRoute } from "./ui-relations.mjs";
import { revolveRoute } from "./ui-revolve.mjs";
import { revolveSolidRoute } from "./ui-revolve-solid.mjs";
import { screwUnionRoute } from "./ui-screw-union.mjs";
import { selectionRoute } from "./ui-selection.mjs";
import { sketchPlaneRoute } from "./ui-sketch-plane.mjs";
import { solidFacesRoute } from "./ui-solid-faces.mjs";
import { tangencyRoute } from "./ui-tangency.mjs";
import { tangentJunctionRoute } from "./ui-tangent-junction.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { transformRoute } from "./ui-transform.mjs";
import { trimCircleRoute, trimLineRoute } from "./ui-trim.mjs";
import { trimArcRoute } from "./ui-trim-arcs.mjs";
import { trimCancellationRoute } from "./ui-trim-cancel.mjs";
import { trimConstraintRoute } from "./ui-trim-constraints.mjs";
import { typedSelectionRoute } from "./ui-typed-selection.mjs";
import { useEdgeRoute, useLineEdgeRoute } from "./ui-use-edge.mjs";
import { widgetNavigationRoute } from "./ui-widget-navigation.mjs";

const browserEngines = { chromium, webkit };
const requestedBrowser = process.env.MAKESHIFT_TEST_BROWSER;
if (requestedBrowser && !(requestedBrowser in browserEngines))
  throw new Error("MAKESHIFT_TEST_BROWSER must be chromium or webkit");
const server = await createServer({ server: { port: 0 } });
await server.listen();
await mkdir(".cache/sketch-review", { recursive: true });
try {
  for (const [name, engine] of Object.entries(browserEngines).filter(
    ([name]) => !requestedBrowser || name === requestedBrowser,
  )) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      page.setDefaultTimeout(30000);
      const errors = [];
      page.on("dialog", (dialog) =>
        dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss(),
      );
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(server.resolvedUrls.local[0]);
      await page.waitForFunction(() => !!window.makeshiftInspect);
      await page.screenshot({ path: `.cache/sketch-review/${name}-world.png` });
      await planeTargetsRoute(page, name);
      for (const plane of ["XY", "XZ", "YZ"]) {
        await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
        await page
          .getByRole("status")
          .filter({ hasText: `${plane} sketch` })
          .waitFor();
        await page.mouse.move(950, 500);
        await page.keyboard.down("Meta");
        await page.mouse.down();
        await page.mouse.move(900, 530, { steps: 4 });
        await page.mouse.up();
        await page.keyboard.up("Meta");
        await page.waitForFunction(() => window.makeshiftInspect().activePlane === null);
        await page.getByRole("status").filter({ hasText: "Choose a plane" }).waitFor();
      }
      await bowDirectionRoute(page, name);
      await modelingRoute(page, name);
      await bodySelectionEntryRoute(page, name);
      await entityDeleteRoute(page, name);
      await modelToolsRoute(page, name);
      await extrudeRoute(page, name);
      await extrusionGestureRoute(page);
      await extrusionPreviewRoute(page);
      await extrusionCancelRoute(page);
      await booleanTargetsRoute(page);
      await useEdgeRoute(page, name);
      await useLineEdgeRoute(page);
      await solidFacesRoute(page, name);
      await jointBowRoute(page, name);
      await constraintPanelRoute(page, name);
      await interactionLifecycleRoute(page, name);
      await trimCancellationRoute(page, name);
      await editIntentRoute(page, name);
      await typedSelectionRoute(page, name);
      await drawingLinksRoute(page, name);
      await pointEdgeRoute(page, name);
      await moveToolRoute(page, name);
      await pointLinkRoute(page, name);
      await pointGroupsRoute(page, name);
      await circleLinkRoute(page, name);
      await pointTangentRoute(page, name);
      await arcLinkRoute(page, name);
      await coincidenceRoute(page, name);
      await cornerAngleRoute(page, name);
      await concentricRoute(page, name);
      await tangencyRoute(page, name);
      await circularTangencyRoute(page, name);
      await tangentJunctionRoute(page, name);
      await filletGuideRoute(page, name);
      await filletConsumptionRoute(page, name);
      await curvedRoundingRoute(page, name);
      await cornerFilletRoute(page, name);
      await filletRoute(page, name);
      await filletLossRoute(page, name);
      await trimLineRoute(page, name);
      await trimCircleRoute(page, name);
      await trimConstraintRoute(page, name);
      await trimArcRoute(page, name);
      await relationRoute(page, name);
      await lockRoute(page, name);
      await extrusionWidgetRoute(page, name);
      await bodyEdgesRoute(page, name);
      await modelFrustumSelectionRoute(page, name);
      await bodyFilletRoute(page, name);
      await bodyChamferRoute(page, name);
      await edgeChainRoute(page, name);
      await faceOffsetRoute(page, name);
      await blendEditRoute(page, name);
      await offsetChainRoute(page, name);
      await offsetContactRoute(page, name);
      await revolveRoute(page, name);
      await revolveSolidRoute(page, name);
      await screwUnionRoute(page, name);
      await bodyBooleanRoute(page, name);
      await cleanupRoute(page, name);
      await autoUnionRoute(page, name);
      await extrudeDraftRoute(page, name);
      await bodyMoveRoute(page, name);
      await bodySnapRoute(page, name);
      await bodyAnchorRoute(page, name);
      await widgetNavigationRoute(page, name);
      await bodyArchiveRoute(page, name);
      await entitiesRoute(page, name);
      await cameraRoute(page, name);
      await bezierFusionRoute(page, name);
      await bezierTangencyRoute(page, name);
      await cubicTangentCouplingRoute(page, name);
      await bezierRoute(page, name);
      await projectionRoute(page, name);
      await projectionFacesRoute(page, name);
      await arcRoute(page, name);
      await pointChoiceRoute(page, name);
      await circleRoute(page, name);
      await curvedRegionRoute(page, name);
      await rectangleBowRoute(page, name);
      await constrainedBowRoute(page, name);
      await tangentBowRoute(page, name);
      await rectangleRoute(page, name);
      await gridEdgeSnappingRoute(page, name);
      await movementSnappingRoute(page, name);
      await movementGeometrySnapRoute(page, name);
      await rectangleEdgeRoute(page, name);
      await rotatedEdgeRoute(page, name);
      await lineRoute(page, name);
      await pointIntentRoute(page, name);
      await fillRoute(page, name);
      await selectionRoute(page, name);
      await sketchPlaneRoute(page, name);
      await transformRoute(page, name);
      await offsetRoute(page, name);
      await loopOffsetRoute(page, name);
      await edgeCases(page, name);
      await backendPersistence(page, name);
      await delayedBackend(page, name);
      await rejectedReply(page, name);
      assert.deepEqual(errors, [], `${name} runtime errors`);
      console.log(`${name}: shared-world plane entry/orbit passed`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
