import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { box } from "./body-boolean-helpers.js";

test("experimental trim filtering preserves subtraction, contacts and reopen/Undo", async () => {
  const owner = new DocumentOwner();
  try {
    const stock = await box(owner, 0, 0, 10, 10);
    const cutter = await box(owner, 5, 0, 15, 10);
    const touching = await box(owner, 0, 10, 10, 20);
    const original = owner.view.data;
    for (const tool of [cutter, touching]) {
      const operation = {
        ids: [stock.id, tool.id],
        mode: "subtract" as const,
        keepOriginals: true,
      };
      const normal = await owner.call({ kind: "boolean-bodies", operation });
      assert.equal(normal.error, undefined);
      await owner.call({ kind: "cancel-preview" });
      const filtered = await owner.call({
        kind: "boolean-bodies",
        operation: { ...operation, experimentalTrimFiltering: true },
      });
      assert.equal(filtered.error, undefined);
      assert.deepEqual(
        filtered.view.candidate?.bodies?.map((b) => [b.volume, b.bounds]),
        normal.view.candidate?.bodies?.map((b) => [b.volume, b.bounds]),
      );
      await owner.call({ kind: "accept" });
      const request = owner.view.reopenOperation?.request;
      assert.equal(request?.kind, "boolean-bodies");
      if (request?.kind === "boolean-bodies")
        assert.equal(request.operation.experimentalTrimFiltering, true);
      const reopened = await owner.call({ kind: "reopen" });
      assert.equal(reopened.error, undefined);
      await owner.call({ kind: "accept" });
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, original);
    }
  } finally {
    owner.close();
  }
});
