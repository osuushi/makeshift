import assert from "node:assert/strict";
import { holdAcceptanceReply } from "./native-model-reply.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { close } from "./ui-helpers.mjs";
import { navigationIdle } from "./ui-navigation-history.mjs";
import { acceptedOperation, button, completed, ready } from "./ui-reopen-cycle.mjs";
import { reopen } from "./ui-reopen-first.mjs";
import { chooseTool, toolEnabled } from "./ui-tools.mjs";

export async function snapshot(page) {
  return page.evaluate(async () => {
    const state = window.makeshiftInspect();
    return {
      document: state.document,
      preview: state.preview,
      interaction: state.interaction,
      modelingSelection: state.modelingSelection,
      selectionTargets: state.selectionTargets,
      history: await window.makeshiftHistory(),
    };
  });
}
async function ownerSnapshot(page) {
  return page.evaluate(async () => {
    const call =
      window.makeshiftModel ??
      (async (request) => {
        const response = await fetch("/sketch-api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        return response.json();
      });
    const read = await call({ kind: "read" });
    const history = await call({ kind: "read-history" });
    if (read.error || history.error) throw new Error(read.error ?? history.error);
    return { document: read.view.data, history: history.history };
  });
}
export async function reopenModifierGuards(page, name) {
  await plate(page);
  await completed(page);
  assert.equal(await toolEnabled(page, "reopen last operation", "reopen-operation"), true);
  await page.locator("#world canvas").focus();
  const before = await snapshot(page);
  for (const modifiers of [{ repeat: true }, { altKey: true }, { shiftKey: true }]) {
    await page.locator("#world canvas").dispatchEvent("keydown", {
      key: "r",
      metaKey: true,
      ...modifiers,
    });
    assert.deepEqual(await snapshot(page), before);
  }
  await page.keyboard.press("Meta+Alt+r");
  assert.deepEqual(await snapshot(page), before);
  console.log(
    `${name}: controlled DOM repeat/Alt/Shift and actual Alt-Cmd-R preserve exact owner/history/selection`,
  );
}
export async function reopenModalGuards(page, name) {
  await plate(page);
  await completed(page);
  const original = (await snapshot(page)).document;
  await reopen(page);
  const select = page.getByRole("combobox", { name: "Draft measurement", exact: true });
  assert.equal(await select.evaluate((element) => element.tagName), "SELECT");
  await select.focus();
  const before = await snapshot(page);
  assert.equal(before.interaction.kind, "extrude");
  await select.press("Meta+r");
  assert.deepEqual(await snapshot(page), before);
  await page.locator("#world canvas").focus();
  await page.keyboard.press("Meta+r");
  assert.deepEqual(await snapshot(page), before);
  // Read the modal admission reason only after the actual extrusion preview settles.
  const modal = await ready(page, "Accept extrusion");
  assert.equal(modal.interaction.kind, "extrude");
  assert.equal(
    modal.commands.find((c) => c.id === "reopen-operation").unavailable,
    "Finish or cancel the current edit first",
  );
  await button(page, "Cancel extrusion").click();
  await completed(page);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await completed(page)).document, original);
  console.log(
    `${name}: native select and active ordinary Extrude own Cmd-R without changing lease/candidate/history`,
  );
}
export async function reopenNavigationGuard(page, name) {
  await plate(page);
  await navigationIdle(page);
  await page.locator("#world canvas").focus();
  await page.mouse.move(1000, 600);
  await page.mouse.down({ button: "right" });
  let before;
  try {
    await page.mouse.move(965, 580, { steps: 5 });
    before = await snapshot(page);
    const held = await page.evaluate(() => window.makeshiftInspect());
    assert.equal(held.camera.navigationPending, false);
    assert.equal(
      held.commands.find((c) => c.id === "reopen-operation").unavailable,
      "Release navigation first",
    );
    await page.keyboard.press("Meta+r");
    assert.deepEqual(await snapshot(page), before);
    const after = await page.evaluate(() => window.makeshiftInspect());
    assert.deepEqual(after.camera, held.camera);
    await page.mouse.move(930, 560, { steps: 5 });
  } finally {
    await page.mouse.up({ button: "right" });
  }
  const final = await navigationIdle(page);
  assert.equal(final.interaction, null);
  assert.deepEqual(final.document, before.document);
  assert.deepEqual(final.modelingSelection, before.modelingSelection);
  assert.deepEqual(final.selectionTargets, before.selectionTargets);
  const entries = await page.evaluate(() => window.makeshiftHistory());
  const baseline = Math.max(0, ...before.history.map((entry) => entry.id));
  const added = entries.filter((entry) => entry.id > baseline);
  assert.deepEqual(
    added.map((entry) => [entry.operation.kind, entry.state, entry.outcome]),
    [],
  );
  console.log(`${name}: actual held pan retains camera capture and accepted geometry across Cmd-R`);
}
export async function reopenBusyGuard(page, name) {
  await plate(page);
  const original = (await completed(page)).document;
  const intent = await acceptedOperation(page, "extrude");
  await reopen(page);
  const candidate = (await ready(page, "Accept extrusion")).preview;
  assert.ok(candidate);
  assert.deepEqual(candidate.sketches, original.sketches);
  assert.equal(candidate.bodies.length, 1);
  close(candidate.bodies[0].volume, 4000, "independent accepted plate volume");
  candidate.bodies[0].bounds.slice(0, 3).forEach((min, index) => {
    close(
      candidate.bodies[0].bounds[index + 3] - min,
      [20, 20, 10][index],
      "independent plate span",
    );
  });
  const identities = [
    candidate.bodies[0].id,
    ...candidate.bodies[0].faces.map((face) => face.id),
    ...candidate.bodies[0].edges.map((edge) => edge.id),
  ];
  assert.ok(identities.every((id) => typeof id === "string" && id.length));
  assert.equal(new Set(identities).size, identities.length);
  const hold = await holdAcceptanceReply(page);
  try {
    await page.locator("#world canvas").focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => window.navigationAcceptanceReady && window.makeshiftInspect().busy,
    );
    const renderer = await snapshot(page),
      owner = await ownerSnapshot(page);
    assert.deepEqual(
      owner.document,
      candidate,
      "real owner accepted the current candidate, including topology IDs",
    );
    const latest = owner.history.findLast(
      (entry) =>
        entry.state === "applied" &&
        entry.outcome === "changed" &&
        !["navigation", "selection"].includes(entry.operation.kind),
    );
    assert.equal(latest.operation.kind, "extrude");
    assert.deepEqual(latest.operation.parameters, intent);
    assert.notDeepEqual(renderer.document, owner.document, "renderer publication is still held");
    assert.equal(
      (await page.evaluate(() => window.makeshiftInspect())).commands.find(
        (c) => c.id === "reopen-operation",
      ).unavailable,
      "Wait for the current calculation",
    );
    await page.keyboard.press("Meta+r");
    assert.deepEqual(await snapshot(page), renderer);
    assert.deepEqual(await ownerSnapshot(page), owner);
    assert.equal(await page.evaluate(() => window.makeshiftInspect().busy), true);
    await hold.release();
    assert.deepEqual((await completed(page)).document, owner.document);
  } finally {
    await hold.restore();
    await page.evaluate(() => {
      delete window.navigationAcceptanceReady;
    });
  }
  console.log(
    `${name}: controlled real acceptance-reply hold keeps busy guard and exact distinct owner/renderer snapshots`,
  );
}
