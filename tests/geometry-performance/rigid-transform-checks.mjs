import assert from "node:assert/strict";

function compare(a, b, path = "reply") {
  if (typeof a === "number" && typeof b === "number") {
    assert.ok(
      Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)),
      `${path}: ${a} != ${b}`,
    );
  } else if (Array.isArray(a) && Array.isArray(b)) {
    assert.equal(a.length, b.length, `${path}.length`);
    a.forEach((value, i) => {
      compare(value, b[i], `${path}[${i}]`);
    });
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    assert.deepEqual(Object.keys(a), Object.keys(b), path);
    for (const key of Object.keys(a)) if (key !== "brep") compare(a[key], b[key], `${path}.${key}`);
  } else assert.deepEqual(a, b, path);
}
export function match(a, b) {
  try {
    compare(a, b);
    return "matched";
  } catch (error) {
    return error.message;
  }
}
export function volume(reply) {
  return reply.error ? null : reply.results.reduce((total, result) => total + result.volume, 0);
}
export function relative(a, b) {
  return a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b) || a === 0
    ? null
    : (b - a) / Math.abs(a);
}
export function history(reply, fixture) {
  if (reply.error) return "unavailable: native error";
  try {
    const copy =
      fixture.input.kind === "scale"
        ? false
        : fixture.input.kind === "mirror"
          ? fixture.input.keepOriginal
          : fixture.input.duplicate;
    assert.deepEqual(reply.participants, copy ? [] : [fixture.stock.body.id]);
    assert.equal(reply.results.length, 1);
    const result = reply.results[0];
    assert.equal(result.copy, copy);
    assert.deepEqual(result.predecessorBodies, [fixture.stock.body.id]);
    if (fixture.input.kind === "transform") {
      for (const field of ["faces", "edges"]) {
        const expected = fixture.stock.body[field].map(({ id }) => id).sort();
        const actual = result[field]
          .map(({ predecessors }) => {
            assert.equal(predecessors.length, 1);
            return predecessors[0];
          })
          .sort();
        assert.deepEqual(actual, expected);
      }
    }
    return "matched";
  } catch (error) {
    return error.message;
  }
}
export function exactBrep(a, b) {
  return a.error || b.error
    ? null
    : a.results.length === b.results.length &&
        a.results.every((result, i) => result.brep === b.results[i].brep);
}
