import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { close } from "./ui-helpers.mjs";
import { completed } from "./ui-reopen-cycle.mjs";
import { snapshot } from "./ui-reopen-guard-boundaries.mjs";
import { chooseTool, toolEnabled } from "./ui-tools.mjs";

/** Save/Open persists exact BRep and identities; native inspection rebuilds display derivatives. */
export async function reopenReplacementGuards(page, name) {
  await plate(page);
  const saved = (await completed(page)).document;
  assert.equal(await toolEnabled(page, "reopen last operation", "reopen-operation"), true);
  const path = resolve(`.cache/sketch-review/${name}-reopen-guard-saved.makeshift`);
  try {
    await saveDocument(page, path);
    await chooseTool(page, "new document", "new");
    const fresh = await completed(page);
    assert.equal(fresh.document.sketches.length, 0);
    assert.equal(fresh.document.bodies?.length ?? 0, 0);
    await replacementBlocked(page);
    await openDocument(page, path);
    await waitOpenedGeometry(page, saved);
    assertOpenedGeometry((await completed(page)).document, saved);
    await replacementBlocked(page);
  } finally {
    await rm(path, { force: true });
  }
  console.log(
    `${name}: actual Save/New/Open retains exact BRep/identities/native geometry; fresh owners cannot reopen`,
  );
}
async function waitOpenedGeometry(page, saved) {
  await page.waitForFunction((saved) => {
    const state = window.makeshiftInspect(),
      opened = state.document;
    if (
      state.busy ||
      state.interaction ||
      JSON.stringify(opened.sketches) !== JSON.stringify(saved.sketches)
    )
      return false;
    if (opened.bodies?.length !== saved.bodies?.length) return false;
    return saved.bodies.every((body, index) => {
      const next = opened.bodies[index];
      return (
        next.id === body.id &&
        next.brep === body.brep &&
        JSON.stringify(next.faces.map((face) => face.id)) ===
          JSON.stringify(body.faces.map((face) => face.id)) &&
        JSON.stringify(next.edges.map((edge) => edge.id)) ===
          JSON.stringify(body.edges.map((edge) => edge.id))
      );
    });
  }, saved);
}
function assertOpenedGeometry(opened, saved) {
  const { bodies: actual, ...actualContent } = opened,
    { bodies: expected, ...expectedContent } = saved;
  // Optional undefined members are absent in the real JSON file; every defined content field remains exact.
  assert.deepEqual(
    JSON.parse(JSON.stringify(actualContent)),
    JSON.parse(JSON.stringify(expectedContent)),
  );
  assert.equal(actual.length, 1);
  assert.equal(expected.length, 1);
  for (const [index, body] of actual.entries()) {
    const previous = expected[index];
    const { volume, center, bounds, faces, edges, ...identity } = body;
    const {
      volume: oldVolume,
      center: oldCenter,
      bounds: oldBounds,
      faces: oldFaces,
      edges: oldEdges,
      ...oldIdentity
    } = previous;
    assert.deepEqual(identity, oldIdentity);
    close(volume, oldVolume, `body${index} volume`);
    closeArray(center, oldCenter, `body${index} center`);
    closeArray(bounds, oldBounds, `body${index} bounds`);
    assert.equal(faces.length, 6);
    assert.equal(oldFaces.length, 6);
    assert.equal(edges.length, 12);
    assert.equal(oldEdges.length, 12);
    for (const [i, face] of faces.entries()) {
      const { signature, vertices, ...other } = face;
      const { signature: oldSignature, vertices: oldVertices, ...oldOther } = oldFaces[i];
      assert.deepEqual(other, oldOther);
      closeArray(signature, oldSignature, `body${index} face${i} signature`);
      closeArray(vertices, oldVertices, `body${index} face${i} vertices`);
    }
    for (const [i, edge] of edges.entries())
      assertPlateEdge(edge, oldEdges[i], `body${index} edge${i}`);
  }
}
/** This fixture's plate has twelve lines; exact BRep remains the geometry authority. */
function assertPlateEdge(edge, saved, label) {
  const { signature, points, curve, ...identity } = edge;
  const { signature: oldSignature, points: oldPoints, curve: oldCurve, ...oldIdentity } = saved;
  assert.deepEqual(identity, oldIdentity);
  closeArray(signature, oldSignature, `${label} signature`);
  closeArray(points, oldPoints, `${label} points`);
  assert.equal(curve?.kind, "line");
  assert.equal(oldCurve?.kind, "line");
  const { a, b, ...line } = curve,
    { a: oldA, b: oldB, ...oldLine } = oldCurve;
  assert.deepEqual(line, oldLine);
  for (const [actual, expected] of [
    [a, oldA],
    [b, oldB],
  ]) {
    assert.equal(actual.length, 3);
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    closeArray(actual, expected, `${label} line endpoint`);
  }
}
function closeArray(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label} length/order`);
  for (const [index, value] of actual.entries())
    close(value, expected[index], `${label}[${index}]`);
}
async function replacementBlocked(page) {
  assert.equal(await toolEnabled(page, "reopen last operation", "reopen-operation"), false);
  await page.locator("#world canvas").focus();
  const before = await snapshot(page);
  assert.ok(
    before.history.every((entry) => ["navigation", "selection"].includes(entry.operation.kind)),
  );
  await page.keyboard.press("Meta+r");
  assert.deepEqual(await snapshot(page), before);
}
