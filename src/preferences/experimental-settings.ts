const storageKey = "makeshift.fast-trim-checks";
let enabled = false;
try {
  enabled = localStorage.getItem(storageKey) === "true";
} catch {
  // Keep the window preference when storage is unavailable.
}

export function fastTrimChecks(): boolean {
  return enabled;
}

export function experimentalSettings(): HTMLElement {
  const section = document.createElement("section");
  section.innerHTML = `<h3>Experimental</h3>
    <label><span>Fast trim checks</span><input type="checkbox" aria-label="Fast trim checks"></label>
    <p>Try additional intersection filtering for new Subtract operations. Off by default.</p>`;
  const input = section.querySelector("input");
  if (!input) throw new Error("Missing experimental trim setting");
  input.checked = enabled;
  input.onchange = () => {
    enabled = input.checked;
    try {
      localStorage.setItem(storageKey, String(enabled));
    } catch {
      // Keep the window preference when storage is unavailable.
    }
  };
  return section;
}
