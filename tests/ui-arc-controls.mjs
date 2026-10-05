import assert from "node:assert/strict";
import { at } from "./ui-helpers.mjs";

/** The physical endpoint press must reach the canvas; the optional action stays usable. */
export async function arcControlsClear(page, plane) {
  const points = [await at(page, -4, 0), await at(page, 4, 0)];
  const actual = await page.evaluate((points) => {
    const canvas = document.querySelector("#world canvas");
    const button = document.querySelector(".move-control");
    const rect = button.getBoundingClientRect();
    return {
      endpoints: points.map((p) => document.elementFromPoint(p.x, p.y) === canvas),
      button:
        !button.hidden &&
        !button.disabled &&
        button.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        ),
      rect: rect.toJSON(),
    };
  }, points);
  assert.deepEqual(
    actual.endpoints,
    [true, true],
    `${plane}: endpoints unobstructed ${JSON.stringify(actual)}`,
  );
  assert.equal(
    actual.button,
    true,
    `${plane}: Transform remains hittable ${JSON.stringify(actual)}`,
  );
}
