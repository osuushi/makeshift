import assert from "node:assert/strict";
import { openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";

// A selected sketch shares its midpoint with the front edge of its extrusion.
export async function hoverChangesGuideMeanings(page, name, archive) {
  await openDocument(page, {
    name: "guide-hover-transition.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(archive),
  });
  const midpoint = await project(page, [0, -16.5, 0]);
  const profile = await project(page, [-3, 5, 0]);
  const inside = { x: midpoint.x - 35, y: midpoint.y + 24 };
  const along = { x: midpoint.x - 31, y: midpoint.y + 7 };
  await page.mouse.click(profile.x, profile.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "profile");
  await page.mouse.move(inside.x, inside.y);
  const marker = await page.waitForFunction(
    ({ x, y }) =>
      Array.from(document.querySelectorAll(".guide-marker.ghost")).find(
        (node) =>
          !node.hidden &&
          node.style.pointerEvents === "auto" &&
          Math.hypot(
            Number.parseFloat(node.style.left) - x,
            Number.parseFloat(node.style.top) - y,
          ) < 1,
      ),
    midpoint,
  );
  assert.equal(await marker.evaluate((node) => !node.querySelector(".guide-count")), true);
  await page.waitForFunction((node) => node.style.opacity === "0.8", marker);
  await page.mouse.move(along.x, along.y);
  await page.waitForFunction(() => window.makeshiftInspect().modelingHover === "edge");
  assert.equal(
    await marker.evaluate((node) => node.isConnected && node.style.pointerEvents),
    "auto",
  );
  await page.waitForFunction(
    (node) => node.querySelector(".guide-count")?.textContent === "2",
    marker,
  );
  assert.equal(await marker.evaluate((node) => node.style.opacity), "0.8");
  await page.mouse.move(inside.x, inside.y);
  await page.waitForFunction((node) => !node.querySelector(".guide-count"), marker);
  assert.equal(
    await marker.evaluate((node) => node.isConnected && node.style.pointerEvents),
    "auto",
  );
  await page.mouse.move(along.x, along.y);
  await page.waitForFunction(
    (node) => node.querySelector(".guide-count")?.textContent === "2",
    marker,
  );
  await marker.asElement().click();
  const choices = page.getByRole("dialog", { name: "Choose guide meaning" });
  await choices.getByRole("button", { name: "Sketch curve midpoint", exact: true }).waitFor();
  await choices.getByRole("button", { name: "Edge midpoint", exact: true }).click();
  await page.waitForFunction(
    () => window.makeshiftInspect().document.guidePoints?.[0]?.anchor.kind === "body-edge",
  );
  await marker.dispose();
  console.log(
    `${name}: a stable midpoint stays clickable through a count change and saves the new meaning`,
  );
}

// The orbit captures the real pointer before the guide UI can receive motion.
export async function orbitPausesDiscovery(page, name, archive) {
  await openDocument(page, {
    name: "guide-orbit.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(archive),
  });
  const face = await project(page, [10, 10, 10]);
  await page.mouse.move(face.x, face.y);
  const ghost = page.locator(".guide-marker.ghost:visible").first();
  await ghost.waitFor({ state: "visible" });
  const marker = await ghost.boundingBox();
  assert.ok(marker);
  const x = marker.x + marker.width / 2;
  const y = marker.y + marker.height / 2;
  const before = (await inspect(page)).document;
  await page.mouse.move(x, y);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  try {
    await page.mouse.move(x + 12, y - 6);
    await page.waitForFunction(() => {
      const { camera } = window.makeshiftInspect();
      return camera.orbitActive && !camera.moving;
    });
    assert.equal(await page.locator(".guide-marker.ghost").count(), 0);
    await page.mouse.move(x + 24, y - 12);
    await page.waitForFunction(() => !window.makeshiftInspect().camera.moving);
    assert.equal(await page.locator(".guide-marker.ghost").count(), 0);
  } finally {
    await page.mouse.up();
    await page.keyboard.up("Meta");
  }
  assert.deepEqual((await inspect(page)).document, before);
  const moved = await project(page, [10, 10, 10]);
  await page.mouse.move(moved.x, moved.y);
  await ghost.waitFor({ state: "visible" });
  console.log(
    `${name}: a Command-drag from a ghost pauses discovery and renewed hover restores it`,
  );
}

// Verify the actual renderer can select and show Offset without executing discovery.
export async function deferredDiscovery(page, name, archive) {
  await openDocument(page, {
    name: "guide-deferred.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(archive),
  });
  const gate = await page.evaluateHandle(() => {
    const original = window.requestIdleCallback;
    const originalCancel = window.cancelIdleCallback;
    const pending = new Map();
    let next = 1;
    window.requestIdleCallback = (callback) => {
      const id = next++;
      pending.set(id, callback);
      return id;
    };
    window.cancelIdleCallback = (id) => pending.delete(id);
    return {
      count: () => pending.size,
      fallback: () => Reflect.set(window, "requestIdleCallback", undefined),
      release: () => {
        window.requestIdleCallback = original;
        window.cancelIdleCallback = originalCancel;
        for (const callback of pending.values()) {
          if (original) original(callback);
          else window.setTimeout(callback, 0);
        }
        pending.clear();
      },
    };
  });
  try {
    const face = await project(page, [10, 10, 10]);
    await page.mouse.move(face.x, face.y);
    await page.waitForFunction((gate) => gate.count() > 0, gate);
    await page.mouse.click(face.x, face.y);
    await page
      .getByRole("button", { name: "Offset faces", exact: true })
      .waitFor({ state: "visible" });
    assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
    assert.equal(await page.locator(".guide-marker.ghost").count(), 0);
    await gate.evaluate((gate) => gate.release());
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".guide-marker.ghost")].some(
        (node) =>
          node instanceof HTMLElement && !node.hidden && node.style.pointerEvents !== "none",
      ),
    );
    await gate.evaluate((gate) => gate.fallback());
    await page.mouse.move(1200, 780);
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".guide-marker.ghost")].every(
        (node) => node instanceof HTMLElement && node.style.pointerEvents === "none",
      ),
    );
    await page.mouse.move(face.x, face.y);
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".guide-marker.ghost")].some(
        (node) =>
          node instanceof HTMLElement && !node.hidden && node.style.pointerEvents !== "none",
      ),
    );
    console.log(
      `${name}: Offset paints while discovery is held; candidates arrive with idle and timer scheduling`,
    );
  } finally {
    await gate.evaluate((gate) => gate.release());
    await gate.dispose();
  }
}
