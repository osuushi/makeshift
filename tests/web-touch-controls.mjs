import assert from "node:assert/strict";
import { penDriver } from "./ipad-pen.mjs";
import { at, inspect, reset, settled } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Native browser touch delivery must reach the shared camera/geometry capture
// listeners without desktop handoff. Unit tests cannot establish that ordering.
await withUiRuntimes(
  async (page) => {
    await reset(page);
    await checkTouchChrome(page);
    const camera = page.getByRole("button", { name: "Camera", exact: true });
    const pointer = page.getByRole("button", { name: "Pointer", exact: true });
    const cdp = await page.context().newCDPSession(page);
    const { touch, finger } = touchDriver(page, cdp);
    try {
      await chooseTool(page, "Sketch on XY", "sketch-xy");
      await page.keyboard.press("l");
      const pen = await penDriver(page, cdp);
      await pen([-20, -20], [-5, -20]);
      const before = await inspect(page);
      assert.equal(before.document.sketches[0].curves.length, 1, "Pencil creates geometry");
      await page.touchscreen.tap(420, 350);
      assert.deepEqual(
        (await inspect(page)).document,
        before.document,
        "Camera-mode finger tap does not edit",
      );
      await touch("touchStart", [[1, 420, 350]]);
      await touch("touchStart", [
        [1, 420, 350],
        [2, 620, 350],
      ]);
      await touch("touchMove", [
        [1, 400, 380],
        [2, 660, 380],
      ]);
      await page.waitForFunction(
        (height) => window.makeshiftInspect().camera.height < height,
        before.camera.height,
      );
      await touch("touchEnd", []);
      const navigated = await inspect(page);
      assert.notDeepEqual(navigated.camera.target, before.camera.target);
      assert.equal(navigated.activePlane, "XY");
      assert.deepEqual(navigated.document, before.document);
      await pointer.click();
      assert.equal(await pointer.getAttribute("aria-pressed"), "true");
      await finger([5, -20], [20, -20]);
      assert.equal(
        (await inspect(page)).document.sketches[0].curves.length,
        2,
        "Pointer mode creates with a finger",
      );
      await page.keyboard.press("v");
      const endpoint = (await inspect(page)).document.sketches[0].curves.at(-1).a;
      const point = await at(page, endpoint.x, endpoint.y);
      await page.touchscreen.tap(point.x, point.y);
      await finger([endpoint.x, endpoint.y], [endpoint.x, endpoint.y + 4]);
      const edited = await inspect(page);
      assert.ok(
        Math.abs(edited.document.sketches[0].curves.at(-1).a.y - endpoint.y - 4) < 0.001,
        "Finger reselects and moves geometry",
      );
      await page.reload();
      await settled(page);
      assert.equal(
        await pointer.getAttribute("aria-pressed"),
        "true",
        "Finger mode survives reload",
      );
      await camera.click();
      const cameraBefore = await inspect(page);
      await touch("touchStart", [[1, 520, 350]]);
      await touch("touchMove", [[1, 620, 410]]);
      await touch("touchEnd", []);
      await settled(page);
      const cameraAfter = await inspect(page);
      assert.notDeepEqual(
        cameraAfter.camera.position,
        cameraBefore.camera.position,
        "Camera toggle restores finger orbit",
      );
      assert.deepEqual(cameraAfter.document, cameraBefore.document);
      console.log(
        "Touch device defaults, Pencil editing, finger navigation and Pointer creation/re-edit passed",
      );
    } finally {
      await cdp.detach();
    }
  },
  { allowed: ["chromium"], hasTouch: true },
);

async function checkTouchChrome(page) {
  assert.equal(await page.evaluate(() => Boolean(window.makeshiftRemote)), false);
  const controls = page.getByTitle("Controls", { exact: true });
  assert.equal(await controls.innerText(), "Touch / Pencil");
  assert.equal(
    await page.getByRole("button", { name: "Camera", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await controls.click();
  assert.equal(await page.getByRole("button", { name: "Tablet", exact: true }).count(), 0);
  await page.keyboard.press("Escape");
}

function touchDriver(page, cdp) {
  const touch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 1, radiusY: 1, force: 1 })),
    });
  const finger = async (a, b) => {
    const start = await at(page, ...a),
      end = await at(page, ...b);
    await touch("touchStart", [[1, start.x, start.y]]);
    for (let i = 1; i <= 10; i++)
      await touch("touchMove", [
        [1, start.x + ((end.x - start.x) * i) / 10, start.y + ((end.y - start.y) * i) / 10],
      ]);
    await touch("touchEnd", []);
    await settled(page);
  };
  return { touch, finger };
}
