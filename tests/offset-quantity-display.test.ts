import assert from "node:assert/strict";
import test from "node:test";
import { OffsetQuantity } from "../src/model/offset-quantity.js";
import { setRadialDimension } from "../src/preferences/radial-dimension.js";

test("face offset presentation rounds noise without rounding geometry or typed values", () => {
  const quantity = new OffsetQuantity();
  quantity.mode = "thickness";
  quantity.thickness = { distance: 16.999999, slope: 1, face: "reference" };
  assert.equal(quantity.text(0), "17");
  assert.equal(quantity.value(0), 16.999999);
  assert.equal(quantity.text(0.123457), "17.123");
  assert.equal(quantity.distance(17.123456), 17.123456 - 16.999999);
  quantity.mode = "radius";
  quantity.radius = { radius: 1234.56789, outward: 1 };
  assert.equal(quantity.text(0), "1234.568");
  quantity.mode = "offset";
  assert.equal(quantity.text(-0.000001), "0");
  assert.equal(quantity.text(-1.23456), "-1.235");
  assert.equal(quantity.text(12.5), "12.5");
  assert.equal(quantity.text(NaN), "");
});

test("diameter presentation preserves outward offsets and excludes chamfer setbacks", () => {
  setRadialDimension("diameter");
  try {
    for (const outward of [1, -1] as const) {
      const quantity = new OffsetQuantity();
      quantity.mode = "radius";
      quantity.radius = { radius: 8, outward };
      assert.equal(quantity.text(0), "16");
      assert.equal(quantity.value(2), 16 + 4 * outward);
      assert.equal(quantity.distance(16 + 4 * outward), 2);
      assert.ok(Number.isNaN(quantity.distance(0)));
      quantity.setMode("offset");
      assert.equal(quantity.value(2), 2);
      assert.equal(quantity.distance(2), 2);
    }
    for (const chamfer of [false, true]) {
      const quantity = new OffsetQuantity();
      quantity.configure([], [], { radius: 3, outward: 1, faces: [], chamfer });
      assert.equal(quantity.radial, !chamfer);
      assert.equal(quantity.value(1), chamfer ? 2 : 4);
      assert.equal(quantity.distance(chamfer ? 2 : 4), 1);
      assert.deepEqual(
        quantity.finishInput(1),
        chamfer ? { radius: 2, chamfer: true } : { radius: 2 },
      );
      assert.equal(quantity.distance(0), 3);
    }
  } finally {
    setRadialDimension("radius");
  }
});
