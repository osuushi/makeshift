import { navigationDuringAcceptance, navigationModalPriority } from "./ui-navigation-busy.mjs";
import { navigationFileBoundary } from "./ui-navigation-files.mjs";
import { navigationInputRoute } from "./ui-navigation-inputs.mjs";
import { navigationInterruptionRoute } from "./ui-navigation-interruption.mjs";
import { navigationOrderRoute } from "./ui-navigation-order.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

const routes = {
  inputs: navigationInputRoute,
  order: navigationOrderRoute,
  modal: navigationModalPriority,
  acceptance: navigationDuringAcceptance,
  files: navigationFileBoundary,
  interruption: navigationInterruptionRoute,
};
const requested = process.argv.slice(2);
if (requested.some((name) => !(name in routes))) throw new Error("Unknown navigation route");
await withUiRuntimes(
  async (page, name) => {
    for (const selected of requested.length ? requested : Object.keys(routes))
      await routes[selected](page, name);
  },
  { defaults: ["chromium", "webkit", "electron"], timeout: 15000 },
);
