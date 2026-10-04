import assert from "node:assert/strict";
import test from "node:test";
import { documentFailure } from "../src/backend/document-failure.js";
import type { ModelRequest } from "../src/sketch/model-api.js";

test("allowance feedback only belongs to a failed Erode with a finite larger suggestion", () => {
  const request: ModelRequest = {
    kind: "erode",
    operation: { ids: ["body"], thickness: 4, allowance: 0.1, method: "accurate" },
  };
  for (const value of [undefined, null, "0.5", NaN, Infinity, -1, 0.1, 0.05]) {
    const error = new Error("Failed", { cause: { erosionAllowance: value } });
    assert.equal(documentFailure(error, request, false, false).erosionAllowance, undefined);
  }
  const error = new Error("Failed", { cause: { erosionAllowance: 0.55 } });
  assert.equal(documentFailure(error, request, false, false).erosionAllowance, 0.55);
  assert.equal(
    documentFailure(
      error,
      { ...request, operation: { ...request.operation, method: "fast" } },
      false,
      false,
    ).erosionAllowance,
    undefined,
  );
  assert.equal(documentFailure(error, request, true, false).erosionAllowance, undefined);
  assert.equal(documentFailure(error, request, false, true).erosionAllowance, undefined);
  assert.equal(documentFailure(error, { kind: "read" }, false, false).erosionAllowance, undefined);
});
