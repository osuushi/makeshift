import type { Terminal } from "ghostty-web";
import wasmUrl from "ghostty-web/ghostty-vt.wasm?url";
import { onThemeChange } from "../preferences/theme.js";
import { onUiScaleChange, uiScale } from "../preferences/ui-scale.js";
import type { AgentHost, AgentReply } from "./protocol.js";
import { terminalTheme } from "./terminal-theme.js";
import { terminalTouch } from "./terminal-touch.js";

export class AgentTerminal {
  private terminal: Terminal | null = null;
  private observer: ResizeObserver;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private focused = false;
  private disposeTheme = onThemeChange(() => {
    if (this.terminal) this.terminal.options.theme = terminalTheme();
  });
  private disposeScale: () => void;
  private ready: Promise<void>;
  private workspace: string | null = null;
  private disposeTouch: (() => void) | undefined;
  constructor(
    private element: HTMLElement,
    private host: AgentHost,
    private update: (reply: AgentReply) => void,
    private report: (error: unknown) => void,
    private attach: (files: File[]) => void,
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
    const { Ghostty, Terminal } = await import("ghostty-web");
    const ghostty = await Ghostty.load(wasmUrl);
    if (this.disposed) return;
    const terminal = new Terminal({
      ghostty,
      fontSize: 13 * uiScale(),
      cursorBlink: this.focused,
      scrollback: 5000,
      theme: terminalTheme(),
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
    this.open(terminal);
    this.element.addEventListener("paste", this.pasteImages, true);
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
  private open(terminal: Terminal): void {
    const previous = document.activeElement;
    const focus = this.ownsInputIntent();
    terminal.open(this.element);
    // Ghostty focuses its editable host now and once more on a zero-delay timer.
    // Restore the user's target if they left/collapsed the pane while WASM loaded.
    setTimeout(() => {
      if (this.disposed || document.activeElement !== this.element) return;
      if (focus && this.element.clientHeight > 0) this.focus();
      else if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
    }, 0);
  }
  private ownsInputIntent(): boolean {
    const active = document.activeElement;
    return (
      this.element.contains(active) ||
      (!!active?.matches("[data-start], [data-collapse]") &&
        !!this.element.closest(".agent-dock")?.contains(active))
    );
  }
  private async paste(): Promise<void> {
    const reply = await this.host.request({ kind: "clipboard" });
    if (reply.error) throw new Error(reply.error);
    if (this.disposed) return;
    if (reply.clipboardImage !== undefined) {
      const bytes = Uint8Array.from(atob(reply.clipboardImage), (value) => value.charCodeAt(0));
      this.attach([new File([bytes], "clipboard-image.png", { type: "image/png" })]);
    } else if (reply.clipboardText !== undefined) this.terminal?.paste(reply.clipboardText);
    else this.terminal?.paste(await navigator.clipboard.readText());
  }
  private pasteImages = (event: ClipboardEvent): void => {
    const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (!files.length) return;
    // Capture before Ghostty consumes the event as text (also covers native Edit > Paste).
    event.preventDefault();
    event.stopImmediatePropagation();
    this.attach(files);
  };
  insert(value: string): void {
    if (!this.terminal || this.disposed) throw new Error("Wait for the agent terminal to open.");
    this.terminal.paste(value);
    this.focus();
  }
  focus(): void {
    if (this.disposed || this.element.clientHeight === 0) return;
    this.resize();
    this.element.querySelector("textarea")?.focus({ preventScroll: true });
  }
  setFocused(focused: boolean): void {
    this.focused = focused;
    // Ghostty's blur() only changes DOM focus; its renderer keeps blinking unless
    // we explicitly update this option. Preserve DOM focus across native window blur.
    if (this.terminal) this.terminal.options.cursorBlink = focused;
  }
  private async poll(): Promise<void> {
    if (this.disposed) return;
    let running = false;
    try {
      const reply = await this.host.request({ kind: "read", wait: true });
      if (this.disposed) return;
      running = reply.running;
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
    if (!this.disposed) this.timer = setTimeout(() => void this.poll(), running ? 16 : 100);
  }
  resize(): void {
    const terminal = this.terminal;
    const metrics = terminal?.renderer?.getMetrics();
    const { clientWidth: width, clientHeight: height } = this.element;
    if (!terminal || !metrics || width <= 0 || height <= 0) return;
    // FitAddon reserves space for a scrollbar already drawn inside the canvas,
    // and drops resize requests during its 50 ms lock without a trailing fit.
    const cols = Math.max(2, Math.floor(width / metrics.width));
    const rows = Math.max(2, Math.floor(height / metrics.height));
    if (cols !== terminal.cols || rows !== terminal.rows) terminal.resize(cols, rows);
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
    if (this.ownsInputIntent()) this.focus();
  }
  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.observer.disconnect();
    this.disposeScale();
    this.disposeTheme();
    this.disposeTouch?.();
    this.element.removeEventListener("paste", this.pasteImages, true);
    this.terminal?.dispose();
  }
}
