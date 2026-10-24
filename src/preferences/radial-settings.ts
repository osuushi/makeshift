import { type RadialDimension, radialDimension, setRadialDimension } from "./radial-dimension.js";

export function radialSettings(): HTMLElement {
  const label = document.createElement("label");
  label.textContent = "Circular dimensions";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Circular dimensions");
  select.add(new Option("Radius (R)", "radius"));
  select.add(new Option("Diameter (Ø)", "diameter"));
  const refresh = () => {
    select.value = radialDimension();
  };
  select.addEventListener("preferences-refresh", refresh);
  select.onchange = () => setRadialDimension(select.value as RadialDimension);
  refresh();
  label.append(select);
  return label;
}
