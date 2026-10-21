import assert from "node:assert/strict";
import test from "node:test";
import { OffsetQuantity } from "../src/model/offset-quantity.js";

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
