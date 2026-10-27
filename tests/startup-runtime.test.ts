import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { NativeSolver } from "../src/backend/native-solver.js";
import type { SolverInput } from "../src/backend/solver-input.js";

test("startup loads the real calculators once without changing the document or history", async () => {
  const owner = new DocumentOwner();
  try {
    const before = structuredClone(owner.view);
    const first = owner.initialize();
    assert.equal(owner.initialize(), first);
    await first;
    assert.equal(owner.initialize(), first);
    assert.deepEqual(owner.view, before);
    const history = await owner.call({ kind: "read-history" });
    assert.deepEqual(history.history, []);
  } finally {
    owner.close();
  }
});

test("failed runtime startup can be retried without accepting any document edit", async () => {
  class RetrySolver extends NativeSolver {
    attempts = 0;
    override solve(input: SolverInput) {
      if (++this.attempts === 1) return Promise.reject(new Error("Startup unavailable"));
      return super.solve(input);
    }
  }
  const solver = new RetrySolver();
  const owner = new DocumentOwner(solver);
  try {
    const before = structuredClone(owner.view);
    await assert.rejects(owner.initialize(), /Startup unavailable/);
    await owner.initialize();
    assert.equal(solver.attempts, 2);
    assert.deepEqual(owner.view, before);
  } finally {
    owner.close();
  }
});
