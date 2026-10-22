import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { Client } from "../geometry-performance/client.mjs";
import { prepareBroadCases } from "./broad-cases.mjs";
import { browserClient, serve } from "./browser.mjs";

const name = process.argv[2];
const directory = resolve(process.argv[3] ?? ".cache/wasm-performance/profiles");
if (!name) throw new Error("profile-browser.mjs CASE [DIRECTORY]");
const native = new Client(resolve(".build/kernel/bin/makeshift-kernel"), 1);
let scenario;
try {
  scenario = (await prepareBroadCases(native)).cases.find((c) => c.name === name);
  if (!scenario) throw new Error(`Unknown case ${name}`);
} finally {
  await native.close();
}
await mkdir(directory, { recursive: true });
const server = await serve();
let browser, client;
try {
  browser = await chromium.launch({ headless: true });
  client = await browserClient(browser, server.url);
  const cdp = await browser.newBrowserCDPSession();
  const { targetInfos } = await cdp.send("Target.getTargets");
  const target = targetInfos.find(
    (t) => t.type === "worker" && t.url.endsWith("kernel-worker.mjs"),
  );
  if (!target) throw new Error("Benchmark worker target not found");
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: false,
  });
  const send = workerCommands(cdp, sessionId);
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: 1000 });
  await send("Profiler.start");
  const result = await client.request(scenario.input);
  const { profile } = await send("Profiler.stop");
  await writeFile(`${directory}/${name}.chromium.cpuprofile`, JSON.stringify(profile));
  await writeFile(`${directory}/${name}.chromium.phases.txt`, result.phases);
  console.log(`${name}: ${profile.samples.length} samples; ${result.reply.error ?? "success"}`);
} finally {
  await client?.close();
  await browser?.close();
  await server.close();
}

function workerCommands(cdp, sessionId) {
  let sequence = 0;
  const pending = new Map();
  cdp.on("Target.receivedMessageFromTarget", (event) => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.accept(message.result);
  });
  return (method, params = {}) =>
    new Promise((accept, reject) => {
      const id = ++sequence;
      pending.set(id, { accept, reject });
      cdp
        .send("Target.sendMessageToTarget", {
          sessionId,
          message: JSON.stringify({ id, method, params }),
        })
        .catch(reject);
    });
}
