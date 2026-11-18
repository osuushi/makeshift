import "../preferences/theme.js";
import "../preferences/theme.css";
import "../security/content-prompt.css";
import { showContentPrompt } from "../security/content-prompt.js";
import type { ContentPrompt } from "../security/content-trust.js";

const host = (
  window as Window & {
    makeshiftTrustPrompt?: {
      read(): Promise<ContentPrompt>;
      choose(response: number): Promise<void>;
    };
  }
).makeshiftTrustPrompt;
if (host)
  void host.read().then(async (prompt) => {
    const choice = await showContentPrompt(prompt).catch((error) => {
      console.error(error);
      return prompt.cancelId;
    });
    await host.choose(choice);
  });
