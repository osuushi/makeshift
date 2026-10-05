import {
  decoratorDisplay,
  decoratorKinds,
  resetDecoratorDisplay,
  setDecoratorDisplay,
} from "./decorator-display.js";

export function decoratorSettings(): HTMLElement {
  const section = document.createElement("section");
  section.className = "decorator-display-settings";
  section.innerHTML = `<h3>Decorator previews</h3>
    <label>Preview detail<select aria-label="Decorator preview detail"><option value="detailed">Detailed</option><option value="color-only">Color only</option></select></label>
    <p>Color only marks attached faces without generating preview meshes. Mesh exports retain the full decoration. Previews are visual; select the original face to edit.</p>`;
  const mode = section.querySelector<HTMLSelectElement>("select");
  if (!mode) throw new Error("Missing decorator preview mode");
  const rows = decoratorKinds.map((kind) => {
    const title = { threads: "Threads", gear: "Gears", knurling: "Knurling", custom: "Custom" }[
      kind
    ];
    const row = document.createElement("div");
    row.className = "decorator-display-row";
    row.innerHTML = `<span>${title}</span><input type="color" aria-label="${title} preview color"><input type="text" class="decorator-color-value" aria-label="${title} preview hex color" maxlength="7" spellcheck="false"><label>Opacity<input type="range" min="20" max="100" step="1" aria-label="${title} preview opacity"><output></output></label>`;
    const color = row.querySelector<HTMLInputElement>("[type=color]");
    const opacity = row.querySelector<HTMLInputElement>("[type=range]");
    const hex = row.querySelector<HTMLInputElement>("[type=text]");
    const output = row.querySelector("output");
    if (!color || !opacity || !output || !hex)
      throw new Error("Missing decorator appearance controls");
    const change = () => {
      const next = decoratorDisplay();
      next.types[kind] = { color: color.value, opacity: Number(opacity.value) / 100 };
      setDecoratorDisplay(next);
      output.textContent = `${opacity.value}%`;
      hex.value = color.value;
    };
    color.oninput = opacity.oninput = change;
    hex.oninput = () => {
      if (!/^#[\da-f]{6}$/i.test(hex.value)) return;
      color.value = hex.value;
      change();
    };
    hex.onblur = () => {
      hex.value = color.value;
    };
    section.append(row);
    return { kind, color, opacity, output, hex };
  });
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset decorator display";
  section.append(reset);
  const update = () => {
    const value = decoratorDisplay();
    mode.value = value.mode;
    for (const row of rows) {
      row.color.value = value.types[row.kind].color;
      row.hex.value = row.color.value;
      row.opacity.value = String(Math.round(value.types[row.kind].opacity * 100));
      row.output.textContent = `${row.opacity.value}%`;
    }
  };
  mode.onchange = () => {
    const next = decoratorDisplay();
    next.mode = mode.value === "color-only" ? "color-only" : "detailed";
    setDecoratorDisplay(next);
  };
  reset.onclick = () => {
    resetDecoratorDisplay();
    update();
  };
  update();
  return section;
}
