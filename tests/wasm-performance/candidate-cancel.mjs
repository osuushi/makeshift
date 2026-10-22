import assert from "node:assert/strict";
import { chromium } from "playwright";
import { square } from "../geometry-performance/cases.mjs";
import { browserClient, serve } from "./browser.mjs";

assert.equal(process.env.MAKESHIFT_BENCHMARK_CANDIDATES, "gpu");
const server = await serve();
const browser = await chromium.launch({ headless: true, channel: "chromium" });
const targets = await browser.newBrowserCDPSession();
const input = {
  kind: "extrude",
  profiles: [square(-10, -10, 20)],
  normal: [0, 0, 1],
  distance: 20,
  mode: "new",
  bodies: [],
  twist: { angle: 450, origin: [0, 0, 0] },
};
const workers = async () =>
  (await targets.send("Target.getTargets")).targetInfos.filter((target) =>
    /\/benchmark\/(kernel|candidate)-worker.mjs$/.test(target.url),
  );
let client;
try {
  client = await browserClient(browser, server.url);
  assert.equal(client.initialization.candidates.ready, true);
  assert.equal((await workers()).length, 2, "Both calculator and GPU worker should exist");
  const running = client.request(input).then(
    () => "completed",
    () => "closed",
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  await client.terminate();
  const deadline = performance.now() + 5000;
  while ((await workers()).length && performance.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal((await workers()).length, 0, "Terminating calculator must terminate its GPU child");
  await client.close();
  assert.equal(await running, "closed", "The cancelled operation must not complete");
  client = await browserClient(browser, server.url);
  const recovered = await client.request(input);
  assert.equal(recovered.reply.error, undefined);
  assert.ok(recovered.candidates.completed > 0);
  console.log("Calculator/GPU child termination and fresh-worker operation recovery passed");
} finally {
  await client?.close();
  await targets.detach();
  await browser.close();
  await server.close();
}
