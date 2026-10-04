import assert from "node:assert/strict";
import { assertWidgetTargets } from "./ui-widget-reachability.mjs";

// Display correction is presentation state. Geometry references remain the
// independently projected world points supplied by the calling route.
export async function widgetPresentation(page, label) {
  await assertWidgetTargets(page, `[aria-label=${JSON.stringify(label)}]`, label);
  const result = await page
    .getByRole("button", { name: label, exact: true })
    .evaluate((element) => {
      const text = getComputedStyle(element).translate;
      const parts = text === "none" ? [] : text.trim().split(/\s+/);
      if (
        parts.length > 2 ||
        parts.some((part) => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?px$/i.test(part))
      )
        throw new Error(`Unsupported widget CSS translation: ${text}`);
      const offset = {
        x: Number.parseFloat(parts[0] ?? "0"),
        y: Number.parseFloat(parts[1] ?? "0"),
      };
      const box = element.getBoundingClientRect();
      const displayed = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      return {
        displayed,
        offset,
        virtual: { x: displayed.x - offset.x, y: displayed.y - offset.y },
      };
    });
  assert.ok(Number.isFinite(result.offset.x) && Number.isFinite(result.offset.y));
  return result;
}
