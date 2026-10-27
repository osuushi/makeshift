import "./style.css";
import "../preferences/theme.js";
import "../ipad/style.css";
import { connectBrowser } from "../ipad/browser-host.js";
import { showDesktopConnection } from "../ipad/desktop.js";
import { installEscapeAlias } from "./escape-key.js";

async function start(): Promise<void> {
  installEscapeAlias();
  const status = await window.makeshiftIPad?.status();
  if (status?.active) {
    showDesktopConnection(status);
    window.dispatchEvent(new Event("makeshift-ready"));
    return;
  }
  if (!window.makeshiftModel && (location.hash || sessionStorage.getItem("freac-pairing")))
    await connectBrowser();
  const main = await import("./main.js");
  await main.ready;
  window.dispatchEvent(new Event("makeshift-ready"));
}
void start().catch((error: unknown) => {
  console.error(error);
  window.dispatchEvent(
    new CustomEvent("makeshift-startup-error", {
      detail: error instanceof Error ? error.message : String(error),
    }),
  );
});
