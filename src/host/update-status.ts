import { BrowserWindow } from "electron";
import type { DocumentCommand } from "../model/document-host.js";

const statusWindows = new Set<BrowserWindow>();

export function routeUpdateStatusCommand(command: DocumentCommand): boolean {
  const focused = BrowserWindow.getFocusedWindow();
  if (!focused || !statusWindows.has(focused)) return false;
  if (["quit", "restart-update", "new", "open"].includes(command)) return false;
  if (command === "close") focused.close();
  return true;
}

/** Nonmodal feedback for an explicitly requested update check. */
export class UpdateStatus {
  private window: BrowserWindow | undefined;
  private downloading = false;

  show(downloading: boolean): void {
    this.downloading = downloading;
    if (this.window) {
      this.render(this.window);
      if (process.env.MAKESHIFT_TEST_HIDDEN !== "1") {
        this.window.show();
        this.window.focus();
      }
      return;
    }
    const window = new BrowserWindow({
      title: "Software Update — Makeshift",
      width: 420,
      height: 210,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    this.window = window;
    statusWindows.add(window);
    window.setMenu(null);
    window.on("close", () => {
      if (this.window === window) this.window = undefined;
    });
    window.on("closed", () => {
      statusWindows.delete(window);
      if (this.window === window) this.window = undefined;
    });
    window.webContents.on("did-finish-load", () => {
      this.render(window);
      if (process.env.MAKESHIFT_TEST_HIDDEN !== "1") window.show();
    });
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`).catch(() => {
      if (!window.isDestroyed()) window.destroy();
    });
  }

  update(downloading: boolean): void {
    this.downloading = downloading;
    if (this.window) this.render(this.window);
  }

  close(): void {
    this.window?.destroy();
    this.window = undefined;
  }

  private render(window: BrowserWindow): void {
    if (window.isDestroyed()) return;
    const message = this.downloading ? "Downloading update…" : "Checking for updates…";
    void window.webContents
      .executeJavaScript(`document.querySelector('h1').textContent = ${JSON.stringify(message)}`)
      .catch(() => {});
  }
}

const page = `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Software Update — Makeshift</title>
<style>
:root { color-scheme: light dark; font: 13px system-ui; }
body { margin: 28px; }
h1 { font-size: 17px; font-weight: 600; margin: 0 0 18px; }
.update-track { height: 8px; overflow: hidden; border-radius: 4px; background: light-dark(#e0e3e7, #383c42); }
.update-travel { width: 100%; height: 100%; animation: update-travel 2.4s infinite; }
.update-bar { width: 24%; height: 100%; border-radius: 4px; background: light-dark(#287bc1, #68b7f5); animation: update-stretch 2.4s infinite; }
/* Wind up at each end, accelerate through the middle, then cushion the landing. */
@keyframes update-travel {
  0%, 50%, 100% { animation-timing-function: cubic-bezier(.4, 0, .8, 1); }
  0%, 100% { transform: translateX(3%); }
  8% { transform: translateX(1%); animation-timing-function: cubic-bezier(.65, 0, .25, 1); }
  42% { transform: translateX(75%); animation-timing-function: ease-out; }
  50% { transform: translateX(73%); }
  58% { transform: translateX(75%); animation-timing-function: cubic-bezier(.65, 0, .25, 1); }
  92% { transform: translateX(1%); animation-timing-function: ease-out; }
}
@keyframes update-stretch {
  0%, 50%, 100% { transform: scale(.9, 1); animation-timing-function: ease-in-out; }
  8%, 58% { transform: scale(.8, 1.15); animation-timing-function: ease-in; }
  25%, 75% { transform: scale(1.5, .72); animation-timing-function: ease-out; }
  42%, 92% { transform: scale(.8, 1.15); animation-timing-function: ease-out; }
}
@media (prefers-reduced-motion: reduce) {
  .update-travel { animation: none; transform: translateX(38%); }
  .update-bar { animation: none; }
}
p { opacity: .7; line-height: 1.5; }
</style></head><body>
<h1 role="status" aria-live="polite">Checking for updates…</h1>
<div class="update-track" role="progressbar" aria-label="Update in progress"><div class="update-travel"><div class="update-bar"></div></div></div>
<p>You can close this window and keep working.<br>We’ll let you know when the update is ready.</p>
</body></html>`;
