import type { FitAddon, Terminal } from "ghostty-web";
import wasmUrl from "ghostty-web/ghostty-vt.wasm?url";
import { onUiScaleChange, uiScale } from "../preferences/ui-scale.js";
import type { AgentHost, AgentReply } from "./protocol.js";
import { terminalTouch } from "./terminal-touch.js";

export class AgentTerminal {
  private terminal: Terminal | null = null;
  private fit: FitAddon | null = null;
  private observer: ResizeObserver;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private disposeScale: () => void;
  private ready: Promise<void>;
  private workspace: string | null = null;
  private disposeTouch: (() => void) | undefined;
  constructor(
    private element: HTMLElement,
    private host: AgentHost,
    private update: (reply: AgentReply) => void,
    private report: (error: unknown) => void,
  ) {
    this.disposeScale = onUiScaleChange(() => {
      if (this.terminal) this.terminal.options.fontSize = 13 * uiScale();
      this.resize();
    });
    this.ready = this.initialize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(element);
    void this.ready.then(() => this.poll()).catch(report);
  }
  private async initialize(): Promise<void> {
    const { FitAddon, Ghostty, Terminal } = await import("ghostty-web");
    this.fit = new FitAddon();
    const ghostty = await Ghostty.load(wasmUrl);
    if (this.disposed) return;
    const terminal = new Terminal({
      ghostty,
      fontSize: 13 * uiScale(),
      cursorBlink: true,
      scrollback: 5000,
      theme: {
        background: "#ffffff",
        foreground: "#283444",
        cursor: "#1769aa",
        selectionBackground: "#c9def2",
      },
    });
    this.terminal = terminal;
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.key.toLowerCase() === "v" && (event.metaKey || (event.ctrlKey && event.shiftKey))) {
        // Safari owns the iPad clipboard; let its normal paste event reach the terminal.
        if (window.makeshiftRemote) return false;
        void this.paste().catch(this.report);
        return true;
      }
      if (!event.metaKey || !["a", "z", "s", "o", "n", "w"].includes(event.key.toLowerCase()))
        return false;
      if (event.key.toLowerCase() === "a") terminal.selectAll();
      return true;
    });
    terminal.loadAddon(this.fit);
    terminal.open(this.element);
    this.disposeTouch = terminalTouch(this.element, terminal);
    terminal.onData((data) => {
      terminal.scrollToBottom();
      void this.host
        .request({ kind: "write", data })
        .then((reply) => {
          if (reply.error) this.report(reply.error);
        })
        .catch(this.report);
    });
    terminal.onResize(({ cols, rows }) => {
      if (cols >= 2 && rows >= 2)
        void this.host.request({ kind: "resize", cols, rows }).catch(this.report);
    });
    this.resize();
  }
  private async paste(): Promise<void> {
    const reply = await this.host.request({ kind: "clipboard" });
    if (reply.error) throw new Error(reply.error);
    if (reply.clipboardText !== undefined) this.terminal?.paste(reply.clipboardText);
    else this.terminal?.paste(await navigator.clipboard.readText());
  }
  insert(value: string): void {
    if (!this.terminal || this.disposed) throw new Error("Wait for the agent terminal to open.");
    this.terminal.paste(value);
    this.terminal.focus();
  }
  private async poll(): Promise<void> {
    if (this.disposed) return;
    try {
      const reply = await this.host.request({ kind: "read" });
      if (this.disposed) return;
      if (this.workspace && reply.workspace !== this.workspace) this.terminal?.reset();
      this.workspace = reply.workspace;
      if (reply.output && this.terminal) {
        const terminal = this.terminal;
        const offset = terminal.getViewportY();
        const length = terminal.buffer.active.length;
        terminal.write(reply.output);
        if (offset > 0 && terminal.buffer.active.type === "normal")
          terminal.scrollLines(-(offset + terminal.buffer.active.length - length));
      }
      this.update(reply);
    } catch (error) {
      this.report(error);
    }
    if (!this.disposed) this.timer = setTimeout(() => void this.poll(), 100);
  }
  resize(): void {
    if (this.terminal && this.element.clientWidth > 0 && this.element.clientHeight > 0)
      this.fit?.fit();
  }
  async start(): Promise<void> {
    await this.ready;
    if (!this.terminal || this.disposed) return;
    this.resize();
    const reply = await this.host.request({
      kind: "start",
      cols: this.terminal.cols,
      rows: this.terminal.rows,
    });
    if (reply.error) throw new Error(reply.error);
    this.terminal.write("\r\n\x1b[90m── Agent started ──\x1b[0m\r\n");
    this.update(reply);
    this.terminal.focus();
  }
  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.observer.disconnect();
    this.disposeScale();
    this.disposeTouch?.();
    this.terminal?.dispose();
  }
}
