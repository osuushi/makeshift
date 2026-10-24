import assert from "node:assert/strict";
import test from "node:test";

test("radius default, saved diameter, cross-window updates and denied storage", async () => {
  let saved: string | null = null;
  let denied = false;
  let storage = (_: { key: string | null; newValue: string | null }) => {};
  const globals = {
    localStorage: {
      getItem: () => {
        if (denied) throw new Error("denied");
        return saved;
      },
      setItem: (_: string, value: string) => {
        if (denied) throw new Error("denied");
        saved = value;
      },
    },
    window: {
      addEventListener: (_: string, callback: typeof storage) => {
        storage = callback;
      },
    },
  };
  const original = new Map(
    Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  try {
    const url = new URL("../src/preferences/radial-dimension.js", import.meta.url).href;
    const preference: typeof import("../src/preferences/radial-dimension.js") = await import(
      `${url}?initial`
    );
    assert.equal(preference.radialDimension(), "radius");
    assert.equal(preference.radialDisplay(6), 6);
    preference.setRadialDimension("diameter");
    assert.equal(saved, "diameter");
    assert.equal(preference.radialDisplay(6), 12);
    assert.equal(preference.radialRadius(12), 6);
    const reloaded: typeof preference = await import(`${url}?reload`);
    assert.equal(reloaded.radialDimension(), "diameter");
    storage({ key: "makeshift.radial-dimension", newValue: "radius" });
    assert.equal(reloaded.radialDimension(), "radius");
    storage({ key: "unrelated", newValue: "diameter" });
    assert.equal(reloaded.radialDimension(), "radius");
    denied = true;
    reloaded.setRadialDimension("diameter");
    assert.equal(reloaded.radialDimension(), "diameter");
    storage({ key: "makeshift.radial-dimension", newValue: "invalid" });
    assert.equal(reloaded.radialDimension(), "radius");
    storage({ key: null, newValue: null });
    assert.equal(reloaded.radialDimension(), "radius");
  } finally {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
