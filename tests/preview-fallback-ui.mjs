import { holdPreviews, installPreviewControl } from "./ui-decorator-worker-control.mjs";
import { emptyAndError, invalidAndRemoved } from "./ui-preview-fallback-errors.mjs";
import {
  booleanFallback,
  extrusionFallback,
  initialFallback,
} from "./ui-preview-fallback-refresh.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await installPreviewControl(page);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.makeshiftInspect));
    try {
      for (const [label, route] of [
        ["initial assigned thread pending coloring and analytic picking", initialFallback],
        ["Extrude continuation pending coloring, Cancel and held Undo/Redo", extrusionFallback],
        ["Boolean continuation pending coloring, Cancel and held Undo/Redo", booleanFallback],
        ["invalid and removed attachments explicit, no stale revival", invalidAndRemoved],
        ["custom vertex-only/error marker and drawable recovery", emptyAndError],
      ]) {
        await route(page, name);
        console.log(`${name}: ${label} passed`);
      }
    } catch (error) {
      await page.screenshot({ path: `.cache/sketch-review/${name}-preview-fallback-failure.png` });
      throw error;
    } finally {
      await holdPreviews(page, false);
    }
  },
  { timeout: 30000 },
);
