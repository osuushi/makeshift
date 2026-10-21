import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { Client } from "../geometry-performance/client.mjs";
import { browserClient, serve } from "./browser.mjs";
import { compare, summarize } from "./measure.mjs";

// Negative radius throws Standard_ConstructionError inside OCCT's main module.
// Unknown operations and missing request fields exercise the side-module error routes.
const circle = (radius) => ({
  kind: "extrude",
  distance: 10,
  normal: [0, 0, 1],
  mode: "new",
  bodies: [],
  profiles: [
    {
      outer: [{ kind: "circle", center: [0, 0, 0], radius, normal: [0, 0, 1], axis: [1, 0, 0] }],
      holes: [],
    },
  ],
});
const invalid = [circle(-1), { kind: "unsupported" }, { ...circle(5), normal: undefined }];
const native = new Client(resolve(".build/kernel/bin/makeshift-kernel"), 1);
const expected = [];
let valid;
try {
  for (const input of invalid) {
    const { reply } = await native.request(input);
    assert.ok(Object.hasOwn(reply, "error"));
    expected.push(reply);
  }
  valid = summarize((await native.request(circle(5))).reply);
} finally {
  await native.close();
}
const server = await serve();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    let client;
    try {
      client = await browserClient(browser, server.url);
      for (const [index, input] of invalid.entries()) {
        assert.deepEqual((await client.request(input)).reply, expected[index]);
        compare(summarize((await client.request(circle(5))).reply), valid);
      }
      console.log(`${name}: OCCT/std exceptions caught; same-worker geometry recovers after each`);
    } finally {
      await client?.close();
      await browser.close();
    }
  }
} finally {
  await server.close();
}
