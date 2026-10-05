import { recentDiscoveryRoute, recentSketchRoute, recentSolidRoute } from "./ui-recent-tools.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await recentDiscoveryRoute(page, name);
    if (!process.env.MAKESHIFT_RECENT_DISCOVERY_ONLY) {
      await recentSketchRoute(page, name);
      await recentSolidRoute(page, name);
    }
  },
  {
    defaults: process.env.MAKESHIFT_RECENT_DISCOVERY_ONLY
      ? ["chromium", "webkit"]
      : ["chromium", "webkit", "electron"],
    hasTouch: true,
  },
);
