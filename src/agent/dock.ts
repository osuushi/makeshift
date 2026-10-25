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
  const dock = new AgentDock(app, host);
  return () => dock.dispose();
}

class AgentDock {
  private panel = document.createElement("section");
  private layout: ReturnType<typeof dockLayout>;
  private terminal: AgentTerminal | null = null;
  private attachments: ReturnType<typeof agentAttachments> | null = null;
  private collapsed = true;
  private disposed = false;
  private hostFocused = false;
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
    this.panel.innerHTML = `<div class="agent-header"><button data-collapse aria-label="Open agent terminal" aria-expanded="false">+</button><strong>Agent</strong><span class="agent-status">Stopped</span><button data-attach>Attach file…</button><button data-position aria-label="Change agent dock position">Dock</button><button data-settings>Settings</button><button data-start>Start</button><button data-stop disabled>Stop</button></div>
      <div class="agent-body"><div class="agent-message" aria-live="polite"></div><div class="agent-screen"></div><p class="agent-workspace">Files and Codex conversations are included when you save.</p></div>`;
    document.body.append(this.panel);
    this.layout = dockLayout(this.panel, app);
    this.button("collapse").onclick = this.collapse;
    this.element(".agent-header").onclick = () => {
      if (this.collapsed) this.collapse();
    };
    const stopKeys = (event: KeyboardEvent) => event.stopPropagation();
    this.panel.addEventListener("keydown", stopKeys);
    this.panel.addEventListener("keyup", stopKeys);
    this.panel.addEventListener("focusin", this.focus);
    this.panel.addEventListener("focusout", () => queueMicrotask(this.focus));
    window.addEventListener("focus", this.focus);
    window.addEventListener("blur", this.focus);
  }
  private initialize(): void {
    const host = this.host;
    const settings = agentSettings(host, this.report, (value) => {
      this.configuring = value;
      this.update(this.status);
      if (!value && this.launchOnReady) {
        this.launchOnReady = false;
        void this.action(async () => this.terminal?.start());
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
      (value) => this.terminal?.insert(value),
      () => this.status.running,
    );
    this.button("attach").onclick = () => this.attachments?.choose();
    this.button("recover").onclick = () =>
      void this.action(async () => {
        const reply = await host.request({ kind: "recover" });
        if (reply.error) throw new Error(reply.error);
        this.update(reply);
      });
    this.terminal = new AgentTerminal(
      this.element(".agent-screen"),
      this.host,
      this.update,
      this.report,
      (files) => this.attachments?.attach(files),
    );
    this.button("start").onclick = () => {
      // Move focus before pending state disables the button and the browser blurs it.
      this.terminal?.focus();
      void this.action(async () => this.terminal?.start());
    };
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
    this.text(
      ".agent-status",
      `${reply.running ? "Running" : reply.exitCode === undefined ? "Stopped" : `Exited ${reply.exitCode}`}${this.unread ? " · New output" : ""}`,
    );
    this.text(
      ".agent-workspace",
      reply.workspace
        ? `Files and Codex conversations are included when you save. Workspace: ${reply.workspace}`
        : "Files and Codex conversations are included when you save.",
    );
  };
  private text(selector: string, value: string): void {
    const element = this.element(selector);
    if (element.textContent !== value) element.textContent = value;
  }
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
  private collapse = (event?: MouseEvent): void => {
    event?.stopPropagation();
    this.collapsed = !this.collapsed;
    this.unread = false;
    this.layout.collapse(this.collapsed);
    this.button("collapse").textContent = this.collapsed ? "+" : "−";
    this.button("collapse").setAttribute(
      "aria-label",
      `${this.collapsed ? "Expand" : "Collapse"} agent terminal`,
    );
    this.button("collapse").setAttribute("aria-expanded", String(!this.collapsed));
    if (!this.collapsed) {
      if (!this.terminal) this.initialize();
      else this.terminal.focus();
    } else document.querySelector<HTMLElement>('canvas[aria-label="Modeling viewport"]')?.focus();
    this.update(this.status);
    this.focus();
  };
  private focus = (): void => {
    if (this.disposed) return;
    const focused =
      !this.collapsed && document.hasFocus() && this.panel.contains(document.activeElement);
    const terminal = focused && this.element(".agent-screen").contains(document.activeElement);
    this.terminal?.setFocused(terminal);
    this.panel.dataset.focus = terminal ? "terminal" : focused ? "controls" : "drawing";
    if (focused === this.hostFocused) return;
    this.hostFocused = focused;
    void this.host.request({ kind: "focus", focused }).catch(this.report);
  };
  dispose(): void {
    this.disposed = true;
    window.removeEventListener("focus", this.focus);
    window.removeEventListener("blur", this.focus);
    this.attachments?.dispose();
    this.terminal?.dispose();
    this.layout.dispose();
    this.panel.remove();
  }
}
