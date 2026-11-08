const key = "makeshift.bug-prebuffer";
const listeners = new Set<() => void>();
let enabled = false;
try {
  enabled = localStorage.getItem(key) === "true";
} catch {
  /* Window-local fallback. */
}
export const bugPrebuffer = () => enabled;
export function onBugPrebufferChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function bugRecordingSettings(): HTMLElement {
  const section = document.createElement("section");
  section.innerHTML = `<h3>Bug reports (desktop)</h3>
    <label><span>Keep recent video for bug reports</span><input type="checkbox" aria-label="Keep recent video for bug reports"></label>
    <p>Keep about 15 seconds of silent app video and input diagnostics in memory. Cmd/Ctrl-B records a report with microphone narration; press again to save, or Escape to cancel.</p>
    <p>Reports include visible window contents, typed keys, and model data. Nothing is uploaded automatically.</p>`;
  const input = section.querySelector("input");
  if (!input) throw new Error("Missing bug recording setting");
  input.checked = enabled;
  input.onchange = () => {
    enabled = input.checked;
    try {
      localStorage.setItem(key, String(enabled));
    } catch {
      /* Window-local fallback. */
    }
    for (const listener of listeners) listener();
  };
  const dispose = onBugPrebufferChange(() => {
    input.checked = enabled;
  });
  section.addEventListener("preferences-dispose", dispose, { once: true });
  return section;
}
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    enabled = event.newValue === "true";
    for (const listener of listeners) listener();
  });
