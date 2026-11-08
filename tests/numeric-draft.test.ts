import assert from "node:assert/strict";
import test from "node:test";
import { parseNumericDraft } from "../src/sketch/numeric-draft.js";

test("numeric drafts preserve unfinished text and distinguish explicit zero and signed exponents", () => {
  for (const text of ["", " ", "-", "+", ".", "-.", "1e", "-1.5e+"])
    assert.deepEqual(parseNumericDraft(text), { kind: "unfinished", value: null });
  for (const text of ["Infinity", "-Infinity", "NaN", "2 mm", "1e999"])
    assert.deepEqual(parseNumericDraft(text), { kind: "invalid", value: null });
  for (const [text, value] of [
    ["0", 0],
    ["-2.5", -2.5],
    [" 1e-3 ", 0.001],
  ] as const)
    assert.deepEqual(parseNumericDraft(text), { kind: "value", value });
});
