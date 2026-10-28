import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runPreview } from "../src/agent-cli/preview.js";
import { AgentConnection } from "../src/host/agent-connection.js";

test("preview CLI dispatches and presets copy an image into the caller workspace", async () => {
  const cwd = process.cwd();
  const root = await mkdtemp(join(tmpdir(), "preview-cli-"));
  const oldEndpoint = process.env.MAKESHIFT_ENDPOINT;
  const oldCapability = process.env.MAKESHIFT_CAPABILITY;
  const connection = await AgentConnection.create((request) => {
    assert.equal(request.command, "preview");
    return JSON.parse(request.entity ?? "{}");
  });
  try {
    process.chdir(root);
    process.env.MAKESHIFT_ENDPOINT = connection.directory;
    process.env.MAKESHIFT_CAPABILITY = connection.capability;
    assert.deepEqual(await runPreview('{"action":"read"}'), { action: "read" });
    await writeFile("image.png", "fixture image");
    const opened = (await runPreview('{"action":"annotate","path":"image.png"}')) as {
      action: string;
      directory: string;
    };
    assert.equal(opened.action, "open");
    assert.equal(await readFile(join(opened.directory, "image.png"), "utf8"), "fixture image");
    assert.match(await readFile(join(opened.directory, "index.html"), "utf8"), /preview.write/);
  } finally {
    process.chdir(cwd);
    if (oldEndpoint === undefined) delete process.env.MAKESHIFT_ENDPOINT;
    else process.env.MAKESHIFT_ENDPOINT = oldEndpoint;
    if (oldCapability === undefined) delete process.env.MAKESHIFT_CAPABILITY;
    else process.env.MAKESHIFT_CAPABILITY = oldCapability;
    await connection.close();
    await rm(root, { recursive: true, force: true });
  }
});
