import { canonicalPlanes, resetCanonicalPlanes, setCanonicalPlanes } from "./canonical-planes.js";

export function canonicalPlaneSettings(): HTMLElement {
  const section = document.createElement("section");
  section.className = "view-display-settings";
  section.innerHTML = `<h3>Plane grids</h3>
    <p>The most face-on plane is shown. Grids blend smoothly when the view changes.</p>`;
  const palette = planePaletteSettings();
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset plane grids";
  reset.onclick = () => {
    resetCanonicalPlanes();
    update();
  };
  section.querySelector("h3")?.append(reset);
  section.append(palette);
  function update(): void {
    palette.dispatchEvent(new Event("palette-refresh"));
  }
  section.addEventListener("preferences-refresh", update);
  return section;
}

function planePaletteSettings(): HTMLElement {
  const section = document.createElement("div");
  section.className = "plane-palette-settings";
  const rows = (["XY", "XZ", "YZ"] as const).map((id) => {
    const row = document.createElement("label");
    row.innerHTML = `<span>${id}</span><input type="color" aria-label="${id} plane color">`;
    const input = row.querySelector("input");
    if (!input) throw new Error("Missing plane color");
    input.oninput = () =>
      setCanonicalPlanes({ colors: { ...canonicalPlanes().colors, [id]: input.value } });
    section.append(row);
    return { id, input };
  });
  const palette = document.createElement("select");
  palette.setAttribute("aria-label", "Saved plane palette");
  palette.onchange = () => {
    const colors = canonicalPlanes().palettes[palette.value];
    if (colors) setCanonicalPlanes({ colors });
    update();
  };
  const name = document.createElement("input");
  name.maxLength = 60;
  name.placeholder = "Palette name";
  name.setAttribute("aria-label", "Plane palette name");
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save palette";
  save.onclick = () => {
    const label = name.value.trim();
    if (!label) {
      name.focus();
      return;
    }
    const settings = canonicalPlanes();
    setCanonicalPlanes({ palettes: { ...settings.palettes, [label]: settings.colors } });
    update();
    palette.value = label;
    remove.disabled = false;
  };
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Delete palette";
  remove.onclick = () => {
    const palettes = canonicalPlanes().palettes;
    delete palettes[palette.value];
    setCanonicalPlanes({ palettes });
    update();
  };
  const saved = document.createElement("div");
  saved.className = "plane-palette-saved";
  saved.append(palette, remove);
  const create = document.createElement("div");
  create.className = "plane-palette-saved";
  create.append(name, save);
  section.append(saved, create);
  function update(): void {
    const settings = canonicalPlanes();
    for (const row of rows) row.input.value = settings.colors[row.id];
    const selected = palette.value;
    palette.replaceChildren(new Option("Choose a saved palette", ""));
    for (const label of Object.keys(settings.palettes)) palette.add(new Option(label, label));
    palette.value = Object.hasOwn(settings.palettes, selected) ? selected : "";
    remove.disabled = !palette.value;
  }
  // The containing panel owns refresh and lifecycle; no global retained DOM listeners.
  section.addEventListener("palette-refresh", update);
  update();
  return section;
}
