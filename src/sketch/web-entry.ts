import "./style.css";
import "../preferences/theme.js";
import { installWebModel } from "../web/start.js";
import { installEscapeAlias } from "./escape-key.js";

async function start(): Promise<void> {
  installEscapeAlias();
  installWebModel();
  const main = await import("./main.js");
  await main.ready;
  window.dispatchEvent(new Event("makeshift-ready"));
}
void start().catch((error: unknown) => {
  window.dispatchEvent(
    new CustomEvent("makeshift-startup-error", {
      detail: error instanceof Error ? error.message : String(error),
    }),
  );
});
