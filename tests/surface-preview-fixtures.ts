import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import type { SurfaceEditRequest } from "../src/backend/surface-edits.js";
import { prism, square, vertical } from "./body-edge-fixtures.js";

export async function surfaceFixture(owner: DocumentOwner, kind: "offset" | "fillet" | "chamfer") {
  const body = await prism(owner, square);
  const face = body.faces.find((face) => face.plane && Math.abs(face.plane.origin[2] - 10) < 1e-6);
  assert.ok(face);
  const request: SurfaceEditRequest =
    kind === "offset"
      ? {
          kind: "offset-faces",
          operation: { faces: [{ body: body.id, face: face.id }], distance: 2 },
        }
      : {
          kind: "finish-edges",
          operation: {
            edges: [{ body: body.id, edge: vertical(body, 0, 0).id }],
            size: 2,
            mode: kind,
          },
        };
  return { body, request };
}

export function withValue(request: SurfaceEditRequest, value: number): SurfaceEditRequest {
  return request.kind === "offset-faces"
    ? { ...request, operation: { ...request.operation, distance: value } }
    : { ...request, operation: { ...request.operation, size: value } };
}
