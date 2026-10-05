import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

function fakeAgentHost() {
  let preferences = { preset: "codex", executable: "/fixture/missing", args: [], env: {} };
  let setup = {
    phase: "idle",
    message: "Find Codex or install the standalone CLI.",
    output: "",
  };
  let running = false,
    attempts = 0,
    timer;
  const status = () => ({ running, workspace: running ? "/fixture/workspace" : null, setup });
  window.agentSetupRequests = [];
  window.agentSetupReads = 0;
  window.makeshiftAgent = {
    request: async (request) => {
      if (!["read", "focus", "resize"].includes(request.kind))
        window.agentSetupRequests.push({
          kind: request.kind,
          phase: setup.phase,
          running,
          attempts,
        });
      if (request.kind === "read") window.agentSetupReads++;
      if (request.kind === "settings")
        return { ...status(), preferences, stateDirectory: "/fixture/separate-codex" };
      if (request.kind === "configure") {
        preferences = request.preferences;
        return { ...status(), preferences };
      }
      if (request.kind === "browse") return { ...status(), executable: "/fixture/browsed" };
      if (request.kind === "discover-codex") {
        if (!["/fixture/browsed", "codex"].includes(request.preferences.executable)) {
          setup = { phase: "failed", message: "Cannot use the configured Codex path.", output: "" };
          return {
            ...status(),
            error: "Cannot use the configured Codex path. Browse or install Codex.",
          };
        }
        setup = {
          phase: "ready",
          message: "Found Codex CLI0.159.2. Sign in using Makeshift’s separate configuration.",
          output: "",
          executable: { path: "/fixture/browsed", version: "0.159.2", source: "configured" },
        };
        return status();
      }
      if (request.kind === "start") {
        if (preferences.executable === "/fixture/missing")
          return {
            ...status(),
            error: "Could not start Codex. Find an executable or Install Codex.",
          };
        running = true;
        return status();
      }
      if (request.kind === "stop") {
        running = false;
        return status();
      }
      if (request.kind === "install-codex") {
        attempts++;
        setup = {
          phase: "installing",
          message: "Installing fixture…",
          output: "Fixture progress; no vendor installer executed.",
        };
        timer = setTimeout(
          () => {
            setup =
              attempts === 1
                ? {
                    phase: "failed",
                    message: "Fixture connection failed. Retry installation.",
                    output: setup.output,
                  }
                : {
                    phase: "ready",
                    message: "Verified Codex CLI0.159.2. Launch and sign in separately.",
                    output: setup.output,
                    executable: {
                      path: "/fixture/installed",
                      version: "0.159.2",
                      source: "standalone",
                    },
                  };
          },
          attempts === 2 ? 5000 : 250,
        );
        return status();
      }
      if (request.kind === "cancel-codex-install") {
        clearTimeout(timer);
        setup = {
          phase: "cancelled",
          message: "Fixture installation cancelled. Retry installation.",
          output: setup.output,
        };
        return status();
      }
      return status();
    },
  };
}

async function discoveryAndCustom(page) {
  await page.getByRole("button", { name: "Open agent terminal", exact: true }).click();
  await page.locator(".agent-message").filter({ hasText: "Could not start" }).waitFor();
  const form = page.locator(".agent-settings");
  assert.equal(await form.isVisible(), true, "Missing launch reveals usable setup controls");
  await page.getByRole("button", { name: "Find Codex", exact: true }).click();
  await page.locator(".agent-message").filter({ hasText: "configured Codex path" }).waitFor();
  await page.getByRole("button", { name: "Browse…", exact: true }).click();
  await page.getByRole("button", { name: "Find Codex", exact: true }).click();
  await page.locator(".agent-setup-status").filter({ hasText: "0.159.2" }).waitFor();
  assert.equal(
    await page.getByLabel("Executable", { exact: true }).inputValue(),
    "/fixture/browsed",
  );
  assert.equal(await page.getByRole("button", { name: "Install Codex", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Launch Codex", exact: true }).count(), 0);
  await page.getByLabel("Executable", { exact: true }).fill("/fixture/manual");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  assert.equal(await page.locator(".agent-settings").isVisible(), false);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  const configured = await page.evaluate(() => window.makeshiftAgent.request({ kind: "settings" }));
  assert.equal(configured.preferences.preset, "codex");
  assert.equal(
    configured.preferences.executable,
    "/fixture/manual",
    "Launch uses current explicit form path after discovery",
  );
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Stopped" }).waitFor();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Preset", { exact: true }).selectOption("custom");
  await page.getByLabel("Executable", { exact: true }).fill("/fixture/custom");
  assert.equal(
    await page.getByRole("button", { name: "Find Codex", exact: true }).isDisabled(),
    true,
  );
  assert.equal(await page.getByRole("button", { name: "Install Codex", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  assert.equal(
    (await page.evaluate(() => window.makeshiftAgent.request({ kind: "settings" }))).preferences
      .executable,
    "/fixture/custom",
  );
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Stopped" }).waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".agent-dock [data-settings]")?.disabled,
  );
}

async function installAndLaunch(page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Preset", { exact: true }).selectOption("codex");
  await page.getByLabel("Executable", { exact: true }).fill("codex");
  await page.getByRole("button", { name: "Find Codex", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.agent-settings [name="executable"]').value === "/fixture/browsed",
  );
  assert.equal(
    await page.getByLabel("Executable", { exact: true }).inputValue(),
    "/fixture/browsed",
    "Unedited default auto-configures verified discovery",
  );
  await page.getByLabel("Executable", { exact: true }).fill("/fixture/missing");
  await page.getByRole("button", { name: "Find Codex", exact: true }).click();
  await page.locator(".agent-message").filter({ hasText: "configured Codex path" }).waitFor();
  assert.equal(await page.getByLabel("Preset", { exact: true }).inputValue(), "codex");
  const install = page.getByRole("button", { name: "Retry installation", exact: true });
  assert.equal(await install.isEnabled(), true, "Completed Stop allows installation");
  const box = await install.boundingBox();
  const reads = await page.evaluate(() => window.agentSetupReads);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForFunction((reads) => window.agentSetupReads > reads, reads);
  await page.mouse.up();
  await page.waitForFunction(() =>
    window.agentSetupRequests.some((request) => request.kind === "install-codex"),
  );
  assert.equal(
    await page.evaluate(
      () => window.agentSetupRequests.filter((request) => request.kind === "install-codex").length,
    ),
    1,
    "One held pointer release across blur and polling admits exactly one install",
  );
  await page.locator(".agent-setup-status").filter({ hasText: "connection failed" }).waitFor();
  await page.getByRole("button", { name: "Retry installation", exact: true }).click();
  await page.getByRole("button", { name: "Cancel installation", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".agent-dock [data-start]")?.disabled);
  assert.equal(await page.getByRole("button", { name: "Start", exact: true }).isDisabled(), true);
  await chooseTool(page, "new document", "new");
  await page.waitForFunction(
    () =>
      !window
        .makeshiftInspect()
        .commands.some((command) => command.unavailable === "Switching tools…"),
  );
  await page.getByRole("button", { name: "Cancel installation", exact: true }).click();
  await page.locator(".agent-setup-status").filter({ hasText: "cancelled" }).waitFor();
  await page.getByRole("button", { name: "Retry installation", exact: true }).click();
  await page.getByLabel("Executable", { exact: true }).fill("/fixture/edited-during-install");
  await page.locator(".agent-setup-status").filter({ hasText: "Verified" }).waitFor();
  assert.equal(
    await page.getByLabel("Executable", { exact: true }).inputValue(),
    "/fixture/edited-during-install",
    "Ready publication preserves an explicit field edit",
  );
  await page.getByRole("button", { name: "Use found CLI", exact: true }).click();
  assert.equal(
    await page.getByLabel("Executable", { exact: true }).inputValue(),
    "/fixture/installed",
  );
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  assert.equal(await page.locator(".agent-settings").isVisible(), false);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Stopped" }).waitFor();
}

await withUiRuntimes(
  async (page, name) => {
    await page.addInitScript(fakeAgentHost);
    await page.reload();
    const before = (await inspect(page)).document;
    await discoveryAndCustom(page);
    try {
      await installAndLaunch(page);
    } catch (error) {
      console.log(
        name,
        "setup UI failure",
        await page.evaluate(async () => ({
          requests: window.agentSetupRequests,
          status: await window.makeshiftAgent.request({ kind: "settings" }),
          formHidden: document.querySelector(".agent-settings").hidden,
          preset: document.querySelector('.agent-settings [name="preset"]').value,
          executable: document.querySelector('.agent-settings [name="executable"]').value,
          installDisabled: document.querySelector("[data-install-codex]").disabled,
          text: document.querySelector(".agent-setup-status").textContent,
          message: document.querySelector(".agent-message").textContent,
        })),
      );
      throw error;
    }
    assert.deepEqual(
      (await inspect(page)).document,
      before,
      "Setup and fixture launch leave geometry unchanged",
    );
    console.log(
      `${name}: missing launch/discovery, Custom, install failure/retry/cancel/progress/New and separate launch UI passed using fake host only`,
    );
  },
  { allowed: ["chromium", "webkit"], defaults: ["chromium", "webkit"] },
);
