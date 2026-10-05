import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { App } from "electron";
import { defaultAgentPreferences } from "../src/agent/protocol.js";
import { AgentSettings } from "../src/host/agent-settings.js";
import { AgentSetup } from "../src/host/agent-setup.js";
import { CodexInstaller } from "../src/host/codex-installer.js";
import { runInstaller } from "../src/host/codex-installer-process.js";

async function until(condition: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Setup did not reach the expected observable state.");
}
const executable = { path: "/fixture/codex", version: "0.159.2", source: "standalone" as const };
const fakeDownload: typeof fetch = async () =>
  new Response("fixture installer text; never executed");

test("explicit install is asynchronous, bounded in output, verifies the destination and cleans its script", async () => {
  let downloads = 0,
    scriptPath = "",
    installed = false;
  const installer = new CodexInstaller({
    home: "/fixture-user",
    env: { HOME: "/fixture-user", PATH: "/bin", OPENAI_API_KEY: "never-pass" },
    fetch: async (url) => {
      downloads++;
      assert.equal(url, "https://chatgpt.com/codex/install.sh");
      return fakeDownload(url);
    },
    run: async (script, env, _signal, output) => {
      scriptPath = script;
      assert.match(await readFile(script, "utf8"), /never executed/);
      assert.equal((await stat(script)).mode & 0o777, 0o600);
      assert.equal(env.OPENAI_API_KEY, undefined);
      output("step\n".repeat(5000));
      installed = true;
    },
    verify: async (preferences) => {
      assert.equal(installed, true);
      assert.equal(preferences.executable, "/fixture-user/.local/bin/codex");
      return executable;
    },
  });
  assert.equal(downloads, 0, "constructing setup must never install automatically");
  installer.start();
  assert.equal(installer.active, true);
  await until(() => !installer.active);
  assert.equal(installer.status.phase, "ready");
  assert.equal(installer.status.output.length, 16384);
  assert.deepEqual(installer.status.executable, executable);
  await assert.rejects(access(scriptPath));
});

test("installer download failure offers retry; invalid resulting CLI is never marked ready", async () => {
  let count = 0;
  const installer = new CodexInstaller({
    fetch: async () =>
      ++count === 1 ? new Response("blocked", { status: 403 }) : fakeDownload("fixture"),
    run: async () => {},
    verify: async () => {
      throw new Error("Codex version unsupported.");
    },
  });
  installer.start();
  await until(() => !installer.active);
  assert.equal(installer.status.phase, "failed");
  assert.match(installer.status.message, /HTTP 403.*Retry/);
  installer.start();
  await until(() => !installer.active);
  assert.equal(installer.status.phase, "failed");
  assert.match(installer.status.message, /version unsupported/);
  assert.equal(installer.status.executable, undefined);
});

test("cancel and timeout drain a held installer without promoting a command", async () => {
  let stopped = false;
  const held: typeof runInstaller = async (_script, _env, signal) => {
    await new Promise<void>((_resolve, reject) =>
      signal.addEventListener(
        "abort",
        () => {
          stopped = true;
          reject(signal.reason);
        },
        { once: true },
      ),
    );
  };
  const installer = new CodexInstaller({ fetch: fakeDownload, run: held });
  installer.start();
  await until(() => installer.status.phase === "installing");
  assert.throws(() => installer.start(), /already/);
  await installer.cancel();
  assert.equal(stopped, true);
  assert.equal(installer.active, false);
  assert.equal(installer.status.phase, "cancelled");
  const timed = new CodexInstaller({ fetch: fakeDownload, run: held, timeout: 30 });
  timed.start();
  await until(() => !timed.active);
  assert.equal(timed.status.phase, "failed");
  assert.match(timed.status.message, /eight-minute limit/);
});

test("host setup excludes conflicting launch/config only, and quit cancels before retrying shutdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "makeshift-agent-setup-"));
  const app = new EventEmitter() as EventEmitter & { quit: () => void };
  let quit = false;
  app.quit = () => {
    quit = true;
  };
  const installer = new CodexInstaller({
    fetch: fakeDownload,
    run: async (_script, _env, signal) =>
      new Promise<void>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
      ),
  });
  try {
    const setup = new AgentSetup(new AgentSettings(root), app as unknown as App, installer);
    await setup.request({ kind: "install-codex" });
    await until(() => installer.status.phase === "installing");
    assert.equal(setup.conflicts({ kind: "start", cols: 80, rows: 24 }), true);
    assert.equal(
      setup.conflicts({ kind: "configure", preferences: defaultAgentPreferences }),
      true,
    );
    assert.equal(setup.conflicts({ kind: "read" }), false);
    assert.equal(setup.conflicts({ kind: "stop" }), false);
    let prevented = false;
    app.emit("before-quit", {
      preventDefault: () => {
        prevented = true;
      },
    });
    await until(() => quit);
    assert.equal(prevented, true);
    assert.equal(installer.active, false);
    await assert.rejects(
      setup.request({
        kind: "discover-codex",
        preferences: { ...defaultAgentPreferences, preset: "custom", executable: "/custom" },
      }),
      /Custom executable paths are unchanged/,
    );
  } finally {
    await installer.cancel();
    await rm(root, { recursive: true, force: true });
  }
});

test("owned Unix installer process cancellation kills its temporary descendant", {
  skip: process.platform === "win32",
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "makeshift-installer-process-"));
  const abort = new AbortController();
  try {
    const script = join(root, "fixture.sh"),
      pidFile = join(root, "child.pid");
    await writeFile(script, 'sleep 90 &\necho $! > "$FIXTURE_PID_FILE"\nwait\n');
    const running = runInstaller(
      script,
      { PATH: "/usr/bin:/bin", FIXTURE_PID_FILE: pidFile },
      abort.signal,
      () => {},
    );
    await until(async () => !!(await readFile(pidFile, "utf8").catch(() => "")));
    const child = Number(await readFile(pidFile, "utf8"));
    process.kill(child, 0);
    abort.abort(new Error("fixture cancellation"));
    await assert.rejects(running, /fixture cancellation/);
    await until(() => {
      try {
        process.kill(child, 0);
        return false;
      } catch {
        return true;
      }
    });
  } finally {
    abort.abort();
    await rm(root, { recursive: true, force: true });
  }
});
