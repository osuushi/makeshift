import {
  canonicalPlanes,
  planePresets,
  resetCanonicalPlanes,
  setCanonicalPlanes,
} from "./canonical-planes.js";

export function canonicalPlaneSettings(): HTMLElement {
  const section = document.createElement("section");
  section.className = "view-display-settings";
  section.innerHTML = `<h3>Canonical plane visibility</h3>
    <p>Planes fade as you look edge on. Thresholds use a percentage of the configured fill and grid visibility.</p>
    <label>Visibility preset<select aria-label="Plane visibility preset"><option value="custom">Custom</option><option value="focused">Usually one plane</option><option value="choice">Usually two planes</option></select></label>`;
  const preset = section.querySelector("select");
  if (!preset) throw new Error("Missing plane preset");
  preset.onchange = () => {
    if (preset.value === "focused" || preset.value === "choice")
      setCanonicalPlanes(planePresets[preset.value]);
    update();
  };
  const fields = [
    ["angleCutoff", "Angle cutoff", "Absolute dot product: 0 is edge on, 100% is head on."],
    [
      "fadeWidth",
      "Angular fade width",
      "Dot-product margin from the cutoff to full visibility. Zero gives a sharp angular boundary.",
    ],
    [
      "selectableMinimum",
      "Minimum selectable visibility",
      "Faint previews below this percentage cannot hover or intercept clicks. Zero allows any visible plane.",
    ],
    [
      "fullOpacityAbove",
      "Maximum preview visibility",
      "Above this percentage, target full configured opacity. 100% disables this jump; 0% jumps at first visibility.",
    ],
    [
      "fadeMilliseconds",
      "Fade time",
      "Smooth mixing time in milliseconds. Zero applies changes immediately.",
    ],
  ] as const;
  const rows = fields.map(([field, title, help]) => {
    const row = document.createElement("label");
    row.title = help;
    const time = field === "fadeMilliseconds";
    row.innerHTML = `<span>${title}</span><input type="range" min="0" max="${time ? 2000 : 100}" step="${time ? 10 : 0.1}" aria-label="${title}"><output></output>`;
    const input = row.querySelector("input"),
      output = row.querySelector("output");
    if (!input || !output) throw new Error("Missing plane visibility control");
    input.oninput = () => {
      setCanonicalPlanes({ [field]: Number(input.value) / (time ? 1 : 100) });
      update();
    };
    section.append(row);
    return { field, input, output, time };
  });
  const palettePanel = planePaletteSettings();
  section.append(palettePanel);
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset plane visibility";
  reset.onclick = () => {
    resetCanonicalPlanes();
    update();
  };
  section.append(reset);
  function update(): void {
    const settings = canonicalPlanes();
    if (preset)
      preset.value =
        Object.entries(planePresets).find(
          ([, p]) => p.angleCutoff === settings.angleCutoff && p.fadeWidth === settings.fadeWidth,
        )?.[0] ?? "custom";
    for (const row of rows) {
      row.input.value = String(settings[row.field] * (row.time ? 1 : 100));
      row.output.textContent = `${row.input.value}${row.time ? " ms" : "%"}`;
    }
    palettePanel.dispatchEvent(new Event("palette-refresh"));
  }
  section.addEventListener("preferences-refresh", update);
  update();
  return section;
}

function planePaletteSettings(): HTMLElement {
  const section = document.createElement("div");
  section.innerHTML = `<h3>Plane palette</h3>`;
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
  save.textContent = "Save plane palette";
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
  };
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Delete plane palette";
  remove.onclick = () => {
    const palettes = canonicalPlanes().palettes;
    delete palettes[palette.value];
    setCanonicalPlanes({ palettes });
    update();
  };
  section.append(palette, name, save, remove);
  function update(): void {
    const settings = canonicalPlanes();
    for (const row of rows) row.input.value = settings.colors[row.id];
    const selected = palette.value;
    palette.replaceChildren(new Option("Choose a saved palette", ""));
    for (const label of Object.keys(settings.palettes)) palette.add(new Option(label, label));
    palette.value = Object.hasOwn(settings.palettes, selected) ? selected : "";
  }
  // The containing panel owns refresh and lifecycle; no global retained DOM listeners.
  section.addEventListener("palette-refresh", update);
  update();
  return section;
}
