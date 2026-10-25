import assert from "node:assert/strict";
import { openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";

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
        for (const callback of pending.values()) original(callback);
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
