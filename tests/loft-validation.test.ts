import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { circle, draw, preview } from "./loft-fixtures.js";

test("folded loft retains self-intersection rejection and recovers without changing accepted data", async () => {
  const owner = new DocumentOwner();
  try {
    // The third section folds back through the first span. Both construction
    // modes pass BRep/positive-volume checks, then fail self-intersection.
    const sources = [
      await draw(owner, circle(0, 5)),
      await draw(owner, circle(20, 8)),
      await draw(owner, circle(10, 10)),
    ];
    const data = owner.view.data;
    for (const ruled of [true, false]) {
      const reply = await owner.call({
        kind: "loft",
        operation: { sources, ruled, mode: "new" },
      });
      assert.match(reply.error ?? "", /non-intersecting solid/);
      assert.equal(reply.view.candidate, null);
      assert.deepEqual(owner.view.data, data);
    }
    const valid = await preview(owner, sources.slice(0, 2));
    assert.ok(valid.volume > 0);
    assert.deepEqual(owner.view.data, data);
  } finally {
    owner.close();
  }
});
