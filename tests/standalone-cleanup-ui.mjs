import assert from "node:assert/strict";
import { axialCleanupRoute } from "./ui-axial-widget.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { cleanupRoute } from "./ui-cleanup.mjs";
import { cleanupCompletionRoute } from "./ui-cleanup-completion.mjs";
import { revolveRoute } from "./ui-revolve.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    const probes = [];
    const record = (route) => {
      if (route.request().postDataJSON()?.kind === "check-cleanup")
        probes.push(route.request().postDataJSON());
      return route.continue();
    };
    await page.route("**/sketch-api", record);
    try {
      for (const route of [axialCleanupRoute, cleanupRoute]) {
        await route(page, name, name === "electron");
        console.log(`${name}: ${route.name} standalone-only passed`);
      }
      await revolveRoute(page, name, name === "electron", true);
      console.log(`${name}: Revolve ordinary completion passed`);
      await cleanupCompletionRoute(page, plate);
      console.log(`${name}: Fillet/Chamfer ordinary completion + standalone cleanup passed`);
      assert.deepEqual(probes, [], "Modeling UI never probes completion cleanup");
    } finally {
      await page.unroute("**/sketch-api", record);
    }
  },
  { viewport: { width: 1280, height: 800 }, timeout: 30000 },
);
