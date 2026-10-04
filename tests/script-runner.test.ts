import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { runScript } from "../src/agent-cli/run-script.js";
import { AgentConnection } from "../src/host/agent-connection.js";

for (const fails of [true, false]) {
  test(`runner retains ${fails ? "operation error" : "connection failure"} when a poll reply arrives first`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "makeshift-runner-test-"));
    const path = join(directory, "operation.ts");
    await writeFile(path, 'await makeshift.createSketch({plane:"XY", curves:[]});');
    let release!: () => void;
    const polled = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pending = false;
    let finished = false;
    const connection = await AgentConnection.create(async ({ script }) => {
      if (script?.action === "begin") return { token: "test-script", selection: [] };
      if (script?.action === "step") {
        pending = true;
        await polled;
        // The session can end before the original failed operation's response
        // reaches the CLI. Deliver its heartbeat failure first, deterministically.
        await delay(150);
        if (fails) throw new Error("Mesh fitting rejected invalid geometry");
        return { bodies: [] };
      }
      if (script?.action === "poll") {
        if (!pending) return { running: true };
        release();
        throw new Error("This script has ended or its connection has closed");
      }
      if (script?.action === "finish") finished = true;
      return { cancelled: true };
    });
    const prior = {
      MAKESHIFT_ENDPOINT: process.env.MAKESHIFT_ENDPOINT,
      MAKESHIFT_CAPABILITY: process.env.MAKESHIFT_CAPABILITY,
    };
    process.env.MAKESHIFT_ENDPOINT = connection.directory;
    process.env.MAKESHIFT_CAPABILITY = connection.capability;
    try {
      await assert.rejects(
        runScript(path),
        fails ? /Mesh fitting rejected invalid geometry/ : /connection has closed/,
      );
      assert(pending);
      assert.equal(finished, false);
    } finally {
      release();
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await connection.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
