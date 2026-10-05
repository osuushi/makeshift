import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchElectron } from "./native-documents.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function injectHost(app, root, executable) {
  await app.evaluate(
    async ({ app }, paths) => {
      const base = `${app.getAppPath()}/.build/host`;
      const require = process
        .getBuiltinModule("node:module")
        .createRequire(`${app.getAppPath()}/package.json`);
      const { AgentSetup } = require(`${base}/host/agent-setup.js`);
      const { AgentSession } = require(`${base}/host/agent-session.js`);
      const { CodexInstaller } = require(`${base}/host/codex-installer.js`);
      const { discoverCodex } = require(`${base}/host/codex-discovery.js`);
      const { NativeCalculator } = require(`${base}/backend/native-calculator.js`);
      const request = AgentSetup.prototype.request,
        sessionRequest = AgentSession.prototype.request;
      const calculate = NativeCalculator.prototype.calculate;
      const state = { attempts: 0, calculations: 0, installer: null, session: null, restore: null };
      NativeCalculator.prototype.calculate = function (...args) {
        state.calculations++;
        return calculate.apply(this, args);
      };
      AgentSession.prototype.request = function (...args) {
        state.session = this;
        return sessionRequest.apply(this, args);
      };
      AgentSetup.prototype.request = function (...args) {
        if (!state.installer) {
          state.installer = this.installer = new CodexInstaller({
            home: paths.root,
            env: { HOME: paths.root, PATH: "/usr/bin:/bin" },
            fetch: async () => {
              const attempt = ++state.attempts;
              if (attempt === 1) return new Response("fixture failure", { status: 403 });
              const script =
                attempt === 2 || attempt === 4
                  ? `#!/bin/sh\n/bin/sleep 90 &\nprintf '%s' "$!" > '${paths.root}/child-${attempt}'\nwait\n`
                  : "#!/bin/sh\nprintf 'Harmless fixture installation complete\\n'\n";
              return new Response(script);
            },
            verify: async (_preferences, cwd, env) => ({
              ...(await discoverCodex(
                { preset: "codex", executable: paths.executable, args: [], env: {} },
                cwd,
                env,
              )),
              source: "standalone",
            }),
          });
        }
        return request.apply(this, args);
      };
      state.restore = async (cancel = true) => {
        if (cancel) await state.installer?.cancel();
        AgentSetup.prototype.request = request;
        AgentSession.prototype.request = sessionRequest;
        NativeCalculator.prototype.calculate = calculate;
      };
      globalThis.agentSetupFixture = state;
    },
    { root, executable },
  );
}
async function readChild(root, attempt) {
  const file = join(root, `child-${attempt}`);
  for (let index = 0; index < 200; index++) {
    const pid = Number(await readFile(file, "utf8").catch(() => ""));
    if (pid > 0) return pid;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Owned installer fixture child did not start");
}
function assertDead(pid) {
  assert.throws(
    () => process.kill(pid, 0),
    { code: "ESRCH" },
    "Owned installer descendant drained",
  );
}
async function launchHome(root) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const home = await readFile(join(root, "launch-home"), "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    if (home) return home;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Owned fixture CLI did not record its launched Codex home");
}
async function setupRoute(page, app, root) {
  await page.getByRole("button", { name: "Open agent terminal", exact: true }).click();
  await page.locator(".agent-message").filter({ hasText: "Could not start" }).waitFor();
  await page.getByRole("button", { name: "Install Codex", exact: true }).click();
  await page.locator(".agent-setup-status").filter({ hasText: "HTTP 403" }).waitFor();
  await page.getByRole("button", { name: "Retry installation", exact: true }).click();
  const child = await readChild(root, 2);
  const blocked = await page.evaluate(() =>
    window.makeshiftAgent.request({ kind: "start", cols: 80, rows: 24 }),
  );
  assert.match(blocked.error, /Wait for or cancel Codex installation/);
  await chooseTool(page, "new document", "new");
  await page.waitForFunction(
    () =>
      !window
        .makeshiftInspect()
        .commands.some((command) => command.unavailable === "Switching tools…"),
  );
  assert.equal(
    (await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" }))).setup.phase,
    "installing",
    "New remains available without canceling unrelated setup",
  );
  await page.getByRole("button", { name: "Cancel installation", exact: true }).click();
  await page.locator(".agent-setup-status").filter({ hasText: "cancelled" }).waitFor();
  assertDead(child);
  await page.getByRole("button", { name: "Retry installation", exact: true }).click();
  await page.locator(".agent-setup-status").filter({ hasText: "0.159.2 is ready" }).waitFor();
  await page.getByRole("button", { name: "Use found CLI", exact: true }).click();
  await page
    .getByLabel("Environment · NAME=value, one per line")
    .fill(`PATH=/usr/bin:/bin\nMAKESHIFT_SETUP_MARKER=${join(root, "launch-home")}`);
  await page.getByRole("button", { name: "Launch Codex", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  await page.waitForFunction(
    () =>
      !document.querySelector(".agent-dock [data-stop]")?.disabled &&
      !document.querySelector(".agent-dock [data-settings]")?.disabled,
  );
  const status = await page.evaluate(() => window.makeshiftAgent.request({ kind: "settings" }));
  assert.equal(status.preferences.preset, "codex");
  const home = await launchHome(root);
  assert.ok(
    home.startsWith(status.workspace.replace(/\/workspace$/, "")),
    "Launch uses the owned document Codex home",
  );
  assert.notEqual(home, process.env.CODEX_HOME);
  assert.notEqual(
    home,
    status.stateDirectory,
    "Document launch is separate from machine-local configuration",
  );
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector(".agent-dock [data-stop]")?.disabled &&
      !document.querySelector(".agent-dock [data-start]")?.disabled,
  );
  assert.equal(
    (await page.evaluate(() => window.makeshiftAgent.request({ kind: "settings" }))).running,
    false,
  );
  assert.equal(await app.evaluate(() => globalThis.agentSetupFixture.calculations), 0);
}
async function hostGuards(app, page) {
  const rejected = await app.evaluate(async ({ BrowserWindow, app }) => {
    const preload = `${app.getAppPath()}/.build/host/preload.cjs`;
    const extra = new BrowserWindow({
      show: false,
      webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    try {
      await extra.loadURL("data:text/html,<p>isolated sender</p>");
      return await extra.webContents.executeJavaScript(
        "window.makeshiftAgent.request({kind:'install-codex'}).then(()=>false,error=>error.message)",
      );
    } finally {
      extra.destroy();
    }
  });
  assert.match(rejected, /Agent commands require the document window/);
  await app.evaluate(() => {
    const s = globalThis.agentSetupFixture.session;
    globalThis.agentSetupFixture.desktop = s.canUseDesktop;
    s.canUseDesktop = () => false;
  });
  try {
    const blocked = await page.evaluate(() =>
      window.makeshiftAgent.request({ kind: "install-codex" }),
    );
    assert.match(blocked.error, /controlled from the iPad/);
    assert.equal(await app.evaluate(() => globalThis.agentSetupFixture.attempts), 3);
  } finally {
    await app.evaluate(() => {
      const state = globalThis.agentSetupFixture;
      state.session.canUseDesktop = state.desktop;
    });
  }
}

assert.equal(process.platform, "darwin", "Host process-tree fixture currently runs on macOS only");
const root = await mkdtemp(join(tmpdir(), "makeshift-setup-host-"));
const executable = join(root, "fixture-codex");
let app, failure;
try {
  await writeFile(
    executable,
    '#!/bin/sh\nif [ "$1" = "--version" ]; then printf "codex-cli 0.159.2\\n"; exit 0; fi\nprintf "%s" "$CODEX_HOME" > "$MAKESHIFT_SETUP_MARKER"\nprintf "Fixture CLI: sign in using the separate configuration\\n"\nexec /bin/sleep 90\n',
    { mode: 0o700 },
  );
  app = await launchElectron({ args: ["."], env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" } });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  assert.equal(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    false,
  );
  await page.waitForFunction(() => Boolean(window.makeshiftInspect));
  await injectHost(app, root, executable);
  await page.evaluate(() =>
    window.makeshiftAgent.request({
      kind: "configure",
      preferences: {
        preset: "codex",
        executable: "/fixture/missing",
        args: [],
        env: { PATH: "/usr/bin:/bin" },
      },
    }),
  );
  await page.waitForFunction(() => Boolean(window.makeshiftInspect));
  const before = await page.evaluate(() => window.makeshiftInspect().document);
  await setupRoute(page, app, root);
  await hostGuards(app, page);
  assert.deepEqual(await page.evaluate(() => window.makeshiftInspect().document), before);
  await page.getByRole("button", { name: "Install Codex", exact: true }).click();
  const quitChild = await readChild(root, 4);
  await app.evaluate(async ({ dialog }) => {
    dialog.showMessageBox = async (_window, options) => ({
      response: options.buttons?.[0] === "Save" ? 2 : 0,
    });
    await globalThis.agentSetupFixture.restore(false);
  });
  await app.close();
  app = null;
  assertDead(quitChild);
  console.log(
    "hidden Electron: actual preload/IPC guards, fake installer failure/retry/New/cancel and app quit with drained owned children, verified temp CLI and separate Codex launch passed; zero geometry calculations, no vendor installer/auth",
  );
} catch (error) {
  console.error("Host fixture failure", error);
  if (app)
    console.error(
      await app
        .evaluate(() => ({
          attempts: globalThis.agentSetupFixture?.attempts,
          calculations: globalThis.agentSetupFixture?.calculations,
          setup: globalThis.agentSetupFixture?.installer?.status,
        }))
        .catch(String),
    );
  failure = error;
} finally {
  if (app) {
    const page = await app.firstWindow().catch(() => null);
    await page
      ?.waitForFunction(() => !document.querySelector(".agent-dock [data-settings]")?.disabled)
      .catch(() => {});
    await page?.evaluate(() => window.makeshiftAgent?.request({ kind: "stop" })).catch(() => {});
  }
  if (app)
    await app
      .evaluate(async () => {
        await globalThis.agentSetupFixture?.restore();
      })
      .catch(() => {});
  await app
    ?.evaluate(({ dialog }) => {
      dialog.showMessageBox = async (_window, options) => ({
        response: options.buttons?.[0] === "Save" ? 2 : 0,
      });
    })
    .catch(() => {});
  await app?.close().catch((error) => {
    if (!failure) failure = error;
    else console.error("Separate owned cleanup failure", error);
  });
  await rm(root, { recursive: true, force: true });
}

if (failure) throw failure;
