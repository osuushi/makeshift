import type { AgentHost, AgentPreferences } from "./protocol.js";

export function agentSettings(
  host: AgentHost,
  report: (error: unknown) => void,
  pending: (value: boolean) => void,
): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "agent-settings";
  form.hidden = true;
  form.innerHTML = `<label>Preset<select name="preset" aria-label="Preset"><option value="codex">Codex · separate configuration</option><option value="custom">Custom · ordinary environment</option></select></label>
    <label>Executable<input name="executable" placeholder="codex" required autocomplete="off"></label>
    <button type="button" data-browse>Browse…</button>
    <label>Arguments · one per line<textarea name="args" rows="2" spellcheck="false"></textarea></label>
    <label>Environment · NAME=value, one per line<textarea name="env" rows="3" spellcheck="false"></textarea></label>
    <p>Changes apply on the next launch. Codex login stays separate from your usual configuration. Personal skills are disabled for this launch; machine policy and built-in skills still apply.</p>
    <p class="agent-config-location"></p><button type="submit">Save settings</button>
    <button type="button" data-recover>Recover agent files…</button>`;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  const load = async () => {
    const reply = await host.request({ kind: "settings" });
    if (reply.error) throw new Error(reply.error);
    const p = reply.preferences;
    if (!p) throw new Error("Agent settings were not returned.");
    field("preset").value = p.preset;
    field("executable").value = p.executable;
    field("args").value = p.args.join("\n");
    field("env").value = Object.entries(p.env)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    const location = form.querySelector(".agent-config-location");
    if (location) location.textContent = `Codex configuration: ${reply.stateDirectory}`;
  };
  const browse = form.querySelector<HTMLButtonElement>("[data-browse]");
  if (!browse) throw new Error("Missing executable browser.");
  browse.onclick = () => {
    pending(true);
    void host
      .request({ kind: "browse" })
      .then((reply) => {
        if (reply.error) throw new Error(reply.error);
        if (reply.executable) {
          field("executable").value = reply.executable;
          field("executable").dispatchEvent(new Event("input", { bubbles: true }));
        }
      })
      .catch(report)
      .finally(() => pending(false));
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    let preferences: AgentPreferences;
    try {
      preferences = readPreferences(form);
    } catch (error) {
      report(error);
      return;
    }
    pending(true);
    void host
      .request({ kind: "configure", preferences })
      .then((reply) => {
        if (reply.error) throw new Error(reply.error);
        form.hidden = true;
        report("Settings saved. They apply on the next launch.");
      })
      .catch(report)
      .finally(() => pending(false));
  };
  pending(true);
  void load()
    .catch(report)
    .finally(() => pending(false));
  return form;
}

export function readPreferences(form: HTMLFormElement): AgentPreferences {
  const field = (name: string) => String(new FormData(form).get(name) ?? "");
  const env: Record<string, string> = {};
  for (const line of field("env")
    .split("\n")
    .filter((line) => line.trim())) {
    const equals = line.indexOf("=");
    if (equals < 1) throw new Error("Environment rows must use NAME=value.");
    env[line.slice(0, equals).trim()] = line.slice(equals + 1);
  }
  return {
    preset: field("preset") as AgentPreferences["preset"],
    executable: field("executable"),
    args: field("args")
      .split("\n")
      .filter((line) => line.length),
    env,
  };
}
