import type { AgentHost, AgentPreferences, AgentReply } from "./protocol.js";

export class AgentSetupControls {
  private section = document.createElement("fieldset");
  private waiting = false;
  private editVersion = 0;
  private requestVersion = 0;
  private latest: AgentReply = { running: false, workspace: null };
  constructor(
    private form: HTMLFormElement,
    host: AgentHost,
    preferences: () => AgentPreferences,
    private report: (error: unknown) => void,
    launch: () => Promise<void>,
  ) {
    const section = this.section;
    section.className = "agent-setup";
    section.innerHTML = `<legend>Set up Codex CLI</legend>
      <p>Find an existing Codex CLI or install the official standalone CLI for your user account. Installation may add Codex to your shell or user PATH.</p>
      <button type="button" data-find-codex>Find Codex</button>
      <button type="button" data-install-codex>Install Codex</button>
      <button type="button" data-cancel-codex hidden>Cancel installation</button>
      <p class="agent-setup-status" role="status"></p><pre class="agent-setup-output" hidden></pre>
      <button type="button" data-use-codex hidden>Use found CLI</button>
      <button type="button" data-launch-codex hidden>Launch Codex</button>
      <p>Launch opens Makeshift’s separate Codex configuration. Follow the CLI’s sign-in prompts; your app login is not copied. <a href="https://learn.chatgpt.com/docs/codex/cli" target="_blank" rel="noreferrer">Official installation instructions</a></p>`;
    form.prepend(section);
    this.button("find").onclick = () =>
      void this.begin(() => host.request({ kind: "discover-codex", preferences: preferences() }));
    this.button("install").onclick = () =>
      void this.begin(() => host.request({ kind: "install-codex" }));
    this.button("cancel").onclick = () =>
      void this.action(() => host.request({ kind: "cancel-codex-install" }));
    this.button("launch").onclick = () =>
      void this.action(async () => {
        const reply = await host.request({ kind: "configure", preferences: preferences() });
        if (!reply.error) await launch();
        return reply;
      });
    this.button("use").onclick = () => {
      const path = this.latest.setup?.executable?.path;
      if (path && !this.custom) this.executable.value = path;
      this.update(this.latest);
    };
    this.executable.addEventListener("input", () => {
      this.editVersion++;
      this.update(this.latest);
    });
    form.addEventListener("change", () => this.update(this.latest));
  }
  private element(selector: string): HTMLElement {
    const element = this.section.querySelector<HTMLElement>(selector);
    if (!element) throw new Error("Missing Codex setup control.");
    return element;
  }
  private button(name: string): HTMLButtonElement {
    return this.element(`[data-${name}-codex]`) as HTMLButtonElement;
  }
  private get executable(): HTMLInputElement {
    return this.form.elements.namedItem("executable") as HTMLInputElement;
  }
  private get custom(): boolean {
    return (this.form.elements.namedItem("preset") as HTMLSelectElement).value !== "codex";
  }
  reveal(): void {
    if (!this.custom) this.form.hidden = false;
  }
  update(reply: AgentReply): void {
    this.latest = reply;
    const setup = reply.setup;
    const active = !!setup && ["downloading", "installing", "verifying"].includes(setup.phase);
    const custom = this.custom;
    this.button("find").disabled = this.waiting || active || custom;
    this.button("install").disabled = this.waiting || active || custom || reply.running;
    this.button("cancel").hidden = !active;
    this.button("cancel").disabled = this.waiting;
    this.button("use").hidden =
      !setup?.executable || custom || this.executable.value === setup.executable.path;
    this.button("use").disabled = this.waiting || active;
    this.button("launch").hidden = !setup?.executable;
    this.button("launch").disabled = this.waiting || active || custom || reply.running;
    const installLabel =
      setup?.phase === "failed" || setup?.phase === "cancelled"
        ? "Retry installation"
        : "Install Codex";
    if (this.button("install").textContent !== installLabel)
      this.button("install").textContent = installLabel;
    this.element(".agent-setup-status").textContent = setup
      ? `${setup.message}${setup.executable ? ` ${setup.executable.path} (${setup.executable.source === "application" ? "installed application candidate" : setup.executable.source}).` : ""}`
      : "Find Codex or install the standalone CLI.";
    const output = this.element(".agent-setup-output");
    output.hidden = !setup?.output;
    output.textContent = setup?.output ?? "";
    if (
      !custom &&
      setup?.executable &&
      !this.waiting &&
      this.editVersion === this.requestVersion &&
      this.executable.value === "codex"
    )
      this.executable.value = setup.executable.path;
    this.button("use").hidden =
      !setup?.executable || custom || this.executable.value === setup.executable.path;
  }
  private begin(run: () => Promise<AgentReply>): Promise<void> {
    this.requestVersion = this.editVersion;
    return this.action(run);
  }
  private async action(run: () => Promise<AgentReply>): Promise<void> {
    this.waiting = true;
    this.update(this.latest);
    try {
      const reply = await run();
      if (reply.error) throw new Error(reply.error);
      this.update(reply);
    } catch (error) {
      this.report(error);
    } finally {
      this.waiting = false;
      this.update(this.latest);
    }
  }
}
