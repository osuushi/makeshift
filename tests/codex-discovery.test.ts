import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import test from "node:test";
import { defaultAgentPreferences } from "../src/agent/protocol.js";
import { codexVersion, discoverCodex, standaloneCodexPath } from "../src/host/codex-discovery.js";
import { installerCommand, installerEnvironment } from "../src/host/codex-installer-process.js";

test("Codex probes recognize version and enforce the current Makeshift baseline", () => {
  assert.equal(codexVersion("codex-cli 0.155.1\n"), "0.155.1");
  assert.equal(codexVersion("codex-cli 0.159.2"), "0.159.2");
  assert.equal(codexVersion("codex-cli 1.0.0"), "1.0.0");
  assert.throws(() => codexVersion("codex-cli 0.155.0"), /0.155.1/);
  assert.throws(() => codexVersion("other-cli 5.0.0"), /identify/);
});

test("default discovery verifies candidates in order; explicit path failure never falls back", async () => {
  const seen: string[] = [];
  const result = await discoverCodex(
    defaultAgentPreferences,
    "/fixture",
    {},
    {
      platform: "darwin",
      home: "/user",
      resolve: async (path) => {
        seen.push(path);
        if (!path.includes("ChatGPT.app"))
          throw new Error("Executable was not found or is not executable.");
        return path;
      },
      probe: async () => "codex-cli 0.159.2",
    },
  );
  assert.equal(result.source, "application");
  assert.deepEqual(seen, [
    "codex",
    "/user/.local/bin/codex",
    "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex",
  ]);
  seen.length = 0;
  await assert.rejects(
    discoverCodex(
      { ...defaultAgentPreferences, executable: "/explicit/missing" },
      "/fixture",
      {},
      {
        platform: "darwin",
        home: "/user",
        resolve: async (path) => {
          seen.push(path);
          throw new Error("missing");
        },
      },
    ),
    /configured Codex path/,
  );
  assert.deepEqual(seen, ["/explicit/missing"]);
});

test("fallback ignores an unusable PATH command and checks the user application candidate", async () => {
  const probes: string[] = [];
  const result = await discoverCodex(
    defaultAgentPreferences,
    "/fixture",
    {},
    {
      platform: "darwin",
      home: "/user",
      resolve: async (path) => path,
      probe: async (path) => {
        probes.push(path);
        return path.startsWith("/user/Applications/") ? "codex-cli 0.159.2" : "codex-cli 0.100.0";
      },
    },
  );
  assert.equal(
    result.path,
    "/user/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex",
  );
  assert.equal(probes.length, 4);
});

test("standalone discovery executes only a temporary fixture version probe", {
  skip: process.platform === "win32",
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "makeshift-discovery-"));
  try {
    const path = join(root, "codex");
    await writeFile(
      path,
      '#!/bin/sh\nif [ -n "$OPENAI_API_KEY$CODEX_HOME" ]; then printf "wrong-cli 1.0\\n"; else printf "codex-cli 0.159.2\\n"; fi\n',
      { mode: 0o700 },
    );
    const result = await discoverCodex({ ...defaultAgentPreferences, executable: path }, root, {
      PATH: "/usr/bin:/bin",
      OPENAI_API_KEY: "must-not-leak",
      CODEX_HOME: "/embedding-profile",
    });
    assert.equal(result.path, path);
    assert.equal(result.version, "0.159.2");
    await writeFile(path, '#!/bin/sh\nprintf "other-cli 1.0\\n"\n');
    await assert.rejects(
      discoverCodex({ ...defaultAgentPreferences, executable: path }, root, {}),
      /identify/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("platform install plans use fixed direct arguments and retain custom configuration separation", () => {
  assert.equal(standaloneCodexPath("linux", "/user"), "/user/.local/bin/codex");
  assert.equal(
    standaloneCodexPath("win32", "C:\\Users\\a", "C:\\Local"),
    win32.join("C:\\Local", "Programs", "OpenAI", "Codex", "bin", "codex.exe"),
  );
  assert.deepEqual(installerCommand("darwin", "/tmp/a $`x.sh"), {
    executable: "/bin/sh",
    args: ["/tmp/a $`x.sh"],
  });
  assert.deepEqual(installerCommand("win32", "C:\\temp\\a.ps1"), {
    executable: "powershell.exe",
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "C:\\temp\\a.ps1",
    ],
  });
  assert.deepEqual(
    installerEnvironment({
      HOME: "/user",
      PATH: "/bin",
      CODEX_HOME: "/personal",
      OPENAI_API_KEY: "secret",
      CODEX_RELEASE: "override",
      OTHER_TOKEN: "secret",
      LOCALAPPDATA: "C:\\Local",
    }),
    { CODEX_NON_INTERACTIVE: "1", HOME: "/user", PATH: "/bin", LOCALAPPDATA: "C:\\Local" },
  );
});

test("Windows wrapper version probes use fixed system command arguments and sanitized environment", async () => {
  const path = "C:\\Program Files (x86)\\OpenAI\\codex.CMD";
  let calls = 0;
  const result = await discoverCodex(
    { ...defaultAgentPreferences, executable: path },
    "C:\\fixture",
    { PATH: "C:\\tools", SystemRoot: "C:\\renderer-override", OPENAI_API_KEY: "must-not-leak" },
    {
      platform: "win32",
      systemRoot: "D:\\Windows",
      resolve: async (path) => path,
      probeRunner: async (executable, args, options) => {
        calls++;
        assert.equal(executable, "D:\\Windows\\System32\\cmd.exe");
        assert.deepEqual(args, ["/d", "/s", "/c", `""${path}" --version"`]);
        assert.equal(options.windowsVerbatimArguments, true);
        assert.equal(options.timeout, 5000);
        assert.ok(options.env);
        assert.equal(options.env.OPENAI_API_KEY, undefined);
        return { stdout: "codex-cli 0.159.2" };
      },
    },
  );
  assert.equal(result.path, path);
  assert.equal(calls, 1);
});

test("Windows wrapper hazards are rejected before execution while native probes stay direct", async () => {
  let calls = 0;
  for (const character of ['"', "\r", "\n", "%", "!", "&", "|", "<", ">", "^"]) {
    await assert.rejects(
      discoverCodex(
        { ...defaultAgentPreferences, executable: `C:\\bad${character}path\\codex.bat` },
        "C:\\fixture",
        {},
        {
          platform: "win32",
          systemRoot: "C:\\Windows",
          resolve: async (path) => path,
          probeRunner: async () => {
            calls++;
            return { stdout: "codex-cli 0.159.2" };
          },
        },
      ),
      /unsupported command characters/,
    );
  }
  assert.equal(calls, 0);
  for (const platform of ["win32", "darwin", "linux"] as const) {
    const path = platform === "win32" ? "C:\\OpenAI\\codex.exe" : "/fixture/codex";
    await discoverCodex(
      { ...defaultAgentPreferences, executable: path },
      "/fixture",
      {},
      {
        platform,
        resolve: async (path) => path,
        probeRunner: async (executable, args, options) => {
          assert.equal(executable, path);
          assert.deepEqual(args, ["--version"]);
          assert.equal(options.windowsVerbatimArguments, false);
          calls++;
          return { stdout: "codex-cli 0.159.2" };
        },
      },
    );
  }
  assert.equal(calls, 3);
});
