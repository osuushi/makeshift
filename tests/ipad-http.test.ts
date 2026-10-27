import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { serveIPad } from "../src/host/ipad-http.js";

test("iPad media supports WebKit range probes, suffixes, HEAD and invalid ranges", async () => {
  const root = await mkdtemp(join(tmpdir(), "makeshift-ipad-media-"));
  await writeFile(join(root, "print.mp4"), "0123456789");
  const server = createServer((request, response) => void serveIPad(root, request, response));
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/print.mp4`;
    const probe = await fetch(url, { headers: { Range: "bytes=0-1" } });
    assert.equal(probe.status, 206);
    assert.equal(probe.headers.get("content-type"), "video/mp4");
    assert.equal(probe.headers.get("content-range"), "bytes 0-1/10");
    assert.equal(await probe.text(), "01");
    const suffix = await fetch(url, { headers: { Range: "bytes=-3" } });
    assert.equal(await suffix.text(), "789");
    const end = await fetch(url, { headers: { Range: "bytes=8-100" } });
    assert.equal(await end.text(), "89");
    const head = await fetch(url, { method: "HEAD" });
    assert.equal(head.headers.get("content-length"), "10");
    assert.equal(await head.text(), "");
    for (const range of ["bytes=10-", "bytes=7-2", "bytes=", "bytes=0-1,4-5", "bytes=-0"]) {
      const invalid = await fetch(url, { headers: { Range: range } });
      assert.equal(invalid.status, 416, range);
      assert.equal(invalid.headers.get("content-range"), "bytes */10");
    }
    assert.equal(await (await fetch(url)).text(), "0123456789");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
