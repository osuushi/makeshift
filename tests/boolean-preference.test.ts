import assert from "node:assert/strict";
import test from "node:test";
import { BooleanPreference } from "../src/model/boolean-preference.js";

test("Boolean keep preferences are per mode and tolerate inaccessible persistence", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    const choice = new BooleanPreference();
    assert.equal(choice.get("subtract"), false);
    choice.set("subtract", true);
    assert.equal(choice.get("subtract"), true);
    assert.equal(choice.get("union"), false);
    assert.equal(choice.get("intersect"), false);
    choice.set("subtract", false);
    assert.equal(choice.get("subtract"), false);
    const saved = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => saved.set(key, value),
      },
    });
    choice.set("union", true);
    assert.equal(new BooleanPreference().get("union"), true);
    saved.set("makeshift.boolean.intersect.keep-originals", "malformed");
    assert.equal(new BooleanPreference().get("intersect"), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
