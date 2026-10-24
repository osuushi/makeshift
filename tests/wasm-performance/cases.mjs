import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { kernelInput } from "../../.cache/sketch-tests/src/backend/kernel-input.js";
import { operand } from "../geometry-performance/client.mjs";

export const fixturePath = "tests/fixtures/ipad-two-arc-performance.json";

function verticalEdges(result, body) {
  return result.edges.flatMap((edge, index) =>
    edge.curve?.kind === "line" && Math.abs(edge.curve.a[2] - edge.curve.b[2]) > 9
      ? [{ body: body.id, edge: body.edges[index].id }]
      : [],
  );
}

async function result(client, input) {
  const { reply } = await client.request(input);
  assert.equal(reply.error, undefined, JSON.stringify(input.kind));
  return reply;
}

/** Reconstruct the captured pre-fillet operands; never replay obsolete topology IDs. */
export async function prepareCases(client) {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const extrusion = kernelInput(fixture.document, fixture.extrusion, []);
  const prism = (await result(client, extrusion)).results[0];
  const body = operand(prism, "captured-prism");
  const corners = verticalEdges(prism, body);
  assert.equal(corners.length, 2);
  const rim = prism.edges.findIndex(
    (edge) =>
      edge.curve?.kind === "arc" &&
      edge.curve.mid[0] > 20 &&
      Math.abs(edge.curve.mid[2] - fixture.extrusion.distance) < 1e-7,
  );
  assert.ok(rim >= 0, "Larger circular top rim from the capture");
  const rimRequest = {
    kind: "edge-finish",
    mode: "fillet",
    size: fixture.rimRadius,
    bodies: [body],
    edges: [{ body: body.id, edge: body.edges[rim].id }],
  };
  const rimmed = (await result(client, rimRequest)).results[0];
  const rimBody = operand(rimmed, "captured-rimmed");
  const selection = await result(client, {
    kind: "edge-finish-selection",
    mode: "fillet",
    bodies: [rimBody],
    edges: verticalEdges(rimmed, rimBody),
  });
  assert.equal(selection.edgeSelection.length, 4, "Both junction chains include their rim joins");
  const cornerRequest = {
    kind: "edge-finish",
    mode: "fillet",
    size: fixture.requestedRadius,
    bodies: [rimBody],
    edges: selection.edgeSelection,
  };
  return {
    fixture,
    cases: [
      { name: "extrude-10mm", input: extrusion },
      {
        name: "clean-corners-2mm",
        input: { ...cornerRequest, bodies: [body], edges: corners },
      },
      { name: "rim-0.0605mm", input: rimRequest },
      { name: "rimmed-corners-2mm", input: cornerRequest },
      {
        name: "rimmed-corners-limit",
        input: cornerRequest,
        limitDocument: { ...fixture.document, bodies: [{ ...rimBody, bounds: rimmed.bounds }] },
        expected: { results: [fixture.capturedResult] },
      },
    ],
  };
}
