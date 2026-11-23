import "./style.css";
import "../preferences/theme.js";
import { installEscapeAlias } from "./escape-key.js";

async function start(): Promise<void> {
  installEscapeAlias();
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
