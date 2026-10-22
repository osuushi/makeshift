import assert from "node:assert/strict";
import { documentArchive } from "../.cache/sketch-tests/src/model/document-archive.js";
import { emptySketch } from "../.cache/sketch-tests/src/sketch/document.js";
import { planes } from "../.cache/sketch-tests/src/sketch/planes.js";
import { openDocument } from "./native-documents.mjs";
import { changeScale } from "./ui-interface-scale.mjs";

// Real scaled rows, wrapped headers and panel chrome determine available space.
// Pure layout math cannot catch Entities clipping the Other Tools row.
export async function toolboxViewportRoute(page, name) {
  const sketches = Array.from({ length: 30 }, (_, index) => ({
    ...emptySketch(planes.XY),
    curves: [
      {
        id: `circle-${index}`,
        kind: "circle",
        center: { x: index * 3, y: 0 },
        radius: 1,
        construction: false,
      },
    ],
  }));
  await openDocument(page, {
    name: "toolbox-space.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(documentArchive({ units: "mm", sketches })),
  });
  for (const [width, height, scale, full] of [
    [1280, 850, 1, true],
    [1280, 720, 1, true],
    [1280, 850, 1.25, true],
    [1024, 950, 1.5, false],
    [1024, 1100, 1.5, true],
    [768, 1024, 1.5, false],
    [768, 1366, 1.5, true],
  ]) {
    await page.setViewportSize({ width, height });
    await changeScale(page, scale);
    await prioritySettled(page);
    const metrics = await viewportMetrics(page);
    assert.ok(metrics.entitiesScrolls, "Entities yields by scrolling its long list");
    assert.ok(metrics.toolsTop >= metrics.entitiesBottom, "Panels stay separate");
    assert.ok(metrics.toolsBottom <= height, JSON.stringify(metrics));
    if (full) assert.ok(!metrics.toolsScroll, "All tools fit without scrolling");
    if (metrics.toolsScroll)
      assert.ok(
        metrics.entitiesHeight <= metrics.minimumEntities + 1,
        "Tools scroll only after Entities yields everything below its title",
      );
    await page.locator('.toolbox-grid [data-menu="Other Tools"]').scrollIntoViewIfNeeded();
    const reachable = await viewportMetrics(page);
    assert.ok(reachable.otherBottom <= reachable.gridBottom + 1, "Other Tools remains reachable");
    await page.screenshot({
      path: `.cache/sketch-review/${name}-toolbox-space-${width}-${height}-${scale}.png`,
    });
  }
  await changeScale(page, 1);
  await page.setViewportSize({ width: 1280, height: 850 });
  console.log(
    `${name}: toolbox has priority over scrolling Entities across viewport and scale changes`,
  );
}

async function prioritySettled(page) {
  await page.waitForFunction(() => {
    const entities = document.querySelector(".entity-viewer"),
      grid = document.querySelector(".toolbox-grid");
    const style = getComputedStyle(entities);
    const minimum =
      entities.querySelector("h2").getBoundingClientRect().height +
      ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce(
        (sum, key) => sum + Number.parseFloat(style[key]),
        0,
      );
    return (
      grid.scrollHeight <= grid.clientHeight + 1 ||
      entities.getBoundingClientRect().height <= minimum + 1
    );
  });
}
async function viewportMetrics(page) {
  return page.evaluate(() => {
    const entities = document.querySelector(".entity-viewer"),
      tools = document.querySelector(".toolbox"),
      grid = document.querySelector(".toolbox-grid");
    const style = getComputedStyle(entities);
    return {
      entitiesHeight: entities.getBoundingClientRect().height,
      minimumEntities:
        entities.querySelector("h2").getBoundingClientRect().height +
        ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce(
          (sum, key) => sum + Number.parseFloat(style[key]),
          0,
        ),
      entitiesBottom: entities.getBoundingClientRect().bottom,
      entitiesScrolls: entities.scrollHeight > entities.clientHeight,
      toolsScroll: grid.scrollHeight > grid.clientHeight + 1,
      toolsTop: tools.getBoundingClientRect().top,
      toolsBottom: tools.getBoundingClientRect().bottom,
      gridBottom: grid.getBoundingClientRect().bottom,
      otherBottom: grid.querySelector('[data-menu="Other Tools"]').getBoundingClientRect().bottom,
    };
  });
}
