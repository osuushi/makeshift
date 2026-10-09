import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import * as THREE from "three";
import { launchElectron } from "./native-documents.mjs";
import { drag } from "./ui-helpers.mjs";
import { navigationIdle, navigationRoundTrip } from "./ui-navigation-history.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { installTestFrames } from "./ui-test-frames.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function touchDriver(page, name) {
  if (name === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    const send = (type, points) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 1, radiusY: 1, force: 1 })),
      });
    return { send, dispose: () => cdp.detach() };
  }
  // Retain real WebKit pointer capture; classify a mouse stream as one finger.
  // WebKit SDK supplies taps, but no multi-contact drag delivery API.
  return {
    send: async (type, points) => {
      if (type === "touchStart") {
        await page.evaluate(() => {
          window.navigationTouch = true;
        });
        await page.mouse.move(points[0][1], points[0][2]);
        await page.mouse.down();
      } else if (type === "touchMove") await page.mouse.move(points[0][1], points[0][2]);
      else {
        await page.mouse.up();
        await page.evaluate(() => {
          window.navigationTouch = false;
        });
      }
    },
    dispose: async () => {},
  };
}
async function touchHandoff(page, touch) {
  await page.getByRole("button", { name: "Top view", exact: true }).dblclick();
  await navigationIdle(page);
  const { after } = await navigationRoundTrip(
    page,
    async () => {
      await touch.send("touchStart", [[1, 520, 350]]);
      await touch.send("touchMove", [[1, 560, 150]]);
      await touch.send("touchEnd", []);
    },
    "Two-axis touch handoff",
  );
  const camera = new THREE.PerspectiveCamera();
  camera.position.fromArray(after.camera.position);
  camera.up.fromArray(after.camera.up);
  camera.lookAt(new THREE.Vector3(...after.camera.target));
  for (const axis of [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
    const p = axis.applyQuaternion(camera.quaternion.clone().invert());
    assert.ok(Math.abs(p.x) < 1e-8 && p.y > 0, "Touch release aligns both axes");
  }
}

async function touchRoute(page, name) {
  const touch = await touchDriver(page, name);
  try {
    await navigationRoundTrip(
      page,
      async () => {
        await touch.send("touchStart", [[1, 520, 350]]);
        await touch.send("touchMove", [[1, 585, 390]]);
        await touch.send("touchEnd", []);
      },
      "One-finger orbit",
    );
    await touchHandoff(page, touch);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await navigationIdle(page);
    if (name === "chromium") {
      await navigationRoundTrip(
        page,
        async () => {
          await touch.send("touchStart", [[1, 420, 350]]);
          await touch.send("touchStart", [
            [1, 420, 350],
            [2, 620, 350],
          ]);
          await touch.send("touchMove", [
            [1, 400, 380],
            [2, 660, 380],
          ]);
          await touch.send("touchEnd", []);
        },
        "Two-finger pan/pinch",
      );
      const { before, after } = await navigationRoundTrip(
        page,
        async () => {
          await touch.send("touchStart", [[1, 420, 350]]);
          await touch.send("touchStart", [
            [1, 420, 350],
            [2, 620, 350],
          ]);
          await touch.send("touchMove", [
            [1, 423.407417, 324.118095],
            [2, 616.592583, 375.881905],
          ]);
          await page.waitForFunction(() => window.makeshiftInspect().camera.moving);
          await touch.send("touchMove", [
            [1, 449.289322, 279.289322],
            [2, 590.710678, 420.710678],
          ]);
          await touch.send("touchEnd", []);
        },
        "Two-finger twist",
      );
      assert.notDeepEqual(after.camera.up, before.camera.up);
      assert.equal(after.activePlane, before.activePlane, "Pair twist preserves workspace");
    }
    const history = await page.evaluate(() => window.makeshiftHistory());
    await touch.send("touchStart", [[1, 950, 650]]);
    await touch.send("touchEnd", []);
    await navigationIdle(page);
    assert.deepEqual(
      await page.evaluate(() => window.makeshiftHistory()),
      history,
      "Stationary contact adds no history",
    );
    console.log(
      `${name}: touch history passed (${name === "chromium" ? "SDK one/two-contact delivery" : "one-finger pointer classification; no multi-contact SDK"}); physical iPad unverified`,
    );
  } finally {
    await touch.dispose();
  }
}
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1", MAKESHIFT_DEV_URL: "" },
});
try {
  const desktop = await app.firstWindow();
  await desktop.setViewportSize({ width: 1280, height: 850 });
  await desktop.waitForFunction(() => Boolean(window.makeshiftInspect));
  assert.equal(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    false,
  );
  await navigationIdle(desktop);
  await chooseTool(desktop, "Sketch on XY", "sketch-xy");
  await desktop.keyboard.press("r");
  await drag(desktop, [-15, -10], [15, 10]);
  await desktop.getByRole("button", { name: "Trackpad", exact: true }).click();
  await desktop.getByRole("button", { name: "Tablet", exact: true }).click();
  const url = await desktop.locator(".ipad-addresses a").first().getAttribute("href");
  for (const name of runtimeNames(["chromium", "webkit"])) {
    const engine = { chromium, webkit }[name];
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 850 },
        hasTouch: true,
      });
      if (name === "webkit")
        await page.addInitScript(() => {
          for (const type of ["pointerdown", "pointermove", "pointerup", "click", "dblclick"])
            window.addEventListener(
              type,
              (event) => {
                if (!window.navigationTouch) return;
                Object.defineProperty(event, "pointerType", { value: "touch" });
                if (type === "pointermove" && !event.buttons) event.stopImmediatePropagation();
              },
              { capture: true },
            );
        });
      await installTestFrames(page);
      await page.goto(url);
      await page.waitForFunction(() => Boolean(window.makeshiftInspect));
      await navigationIdle(page);
      await touchRoute(page, name);
    } finally {
      await browser.close();
    }
    await desktop.getByText("Waiting for iPad · Scan to connect or reconnect").waitFor();
  }
} catch (error) {
  console.error("Tablet navigation route failed:", error);
  throw error;
} finally {
  await app.close();
}
