import "./style.css";
import { installWebModel } from "../web/start.js";
import { installEscapeAlias } from "./escape-key.js";

async function start(): Promise<void> {
  installEscapeAlias();
  installWebModel();
  await import("./main.js");
}
void start().catch((error: unknown) => {
  const app = document.querySelector("#app");
  if (!app) return;
  app.replaceChildren();
  const message = document.createElement("p");
  message.textContent = `Makeshift could not start: ${error instanceof Error ? error.message : String(error)}`;
  const retry = document.createElement("button");
  retry.textContent = "Reload";
  retry.onclick = () => location.reload();
  app.append(message, retry);
});
