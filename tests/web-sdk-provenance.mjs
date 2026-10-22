import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { webBuildConfig } from "../scripts/web/config.mjs";
import { recordWebSdk } from "../scripts/web/sdk.mjs";

test("WASM SDK receipts reject cross-exception linking and altered libraries", async () => {
  const previous = process.env.MAKESHIFT_WEB_EXCEPTIONS;
  const sdk = await mkdtemp(resolve(tmpdir(), "makeshift-web-sdk-"));
  const script = `${sdk}-verify.cmake`;
  const verify = async (mode) => {
    await writeFile(
      script,
      `
set(OpenCASCADE_INSTALL_PREFIX "${sdk.replaceAll("\\", "/")}")
set(MAKESHIFT_WEB_WASM_EXCEPTIONS ${mode === "wasm" ? "ON" : "OFF"})
include("${resolve("native/web/verify-sdk.cmake").replaceAll("\\", "/")}")
verify_web_sdk()
`,
    );
    execFileSync("cmake", ["-P", script], { stdio: "pipe" });
  };
  try {
    delete process.env.MAKESHIFT_WEB_EXCEPTIONS;
    const defaultConfig = webBuildConfig();
    assert.equal(defaultConfig.exceptions, "wasm");
    process.env.MAKESHIFT_WEB_EXCEPTIONS = "wasm";
    assert.deepEqual(webBuildConfig(), defaultConfig);
    for (const mode of ["javascript", "wasm"]) {
      process.env.MAKESHIFT_WEB_EXCEPTIONS = mode;
      await writeFile(`${sdk}/library.a`, "test library bytes");
      await recordWebSdk(sdk);
      await verify(mode);
      await assert.rejects(verify(mode === "wasm" ? "javascript" : "wasm"), /recipe differs/);
      await writeFile(`${sdk}/library.a`, "modified library bytes");
      await assert.rejects(verify(mode), /SDK file changed/);
    }
    process.env.MAKESHIFT_WEB_EXCEPTIONS = "invalid";
    assert.throws(webBuildConfig, /must be javascript or wasm/);
  } finally {
    if (previous === undefined) delete process.env.MAKESHIFT_WEB_EXCEPTIONS;
    else process.env.MAKESHIFT_WEB_EXCEPTIONS = previous;
    await rm(sdk, { recursive: true, force: true });
    await rm(script, { force: true });
  }
});
