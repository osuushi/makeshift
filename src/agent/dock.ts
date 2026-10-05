import { agentAttachments } from "./attachments.js";
import { dockLayout } from "./dock-layout.js";
import type { AgentHost, AgentReply } from "./protocol.js";
import { agentSettings, readPreferences } from "./settings.js";
import { AgentSetupControls } from "./setup.js";
import { AgentTerminal } from "./terminal.js";
import "./style.css";

export function installAgentDock(app: HTMLElement): () => void {
  const host = window.makeshiftAgent;
  if (!host) return () => {};
  const toggle = document.createElement("button");
  toggle.className = "agent-toggle";
  toggle.textContent = "Agent";
  toggle.setAttribute("aria-label", "Open agent terminal");
  (app.querySelector("header") ?? app).append(toggle);
  let dock: AgentDock | null = null;
  toggle.onclick = () => {
    dock ??= new AgentDock(app, host);
    toggle.hidden = true;
  };
  return () => {
    dock?.dispose();
    toggle.remove();
  };
}

class AgentDock {
  private panel = document.createElement("section");
  private layout: ReturnType<typeof dockLayout>;
  private terminal: AgentTerminal;
  private attachments: ReturnType<typeof agentAttachments>;
  private collapsed = false;
  private unread = false;
  private pending = false;
  private configuring = false;
  private launchOnReady = true;
  private setup: AgentSetupControls | null = null;
  private status: AgentReply = { running: false, workspace: null };
  constructor(
    app: HTMLElement,
    private host: AgentHost,
  ) {
    this.panel.className = "agent-dock";
    this.panel.setAttribute("aria-label", "Agent terminal");
    this.panel.innerHTML = `<div class="agent-header"><button data-collapse aria-label="Collapse agent terminal">−</button><strong>Agent</strong><span class="agent-status">Stopped</span><button data-attach>Attach file…</button><button data-position aria-label="Change agent dock position">Dock</button><button data-settings>Settings</button><button data-start>Start</button><button data-stop disabled>Stop</button></div>
      <div class="agent-body"><div class="agent-message" aria-live="polite"></div><div class="agent-screen"></div><p class="agent-workspace">Files and Codex conversations are included when you save.</p></div>`;
    document.body.append(this.panel);
    this.layout = dockLayout(this.panel, app);
    const settings = agentSettings(host, this.report, (value) => {
      this.configuring = value;
      this.update(this.status);
      if (!value && this.launchOnReady) {
        this.launchOnReady = false;
        void this.action(() => this.terminal.start());
      }
    });
    this.element(".agent-body").prepend(settings);
    this.setup = new AgentSetupControls(
      settings,
      host,
      () => readPreferences(settings),
      this.report,
    );
    this.attachments = agentAttachments(
      this.panel,
      host,
      (run) => this.action(run),
      (value) => this.terminal.insert(value),
      () => this.status.running,
    );
    this.button("attach").onclick = () => this.attachments.choose();
    this.button("recover").onclick = () =>
      void this.action(async () => {
        const reply = await host.request({ kind: "recover" });
        if (reply.error) throw new Error(reply.error);
        this.update(reply);
      });
    this.terminal = new AgentTerminal(
      this.element(".agent-screen"),
      host,
      this.update,
      this.report,
    );
    this.button("start").onclick = () => void this.action(() => this.terminal.start());
    this.button("stop").onclick = () =>
      void this.action(async () => {
        const reply = await host.request({ kind: "stop" });
        if (reply.error) throw new Error(reply.error);
        this.update(reply);
      });
    this.button("settings").onclick = () => {
      settings.hidden = !settings.hidden;
    };
    this.button("position").onclick = () => this.layout.toggleSide();
    this.button("collapse").onclick = this.collapse;
    const stopKeys = (event: KeyboardEvent) => event.stopPropagation();
    this.panel.addEventListener("keydown", stopKeys);
    this.panel.addEventListener("keyup", stopKeys);
    this.panel.addEventListener("focusin", this.focus);
    this.panel.addEventListener("focusout", () => queueMicrotask(this.focus));
  }
  private element(selector: string): HTMLElement {
    const result = this.panel.querySelector<HTMLElement>(selector);
    if (!result) throw new Error(`Missing agent control: ${selector}`);
    return result;
  }
  private button(name: string): HTMLButtonElement {
    return this.element(`[data-${name}]`) as HTMLButtonElement;
  }
  private report = (error: unknown): void => {
    if (error instanceof Error) this.setup?.reveal();
    this.element(".agent-message").textContent =
      error instanceof Error ? error.message : String(error);
  };
  private update = (reply: AgentReply): void => {
    this.status = reply;
    this.setup?.update(reply);
    this.unread ||= this.collapsed && !!reply.output;
    const installing =
      !!reply.setup && ["downloading", "installing", "verifying"].includes(reply.setup.phase);
    this.button("start").disabled = this.pending || this.configuring || reply.running || installing;
    this.button("stop").disabled = this.pending || this.configuring || !reply.running;
    this.button("settings").disabled = this.pending || this.configuring;
    this.button("attach").disabled = this.pending || this.configuring || !reply.running;
    this.element(".agent-status").textContent =
      `${reply.running ? "Running" : reply.exitCode === undefined ? "Stopped" : `Exited ${reply.exitCode}`}${this.unread ? " · New output" : ""}`;
    this.element(".agent-workspace").textContent = reply.workspace
      ? `Files and Codex conversations are included when you save. Workspace: ${reply.workspace}`
      : "Files and Codex conversations are included when you save.";
  };
  private async action(run: () => Promise<void>): Promise<void> {
    this.pending = true;
    this.update(this.status);
    this.report("");
    try {
      await run();
    } catch (error) {
      this.report(error);
    } finally {
      this.pending = false;
      this.update(this.status);
    }
  }
  private collapse = (): void => {
    this.collapsed = !this.collapsed;
    this.unread = false;
    this.layout.collapse(this.collapsed);
    this.button("collapse").textContent = this.collapsed ? "+" : "−";
    this.button("collapse").setAttribute(
      "aria-label",
      `${this.collapsed ? "Expand" : "Collapse"} agent terminal`,
    );
    this.update(this.status);
  };
  private focus = (): void => {
    void this.host
      .request({ kind: "focus", focused: this.panel.contains(document.activeElement) })
      .catch(this.report);
  };
  dispose(): void {
    this.attachments.dispose();
    this.terminal.dispose();
    this.layout.dispose();
    this.panel.remove();
  }
}
