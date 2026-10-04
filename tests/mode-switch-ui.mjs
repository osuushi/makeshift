import assert from "node:assert/strict";
import {
  decoratorDraftSwitchRoute,
  offsetPresetRoute,
  offsetThreadsRoute,
  threadApplicationSwitchRoute,
} from "./ui-mode-switch-decorators.mjs";
import { savePreviewSwitchRoute } from "./ui-mode-switch-documents.mjs";
import { failedAcceptanceSwitchRoute, noOpSwitchRoute } from "./ui-mode-switch-failures.mjs";
import {
  geometrySwitchRoute,
  offsetInvalidSwitchRoute,
  sketchNumericSwitchRoute,
} from "./ui-mode-switch-ownership.mjs";
import { projectionSwitchRoute } from "./ui-mode-switch-projection.mjs";
import { booleanSwitchRoute, loftErodeSwitchRoute } from "./ui-mode-switch-shortcuts.mjs";
import {
  sketchFilletSwitchRoute,
  sketchOffsetSwitchRoute,
} from "./ui-mode-switch-sketch-previews.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

const routes = {
  projection: projectionSwitchRoute,
  fillet: sketchFilletSwitchRoute,
  offset: sketchOffsetSwitchRoute,
  save: savePreviewSwitchRoute,
  noop: noOpSwitchRoute,
  failure: failedAcceptanceSwitchRoute,
  shortcuts: loftErodeSwitchRoute,
  booleans: booleanSwitchRoute,
  geometry: geometrySwitchRoute,
  sketch: sketchNumericSwitchRoute,
  invalid: offsetInvalidSwitchRoute,
  preset: offsetPresetRoute,
  draft: decoratorDraftSwitchRoute,
  application: threadApplicationSwitchRoute,
  threads: offsetThreadsRoute,
};
const requested = process.argv[2];
assert.ok(!requested || routes[requested], `Unknown mode-switch route: ${requested}`);
await withUiRuntimes(
  async (page, name) => {
    for (const [family, route] of Object.entries(routes)) {
      if (!requested || family === requested) await route(page, `${name}-${family}`);
    }
  },
  { viewport: { width: 1280, height: 800 }, timeout: 30000 },
);
