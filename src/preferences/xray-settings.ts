import { radialDisplay, radialName } from "./radial-dimension.js";
import { RadialInput } from "./radial-input.js";
import { setViewDisplay, viewDisplay } from "./view-display.js";

export function xraySettings(): HTMLElement {
  const section = document.createElement("section");
  section.className = "view-display-settings";
  section.innerHTML = `<h3>X-ray vision</h3>
    <label><span>Global</span><input type="checkbox" aria-label="Global X-ray vision"></label>`;
  const global = section.querySelector("input");
  if (!global) throw new Error("Missing Global X-ray control");
  global.onchange = () => setViewDisplay({ ...viewDisplay(), xrayGlobal: global.checked });
  const rows = (["sectionFrontOpacity", "bodyXrayOpacity", "xrayBleed", "xrayRadius"] as const).map(
    (field) => {
      const title =
        field === "sectionFrontOpacity"
          ? "X-ray front opacity"
          : field === "bodyXrayOpacity"
            ? "Body X-ray opacity"
            : field === "xrayBleed"
              ? "Bleed"
              : "Radius";
      const row = document.createElement("label");
      row.innerHTML = `<span>${title}</span><input type="range" min="0" max="100" step="1" aria-label="${title}"><output></output>`;
      const input = row.querySelector("input");
      const output = row.querySelector("output");
      if (!input || !output) throw new Error("Missing X-ray controls");
      const radial = field === "xrayRadius" ? new RadialInput(input, () => update()) : null;
      if (radial) {
        const control = document.createElement("div");
        control.className = "radial-slider";
        input.before(control);
        control.append(radial.button, input);
        section.addEventListener("preferences-dispose", () => radial.dispose(), { once: true });
      }
      input.oninput = () =>
        setViewDisplay({
          ...viewDisplay(),
          [field]:
            (radial ? radial.read() : Number(input.value)) / (field.endsWith("Opacity") ? 100 : 1),
        });
      section.append(row);
      return { field, input, output, radial, row };
    },
  );
  const hint = document.createElement("p");
  hint.textContent =
    "Body opacity controls X-ray bodies and their decorators independently of sketch X-ray. Bleed expands around contents; Radius softens the edge. Cross section always cuts globally.";
  section.append(hint);
  const update = () => {
    const value = viewDisplay();
    global.checked = value.xrayGlobal;
    for (const row of rows) {
      const opacity = row.field.endsWith("Opacity");
      if (row.radial) {
        row.input.max = String(radialDisplay(100));
        row.input.step = String(radialDisplay(1));
        const title = row.row.querySelector("span");
        if (title) title.textContent = radialName();
        row.radial.update();
      }
      row.input.value = String(
        Math.round(
          row.radial ? radialDisplay(value[row.field]) : value[row.field] * (opacity ? 100 : 1),
        ),
      );
      row.input.disabled = !opacity && value.xrayGlobal;
      row.output.textContent = `${row.input.value}${opacity ? "%" : " px"}`;
    }
  };
  section.addEventListener("preferences-refresh", update);
  update();
  return section;
}
